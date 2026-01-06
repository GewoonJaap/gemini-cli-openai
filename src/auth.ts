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

	constructor(env: Env) {
		this.env = env;
	}

	/**
	 * Initializes authentication using OAuth2 credentials with KV storage caching.
	 */
	public async initializeAuth(): Promise<void> {
		// Initialize credential rotation configuration
		await this.initializeCredentialRotation();

		try {
			// First, try to get a cached token from KV storage
			let cachedTokenData = null;

			try {
				const cachedToken = await this.env.GEMINI_CLI_KV.get(KV_TOKEN_KEY, "json");
				if (cachedToken) {
					cachedTokenData = cachedToken as CachedTokenData;
					console.log("Found cached token in KV storage");
				}
			} catch (kvError) {
				console.log("No cached token found in KV storage or KV error:", kvError);
			}

			// Check if cached token is still valid (with buffer)
			if (cachedTokenData) {
				const timeUntilExpiry = cachedTokenData.expiry_date - Date.now();
				if (timeUntilExpiry > TOKEN_BUFFER_TIME) {
					this.accessToken = cachedTokenData.access_token;
					console.log(`Using cached token, valid for ${Math.floor(timeUntilExpiry / 1000)} more seconds`);
					return;
				}
				console.log("Cached token expired or expiring soon");
			}

			// Get current credentials based on rotation strategy
			const currentCreds = await this.getCurrentCredentials();

			// Check if the current token is still valid
			const timeUntilExpiry = currentCreds.expiry_date - Date.now();
			if (timeUntilExpiry > TOKEN_BUFFER_TIME) {
				// Current token is still valid, cache it and use it
				this.accessToken = currentCreds.access_token;
				console.log(`Current token is valid for ${Math.floor(timeUntilExpiry / 1000)} more seconds`);

				// Cache the token in KV storage
				await this.cacheTokenInKV(currentCreds.access_token, currentCreds.expiry_date);
				return;
			}

			// Token is expired, refresh the token
			console.log("Token expired, refreshing...");
			await this.refreshAndCacheToken(currentCreds.refresh_token);
		} catch (e: unknown) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			console.error("Failed to initialize authentication:", e);
			throw new Error("Authentication failed: " + errorMessage);
		}
	}

	/**
	 * Refresh the OAuth token and cache it in KV storage.
	 */
	private async refreshAndCacheToken(refreshToken: string): Promise<void> {
		console.log("Refreshing OAuth token...");

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
		await this.cacheTokenInKV(refreshData.access_token, expiryTime);
	}

	/**
	 * Cache the access token in KV storage.
	 */
	private async cacheTokenInKV(accessToken: string, expiryDate: number): Promise<void> {
		try {
			const tokenData = {
				access_token: accessToken,
				expiry_date: expiryDate,
				cached_at: Date.now()
			};

			// Cache for slightly less than the token expiry to be safe
			const ttlSeconds = Math.floor((expiryDate - Date.now()) / 1000) - 300; // 5 minutes buffer

			if (ttlSeconds > 0) {
				await this.env.GEMINI_CLI_KV.put(KV_TOKEN_KEY, JSON.stringify(tokenData), {
					expirationTtl: ttlSeconds
				});
				console.log(`Token cached in KV storage with TTL of ${ttlSeconds} seconds`);
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
	public async clearTokenCache(): Promise<void> {
		try {
			await this.env.GEMINI_CLI_KV.delete(KV_TOKEN_KEY);
			console.log("Cleared cached token from KV storage");
		} catch (kvError) {
			console.log("Error clearing KV cache:", kvError);
		}
	}

	/**
	 * Get cached token info from KV storage.
	 */
	public async getCachedTokenInfo(): Promise<TokenCacheInfo> {
		try {
			const cachedToken = await this.env.GEMINI_CLI_KV.get(KV_TOKEN_KEY, "json");
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
		await this.initializeAuth();

		const response = await fetch(`${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.accessToken}`
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			if (response.status === 401 && !isRetry) {
				console.log("Got 401 error, clearing token cache and retrying...");
				this.accessToken = null; // Clear cached token
				await this.clearTokenCache(); // Clear KV cache
				await this.initializeAuth(); // This will refresh the token
				return this.callEndpoint(method, body, true); // Retry once
			}

			// Handle rate limiting and other errors with credential rotation
			if ((response.status === 429 || response.status === 503) && this.rotationConfig.enabled) {
				console.log(`Got ${response.status} error, rotating credentials...`);
				await this.handleCredentialFailure(`HTTP ${response.status} error`);
				await this.initializeAuth(); // This will switch to next credential
				return this.callEndpoint(method, body, true); // Retry once with new credential
			}

			const errorText = await response.text();
			throw new Error(`API call failed with status ${response.status}: ${errorText}`);
		}

		// Mark success for credential health tracking
		await this.handleCredentialSuccess();

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

		// Set rotation strategy (default to round-robin)
		this.rotationConfig.strategy = this.env.CREDENTIAL_ROTATION_STRATEGY === "rate-limit"
			? "rate-limit"
			: "round-robin";

		// Set max retries per credential (default to 3)
		this.rotationConfig.maxRetriesPerCredential = this.env.MAX_RETRIES_PER_CREDENTIAL
			? parseInt(this.env.MAX_RETRIES_PER_CREDENTIAL) || 3
			: 3;

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
			if (!credVar || typeof credVar !== 'string') {
				break;
			}

			try {
				const cred = JSON.parse(credVar);
				individualCreds.push(cred);
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

		if (this.env.GCP_SERVICE_ACCOUNTS && typeof this.env.GCP_SERVICE_ACCOUNTS === 'string') {
			// Multiple credentials provided as JSON array
			try {
				this.credentials = JSON.parse(this.env.GCP_SERVICE_ACCOUNTS);
				if (!Array.isArray(this.credentials)) {
					throw new Error("GCP_SERVICE_ACCOUNTS must be a JSON array");
				}
				return;
			} catch (e) {
				console.error("Failed to parse GCP_SERVICE_ACCOUNTS:", e);
				throw new Error("Invalid GCP_SERVICE_ACCOUNTS format. Must be a JSON array of OAuth2 credentials.");
			}
		}

		if (this.env.GCP_SERVICE_ACCOUNT && typeof this.env.GCP_SERVICE_ACCOUNT === 'string') {
			// Single credential provided (legacy support)
			try {
				const singleCred = JSON.parse(this.env.GCP_SERVICE_ACCOUNT);
				this.credentials = [singleCred];
				return;
			} catch (e) {
				console.error("Failed to parse GCP_SERVICE_ACCOUNT:", e);
				throw new Error("Invalid GCP_SERVICE_ACCOUNT format. Must be a JSON object with OAuth2 credentials.");
			}
		}

		throw new Error("No OAuth2 credentials provided. Please set GCP_SERVICE_ACCOUNT, GCP_SERVICE_ACCOUNTS, or GCP_SERVICE_ACCOUNTS_1, GCP_SERVICE_ACCOUNTS_2, etc. environment variables.");
	}

	/**
	 * Initialize credential health tracking.
	 */
	private initializeCredentialHealth(): void {
		this.credentialHealth = this.credentials.map((_, index) => ({
			credentialIndex: index,
			successCount: 0,
			failureCount: 0,
			lastUsed: 0,
			lastFailure: undefined,
			lastFailureReason: undefined,
			isBlocked: false
		}));
	}

	/**
	 * Get current credentials based on rotation strategy.
	 */
	private async getCurrentCredentials(): Promise<OAuth2Credentials> {
		if (!this.rotationConfig.enabled || this.credentials.length === 0) {
			// If rotation is disabled or no credentials, try to use GCP_SERVICE_ACCOUNT
			if (this.env.GCP_SERVICE_ACCOUNT) {
				try {
					return JSON.parse(this.env.GCP_SERVICE_ACCOUNT);
				} catch (e) {
					console.error("Failed to parse GCP_SERVICE_ACCOUNT:", e);
					throw new Error("Invalid GCP_SERVICE_ACCOUNT format. Must be a JSON object with OAuth2 credentials.");
				}
			}

			// No credentials available - this is a critical error
			throw new Error("No OAuth2 credentials available. Please set GCP_SERVICE_ACCOUNT, GCP_SERVICE_ACCOUNTS, or GCP_SERVICE_ACCOUNTS_1, GCP_SERVICE_ACCOUNTS_2, etc. environment variables.");
		}

		// Get current credential
		const currentCred = this.credentials[this.currentCredentialIndex];
		const currentHealth = this.credentialHealth[this.currentCredentialIndex];

		// Update usage stats
		currentHealth.lastUsed = Date.now();

		// Check if credential is blocked
		if (currentHealth.isBlocked) {
			console.log(`Credential ${this.currentCredentialIndex} is blocked, switching to next credential`);
			await this.rotateToNextCredential();
			return this.getCurrentCredentials();
		}

		return currentCred;
	}

	/**
	 * Rotate to the next credential based on strategy.
	 */
	private async rotateToNextCredential(): Promise<void> {
		if (this.credentials.length <= 1) {
			return; // No rotation needed with single credential
		}

		// Update current credential index
		if (this.rotationConfig.strategy === "round-robin") {
			// Simple round-robin rotation
			this.currentCredentialIndex = (this.currentCredentialIndex + 1) % this.credentials.length;
		} else {
			// Rate-limit based rotation - find the healthiest credential
			const healthyCredentials = this.credentialHealth
				.filter(health => !health.isBlocked)
				.sort((a, b) => {
					// Sort by failure count (ascending) and last used (ascending)
					return a.failureCount - b.failureCount || a.lastUsed - b.lastUsed;
				});

			if (healthyCredentials.length > 0) {
				this.currentCredentialIndex = healthyCredentials[0].credentialIndex;
			} else {
				// All credentials are blocked, reset all and start from beginning
				this.credentialHealth.forEach(health => {
					health.isBlocked = false;
					health.failureCount = 0;
				});
				this.currentCredentialIndex = 0;
			}
		}

		console.log(`Rotated to credential ${this.currentCredentialIndex}`);
	}

	/**
	 * Mark current credential as failed and rotate if needed.
	 */
	private async handleCredentialFailure(error: unknown): Promise<void> {
		if (!this.rotationConfig.enabled || this.credentials.length <= 1) {
			return;
		}

		const currentHealth = this.credentialHealth[this.currentCredentialIndex];
		currentHealth.failureCount++;
		currentHealth.lastFailure = Date.now();
		currentHealth.lastFailureReason = error instanceof Error ? error.message : String(error);

		// Check if we should block this credential
		if (currentHealth.failureCount >= this.rotationConfig.maxRetriesPerCredential) {
			currentHealth.isBlocked = true;
			console.log(`Credential ${this.currentCredentialIndex} blocked due to repeated failures`);
		}

		// Rotate to next credential
		await this.rotateToNextCredential();
	}

	/**
	 * Mark current credential as successful.
	 */
	private async handleCredentialSuccess(): Promise<void> {
		if (!this.rotationConfig.enabled) {
			return;
		}

		const currentHealth = this.credentialHealth[this.currentCredentialIndex];
		currentHealth.successCount++;
		currentHealth.failureCount = 0; // Reset failure count on success
		currentHealth.lastFailure = undefined;
		currentHealth.lastFailureReason = undefined;
		currentHealth.isBlocked = false;
	}
}
