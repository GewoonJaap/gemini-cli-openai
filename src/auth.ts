import { Env, OAuth2Credentials } from "./types";
import {
	CODE_ASSIST_ENDPOINT,
	CODE_ASSIST_API_VERSION,
	OAUTH_CLIENT_ID,
	OAUTH_CLIENT_SECRET,
	OAUTH_REFRESH_URL,
	TOKEN_BUFFER_TIME,
	KV_TOKEN_KEY
} from "./config";

/**
 * Validates that an object conforms to the OAuth2Credentials interface.
 * @param credentials The object to validate
 * @param sourceName Name of the source for error reporting
 * @throws Error if validation fails
 */
function validateOAuth2Credentials(credentials: unknown, sourceName: string): OAuth2Credentials {
	// Check if it's an object
	if (typeof credentials !== "object" || credentials === null) {
		throw new Error(`${sourceName} must be a JSON object with OAuth2 credentials.`);
	}

	// Type guard to ensure credentials is an object with the right structure
	const creds = credentials as Record<string, unknown>;

	// Check required fields
	const requiredFields: (keyof OAuth2Credentials)[] = [
		"access_token",
		"refresh_token",
		"scope",
		"token_type",
		"id_token",
		"expiry_date"
	];

	const missingFields = requiredFields.filter((field) => {
		const value = creds[field];
		// Check if field exists and has valid type
		if (field === "expiry_date") {
			return value === undefined || typeof value !== "number" || isNaN(value);
		}
		return value === undefined || typeof value !== "string";
	});

	if (missingFields.length > 0) {
		throw new Error(
			`${sourceName} is missing required fields: ${missingFields.join(", ")}. ` +
				`OAuth2 credentials must include: ${requiredFields.join(", ")}`
		);
	}

	// Additional validation for string fields
	for (const field of ["access_token", "refresh_token", "scope", "token_type", "id_token"] as const) {
		const value = creds[field];
		if (typeof value !== "string" || value.trim() === "") {
			throw new Error(`${sourceName}.${field} must be a non-empty string`);
		}
	}

	// Additional validation for expiry_date
	const expiryDate = creds.expiry_date;
	if (typeof expiryDate !== "number" || isNaN(expiryDate) || expiryDate <= 0) {
		throw new Error(`${sourceName}.expiry_date must be a positive number`);
	}

	return {
		access_token: creds.access_token as string,
		refresh_token: creds.refresh_token as string,
		scope: creds.scope as string,
		token_type: creds.token_type as string,
		id_token: creds.id_token as string,
		expiry_date: creds.expiry_date as number
	};
}

// Auth-related interfaces
interface TokenRefreshResponse {
	access_token: string;
	expires_in: number;
}

interface CachedTokenData {
	access_token: string;
	expiry_date: number;
	cached_at: number;
}

interface TokenCacheInfo {
	cached: boolean;
	cached_at?: string;
	expires_at?: string;
	time_until_expiry_seconds?: number;
	is_expired?: boolean;
	message?: string;
	error?: string;
}

// Credential rotation interfaces
interface CredentialHealth {
	credentialIndex: number;
	successCount: number;
	failureCount: number;
	lastUsed: number;
	lastFailure?: number;
	lastFailureReason?: string;
	isBlocked: boolean;
}

interface CredentialRotationConfig {
	enabled: boolean;
	strategy: "round-robin" | "rate-limit";
	maxRetriesPerCredential: number;
}

interface AuthResult {
	index: number;
	token: string;
}

/**
 * Handles OAuth2 authentication and Google Code Assist API communication.
 * Manages token caching, refresh, and API calls.
 */
export class AuthManager {
	private env: Env;
	private accessToken: string | null = null;
	private credentials: OAuth2Credentials[] = [];
	private currentCredentialIndex: number = 0;
	private credentialHealth: CredentialHealth[] = [];
	private rotationConfig: CredentialRotationConfig = {
		enabled: false,
		strategy: "round-robin",
		maxRetriesPerCredential: 3
	};
	// Synchronization lock for credential rotation
	private rotationQueue: Promise<void> | null = null;

	constructor(env: Env) {
		this.env = env;
	}

	/**
	 * Get credential-specific cache key to support credential rotation
	 */
	private getCredentialSpecificCacheKey(index: number = this.currentCredentialIndex): string {
		if (this.rotationConfig.enabled && this.credentials.length > 1) {
			return `${KV_TOKEN_KEY}_${index}`;
		}
		return KV_TOKEN_KEY;
	}

	/**
	 * Initializes authentication using OAuth2 credentials with KV storage caching.
	 * Returns the credential index and token used.
	 */
	public async initializeAuth(): Promise<AuthResult> {
		// Initialize credential rotation configuration
		await this.initializeCredentialRotation();

		try {
			// First, try to get a cached token from KV storage for the current index
			let index = this.currentCredentialIndex;
			let cachedTokenData = null;

			try {
				// Use credential-specific cache key
				const cacheKey = this.getCredentialSpecificCacheKey(index);
				const cachedToken = await this.env.GEMINI_CLI_KV.get(cacheKey, "json");
				if (cachedToken) {
					cachedTokenData = cachedToken as CachedTokenData;
					console.log(`Found cached token in KV storage for credential ${index}`);
				}
			} catch (kvError) {
				console.error("KV storage error during token retrieval:", kvError);
				// Continue with normal authentication flow
			}

			// Check if cached token is still valid (with buffer)
			if (cachedTokenData) {
				const timeUntilExpiry = cachedTokenData.expiry_date - Date.now();
				if (timeUntilExpiry > TOKEN_BUFFER_TIME) {
					this.accessToken = cachedTokenData.access_token;
					console.log(
						`Using cached token for credential ${index}, valid for ${Math.floor(timeUntilExpiry / 1000)} more seconds`
					);
					return { index, token: cachedTokenData.access_token };
				}
				console.log(`Cached token for credential ${index} expired or expiring soon`);
			}

			// Get current credentials based on rotation strategy (this may rotate if current is blocked)
			const previousIndex = this.currentCredentialIndex;
			const currentCreds = await this.getCurrentCredentials();
			// Update index as it might have changed during getCurrentCredentials
			index = this.currentCredentialIndex;

			// If the index changed, check KV storage again for the new index
			if (index !== previousIndex) {
				try {
					const cacheKey = this.getCredentialSpecificCacheKey(index);
					const cachedToken = await this.env.GEMINI_CLI_KV.get(cacheKey, "json");
					if (cachedToken) {
						const cachedTokenData = cachedToken as CachedTokenData;
						console.log(`Found cached token in KV storage for new credential ${index}`);

						const timeUntilExpiry = cachedTokenData.expiry_date - Date.now();
						if (timeUntilExpiry > TOKEN_BUFFER_TIME) {
							this.accessToken = cachedTokenData.access_token;
							console.log(
								`Using cached token for credential ${index}, valid for ${Math.floor(timeUntilExpiry / 1000)} more seconds`
							);
							return { index, token: cachedTokenData.access_token };
						}
						console.log(`Cached token for credential ${index} expired or expiring soon`);
					}
				} catch (kvError) {
					console.error("KV storage error during token retrieval for new credential:", kvError);
				}
			}

			// Check if the current token is still valid
			const timeUntilExpiry = currentCreds.expiry_date - Date.now();
			if (timeUntilExpiry > TOKEN_BUFFER_TIME) {
				// Current token is still valid, cache it and use it
				this.accessToken = currentCreds.access_token;
				console.log(
					`Current token for credential ${index} is valid for ${Math.floor(timeUntilExpiry / 1000)} more seconds`
				);

				// Cache the token in KV storage
				await this.cacheTokenInKV(currentCreds.access_token, currentCreds.expiry_date, index);
				return { index, token: currentCreds.access_token };
			}

			// Token is expired, refresh the token
			console.log(`Token for credential ${index} expired, refreshing...`);
			const newToken = await this.refreshAndCacheToken(currentCreds.refresh_token, index);
			return { index, token: newToken };
		} catch (e: unknown) {
			// Clear access token on failure to prevent using invalid token
			this.accessToken = null;

			const errorMessage = e instanceof Error ? e.message : String(e);
			console.error("Authentication initialization failed:", e);

			// Throw a standardized error with context
			throw new Error(`Authentication failed: ${errorMessage}. Please verify your credentials and configuration.`);
		}
	}

	/**
	 * Refresh the OAuth token and cache it in KV storage.
	 */
	private async refreshAndCacheToken(refreshToken: string, index: number): Promise<string> {
		console.log(`Refreshing OAuth token for credential ${index}...`);

		const refreshResponse = await fetch(OAUTH_REFRESH_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: new URLSearchParams({
				client_id: OAUTH_CLIENT_ID,
				client_secret: OAUTH_CLIENT_SECRET,
				refresh_token: refreshToken,
				grant_type: "refresh_token"
			})
		});

		if (!refreshResponse.ok) {
			const errorText = await refreshResponse.text();
			console.error("Token refresh failed:", errorText);
			throw new Error(`Token refresh failed: ${errorText}`);
		}

		const refreshData = (await refreshResponse.json()) as TokenRefreshResponse;
		this.accessToken = refreshData.access_token;

		// Calculate expiry time (typically 1 hour from now)
		const expiryTime = Date.now() + refreshData.expires_in * 1000;

		console.log("Token refreshed successfully");
		console.log(`New token expires in ${refreshData.expires_in} seconds`);

		// Cache the new token in KV storage
		await this.cacheTokenInKV(refreshData.access_token, expiryTime, index);

		return refreshData.access_token;
	}

	/**
	 * Cache the access token in KV storage.
	 */
	private async cacheTokenInKV(accessToken: string, expiryDate: number, index: number): Promise<void> {
		try {
			const tokenData = {
				access_token: accessToken,
				expiry_date: expiryDate,
				cached_at: Date.now()
			};

			// Cache for slightly less than the token expiry to be safe
			const ttlSeconds = Math.floor((expiryDate - Date.now()) / 1000) - 300; // 5 minutes buffer

			if (ttlSeconds > 0) {
				// Use credential-specific cache key to support credential rotation
				const cacheKey = this.getCredentialSpecificCacheKey(index);
				await this.env.GEMINI_CLI_KV.put(cacheKey, JSON.stringify(tokenData), {
					expirationTtl: ttlSeconds
				});
				console.log(`Token cached in KV storage for credential ${index} with TTL of ${ttlSeconds} seconds`);
			} else {
				console.log("Token expires too soon, not caching in KV");
			}
		} catch (kvError) {
			console.error("Failed to cache token in KV storage:", kvError);
			// Don't throw an error here as the token is still valid, just not cached
		}
	}

	/**
	 * Clear cached token from KV storage.
	 */
	public async clearTokenCache(index: number = this.currentCredentialIndex): Promise<void> {
		try {
			// Clear the credential-specific cache key
			const cacheKey = this.getCredentialSpecificCacheKey(index);
			await this.env.GEMINI_CLI_KV.delete(cacheKey);
			console.log(`Cleared cached token from KV storage for credential ${index}`);
		} catch (kvError) {
			console.log("Error clearing KV cache:", kvError);
		}
	}

	/**
	 * Get cached token info from KV storage.
	 */
	public async getCachedTokenInfo(): Promise<TokenCacheInfo> {
		try {
			// Use credential-specific cache key for current index
			const cacheKey = this.getCredentialSpecificCacheKey();
			const cachedToken = await this.env.GEMINI_CLI_KV.get(cacheKey, "json");
			if (cachedToken) {
				const tokenData = cachedToken as CachedTokenData;
				const timeUntilExpiry = tokenData.expiry_date - Date.now();

				return {
					cached: true,
					cached_at: new Date(tokenData.cached_at).toISOString(),
					expires_at: new Date(tokenData.expiry_date).toISOString(),
					time_until_expiry_seconds: Math.floor(timeUntilExpiry / 1000),
					is_expired: timeUntilExpiry < 0
					// Removed token_preview for security
				};
			}
			return { cached: false, message: "No token found in cache" };
		} catch (e: unknown) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			return { cached: false, error: errorMessage };
		}
	}

	/**
	 * A generic method to call a Code Assist API endpoint.
	 */
	public async callEndpoint(method: string, body: Record<string, unknown>, isRetry: boolean = false): Promise<unknown> {
		const { index: usedIndex, token } = await this.initializeAuth();

		const response = await fetch(`${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			if (response.status === 401 && !isRetry) {
				console.log("Got 401 error, clearing token cache and retrying...");
				this.accessToken = null; // Clear cached token in memory
				await this.clearTokenCache(usedIndex); // Clear KV cache for used credential
				// initializeAuth will be called again in recursion, getting fresh token
				return this.callEndpoint(method, body, true); // Retry once
			}

			// Handle rate limiting and other errors with credential rotation
			if ((response.status === 429 || response.status === 503) && this.rotationConfig.enabled && !isRetry) {
				console.log(`Got ${response.status} error, rotating credentials...`);
				await this.handleCredentialFailure(`HTTP ${response.status} error`, usedIndex);
				await this.clearTokenCache(usedIndex); // Clear the failed credential's cache
				// initializeAuth will be called again in recursion, switching to next credential
				return this.callEndpoint(method, body, true); // Retry once with new credential
			}

			const errorText = await response.text();
			throw new Error(`API call failed with status ${response.status}: ${errorText}`);
		}

		// Mark success for credential health tracking
		await this.handleCredentialSuccess(usedIndex);

		return response.json();
	}

	/**
	 * Get the current access token.
	 */
	public getAccessToken(): string | null {
		return this.accessToken;
	}

	/**
	 * Initialize credential rotation configuration and load credentials.
	 */
	private async initializeCredentialRotation(): Promise<void> {
		// Check if credential rotation is enabled
		this.rotationConfig.enabled = this.env.ENABLE_CREDENTIAL_ROTATION === "true";

		if (!this.rotationConfig.enabled) {
			return;
		}

		// If credentials are already loaded, no need to re-initialize.
		if (this.credentials.length > 0) {
			return;
		}

		// Set rotation strategy (default to round-robin)
		this.rotationConfig.strategy =
			this.env.CREDENTIAL_ROTATION_STRATEGY === "rate-limit" ? "rate-limit" : "round-robin";

		// Set max retries per credential (default to 3)
		if (this.env.MAX_RETRIES_PER_CREDENTIAL) {
			const parsedValue = parseInt(this.env.MAX_RETRIES_PER_CREDENTIAL, 10);
			this.rotationConfig.maxRetriesPerCredential = isNaN(parsedValue) ? 3 : parsedValue;
		} else {
			this.rotationConfig.maxRetriesPerCredential = 3;
		}

		// Load credentials
		await this.loadCredentials();

		// Initialize credential health tracking only if not already initialized
		if (this.credentialHealth.length === 0) {
			this.initializeCredentialHealth();
		}

		console.log(`Credential rotation enabled with strategy: ${this.rotationConfig.strategy}`);
		console.log(`Max retries per credential: ${this.rotationConfig.maxRetriesPerCredential}`);
		console.log(`Loaded ${this.credentials.length} credentials`);
	}

	/**
	 * Load credentials from environment variables.
	 */
	private async loadCredentials(): Promise<void> {
		// Try individual credential variables first (GCP_SERVICE_ACCOUNTS_1, GCP_SERVICE_ACCOUNTS_2, etc.)
		const individualCreds: OAuth2Credentials[] = [];
		let index = 1;

		while (true) {
			const credVarKey = `GCP_SERVICE_ACCOUNTS_${index}` as keyof Env;
			const credVar = this.env[credVarKey];
			if (!credVar || typeof credVar !== "string") {
				break;
			}

			try {
				const cred = JSON.parse(credVar);
				individualCreds.push(validateOAuth2Credentials(cred, `GCP_SERVICE_ACCOUNTS_${index}`));
				index++;
			} catch (e) {
				console.error(`Failed to parse GCP_SERVICE_ACCOUNTS_${index}:`, e);
				throw new Error(`Invalid GCP_SERVICE_ACCOUNTS_${index} format. Must be a JSON object with OAuth2 credentials.`);
			}
		}

		if (individualCreds.length > 0) {
			this.credentials = individualCreds;
			return;
		}

		if (this.env.GCP_SERVICE_ACCOUNTS && typeof this.env.GCP_SERVICE_ACCOUNTS === "string") {
			// Multiple credentials provided as JSON array
			try {
				const parsedCreds = JSON.parse(this.env.GCP_SERVICE_ACCOUNTS);
				if (!Array.isArray(parsedCreds)) {
					throw new Error("GCP_SERVICE_ACCOUNTS must be a JSON array");
				}
				// Validate each credential in the array
				this.credentials = parsedCreds.map((cred, index) =>
					validateOAuth2Credentials(cred, `GCP_SERVICE_ACCOUNTS[${index}]`)
				);
				return;
			} catch (e) {
				console.error("Failed to parse GCP_SERVICE_ACCOUNTS:", e);
				throw new Error("Invalid GCP_SERVICE_ACCOUNTS format. Must be a JSON array of OAuth2 credentials.");
			}
		}

		if (this.env.GCP_SERVICE_ACCOUNT && typeof this.env.GCP_SERVICE_ACCOUNT === "string") {
			// Single credential provided (legacy support)
			try {
				const singleCred = JSON.parse(this.env.GCP_SERVICE_ACCOUNT);
				this.credentials = [validateOAuth2Credentials(singleCred, "GCP_SERVICE_ACCOUNT")];
				return;
			} catch (e) {
				console.error("Failed to parse GCP_SERVICE_ACCOUNT:", e);
				throw new Error("Invalid GCP_SERVICE_ACCOUNT format. Must be a JSON object with OAuth2 credentials.");
			}
		}

		throw new Error(
			"No OAuth2 credentials provided. Please set GCP_SERVICE_ACCOUNT, GCP_SERVICE_ACCOUNTS, or GCP_SERVICE_ACCOUNTS_1, GCP_SERVICE_ACCOUNTS_2, etc. environment variables."
		);
	}

	/**
	 * Initialize credential health tracking.
	 */
	private initializeCredentialHealth(): void {
		// Clean up any existing credential health data to prevent memory leaks
		// Ensure we only track health for credentials that actually exist
		this.credentialHealth = [];
		for (let index = 0; index < this.credentials.length; index++) {
			this.credentialHealth.push({
				credentialIndex: index,
				successCount: 0,
				failureCount: 0,
				lastUsed: 0,
				lastFailure: undefined,
				lastFailureReason: undefined,
				isBlocked: false
			});
		}

		// Log initialization for debugging
		console.log(`Initialized credential health tracking for ${this.credentials.length} credentials`);
	}

	/**
	 * Get current credentials based on rotation strategy.
	 */
	private async getCurrentCredentials(): Promise<OAuth2Credentials> {
		// If we have loaded credentials, use them regardless of rotation setting
		if (this.credentials.length > 0) {
			const maxAttempts = this.credentials.length;
			for (let attempts = 0; attempts < maxAttempts; attempts++) {
				const currentCred = this.credentials[this.currentCredentialIndex];
				const currentHealth = this.credentialHealth[this.currentCredentialIndex];

				// Update usage stats
				currentHealth.lastUsed = Date.now();

				// Check if credential is blocked
				if (currentHealth.isBlocked) {
					console.log(`Credential ${this.currentCredentialIndex} is blocked, switching to next credential`);
					await this.rotateToNextCredential();
					continue; // Try next credential
				}

				// Found a valid credential
				return currentCred;
			}

			// If we've tried all credentials and they're all blocked, throw an error
			throw new Error("All credentials are blocked. No available credentials to use.");
		}

		// If no credentials are loaded, try to use GCP_SERVICE_ACCOUNT (legacy support)
		if (this.env.GCP_SERVICE_ACCOUNT) {
			try {
				const parsedCred = JSON.parse(this.env.GCP_SERVICE_ACCOUNT);
				return validateOAuth2Credentials(parsedCred, "GCP_SERVICE_ACCOUNT");
			} catch (e) {
				console.error("Failed to parse GCP_SERVICE_ACCOUNT:", e);
				throw new Error("Invalid GCP_SERVICE_ACCOUNT format. Must be a JSON object with OAuth2 credentials.");
			}
		}

		// No credentials available - this is a critical error
		throw new Error(
			"No OAuth2 credentials available. Please set GCP_SERVICE_ACCOUNT, GCP_SERVICE_ACCOUNTS, or GCP_SERVICE_ACCOUNTS_1, GCP_SERVICE_ACCOUNTS_2, etc. environment variables."
		);
	}

	/**
	 * Rotate to the next credential based on strategy.
	 */
	private async rotateToNextCredential(): Promise<void> {
		if (this.credentials.length <= 1) {
			return; // No rotation needed with single credential
		}

		// Create a new lock mechanism
		let releaseLock: () => void = () => {};
		const newLock = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});

		// If someone is holding the lock, wait for them
		const previousLock = this.rotationQueue;

		// We become the new tail of the queue immediately
		this.rotationQueue = newLock;

		if (previousLock) {
			// If there's already a rotation in progress, wait for it to complete
			await previousLock;
		}

		try {
			// Update current credential index
			if (this.rotationConfig.strategy === "round-robin") {
				// Simple round-robin rotation
				this.currentCredentialIndex = (this.currentCredentialIndex + 1) % this.credentials.length;
			} else {
				// Rate-limit based rotation - find the healthiest credential
				const healthyCredentials = this.credentialHealth
					.filter((health) => !health.isBlocked)
					.sort((a, b) => {
						// Sort by failure count (ascending) and last used (ascending)
						return a.failureCount - b.failureCount || a.lastUsed - b.lastUsed;
					});

				if (healthyCredentials.length > 0) {
					this.currentCredentialIndex = healthyCredentials[0].credentialIndex;
				} else {
					// All credentials are blocked, reset all and start from beginning
					console.log("All credentials blocked, performing reset...");
					this.credentialHealth.forEach((health) => {
						health.isBlocked = false;
						health.failureCount = 0;
						health.lastFailure = undefined;
						health.lastFailureReason = undefined;
					});
					this.currentCredentialIndex = 0;

					// Verify the reset was successful and credential is not blocked
					if (this.credentialHealth[0] && this.credentialHealth[0].isBlocked) {
						throw new Error("Credential reset failed - first credential is still blocked after reset");
					}

					// Additional verification: ensure we have at least one valid credential
					if (this.credentials.length === 0) {
						throw new Error("Credential reset failed - no credentials available");
					}

					// Log successful reset
					console.log("Credential reset successful, starting with credential 0");
				}
			}

			console.log(`Rotated to credential ${this.currentCredentialIndex}`);
		} finally {
			// Release the lock
			releaseLock();

			// If we are still the tail of the queue, clear it
			if (this.rotationQueue === newLock) {
				this.rotationQueue = null;
			}
		}
	}

	/**
	 * Mark current credential as failed and rotate if needed.
	 */
	public async handleCredentialFailure(error: unknown, index: number): Promise<void> {
		if (!this.rotationConfig.enabled || this.credentials.length <= 1) {
			return;
		}

		const currentHealth = this.credentialHealth[index];
		currentHealth.failureCount++;
		currentHealth.lastFailure = Date.now();
		currentHealth.lastFailureReason = error instanceof Error ? error.message : String(error);

		// Check if we should block this credential
		if (currentHealth.failureCount >= this.rotationConfig.maxRetriesPerCredential) {
			currentHealth.isBlocked = true;
			console.log(`Credential ${index} blocked due to repeated failures`);
		}

		// Only rotate if we are currently using the failed credential
		if (this.currentCredentialIndex === index) {
			await this.rotateToNextCredential();
		}
	}

	/**
	 * Mark current credential as successful.
	 */
	public async handleCredentialSuccess(index: number): Promise<void> {
		if (!this.rotationConfig.enabled) {
			return;
		}

		const currentHealth = this.credentialHealth[index];
		currentHealth.successCount++;
		currentHealth.failureCount = 0; // Reset failure count on success
		currentHealth.lastFailure = undefined;
		currentHealth.lastFailureReason = undefined;
		currentHealth.isBlocked = false;
	}
}
