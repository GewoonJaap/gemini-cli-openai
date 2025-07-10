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

// Key rotation constants
const KV_ROTATION_KEY = "gemini_cli_rotation_state";
const KV_ACCOUNT_STATUS_KEY = "gemini_cli_account_status";
const RATE_LIMIT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown for rate-limited accounts

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

interface RotationState {
	current_account_index: number;
	last_rotation_time: number;
}

interface AccountStatus {
	[key: string]: {
		is_rate_limited: boolean;
		rate_limit_until: number;
		last_used: number;
	};
}

/**
 * Handles OAuth2 authentication and Google Code Assist API communication.
 * Manages token caching, refresh, and API calls.
 */
export class AuthManager {
	private env: Env;
	private accessToken: string | null = null;
	private currentAccountIndex: number = 0;
	private availableAccounts: OAuth2Credentials[] = [];

	constructor(env: Env) {
		this.env = env;
	}

	/**
	 * Load all available GCP service accounts from environment variables.
	 */
	private loadAvailableAccounts(): void {
		this.availableAccounts = [];
		
		// Try to load GCP_SERVICE_ACCOUNT (legacy single account)
		if (this.env.GCP_SERVICE_ACCOUNT) {
			try {
				const creds = JSON.parse(this.env.GCP_SERVICE_ACCOUNT);
				this.availableAccounts.push(creds);
				console.log("Loaded legacy GCP_SERVICE_ACCOUNT");
			} catch (e) {
				console.error("Failed to parse GCP_SERVICE_ACCOUNT:", e);
			}
		}

		// Try to load multiple accounts (GCP_SERVICE_ACCOUNT_1, GCP_SERVICE_ACCOUNT_2, etc.)
		for (let i = 1; i <= 10; i++) {
			const accountKey = `GCP_SERVICE_ACCOUNT_${i}`;
			const accountValue = (this.env as any)[accountKey];
			
			if (accountValue) {
				try {
					const creds = JSON.parse(accountValue);
					this.availableAccounts.push(creds);
					console.log(`Loaded ${accountKey}`);
				} catch (e) {
					console.error(`Failed to parse ${accountKey}:`, e);
				}
			}
		}

		if (this.availableAccounts.length === 0) {
			throw new Error("No valid GCP service accounts found. Please set GCP_SERVICE_ACCOUNT or GCP_SERVICE_ACCOUNT_1, GCP_SERVICE_ACCOUNT_2, etc.");
		}

		console.log(`Loaded ${this.availableAccounts.length} GCP service account(s)`);
	}

	/**
	 * Get the next available account for rotation.
	 */
	private async getNextAvailableAccount(): Promise<{ account: OAuth2Credentials; index: number }> {
		// Load accounts if not already loaded
		if (this.availableAccounts.length === 0) {
			this.loadAvailableAccounts();
		}

		// Get account status from KV storage
		const accountStatus = await this.getAccountStatus();
		
		// Get rotation state
		const rotationState = await this.getRotationState();
		this.currentAccountIndex = rotationState.current_account_index;

		// Find the next available account
		const startIndex = this.currentAccountIndex;
		let attempts = 0;
		
		while (attempts < this.availableAccounts.length) {
			const account = this.availableAccounts[this.currentAccountIndex];
			const accountKey = `account_${this.currentAccountIndex}`;
			const status = accountStatus[accountKey];
			
			// Check if account is rate limited
			if (!status || !status.is_rate_limited || Date.now() > status.rate_limit_until) {
				// Account is available
				console.log(`Selected account ${this.currentAccountIndex} for authentication`);
				return { account, index: this.currentAccountIndex };
			}
			
			// Move to next account
			this.currentAccountIndex = (this.currentAccountIndex + 1) % this.availableAccounts.length;
			attempts++;
		}

		// If all accounts are rate limited, use the least recently limited one
		console.log("All accounts are rate limited, using the least recently limited account");
		let oldestRateLimitTime = Date.now();
		let bestAccountIndex = 0;
		
		for (let i = 0; i < this.availableAccounts.length; i++) {
			const accountKey = `account_${i}`;
			const status = accountStatus[accountKey];
			if (status && status.rate_limit_until < oldestRateLimitTime) {
				oldestRateLimitTime = status.rate_limit_until;
				bestAccountIndex = i;
			}
		}
		
		this.currentAccountIndex = bestAccountIndex;
		return { account: this.availableAccounts[bestAccountIndex], index: bestAccountIndex };
	}

	/**
	 * Mark an account as rate limited.
	 */
	private async markAccountAsRateLimited(accountIndex: number): Promise<void> {
		const accountStatus = await this.getAccountStatus();
		const accountKey = `account_${accountIndex}`;
		
		accountStatus[accountKey] = {
			is_rate_limited: true,
			rate_limit_until: Date.now() + RATE_LIMIT_COOLDOWN_MS,
			last_used: Date.now()
		};
		
		await this.saveAccountStatus(accountStatus);
		console.log(`Marked account ${accountIndex} as rate limited until ${new Date(accountStatus[accountKey].rate_limit_until).toISOString()}`);
	}

	/**
	 * Rotate to the next account.
	 */
	private async rotateToNextAccount(): Promise<void> {
		this.currentAccountIndex = (this.currentAccountIndex + 1) % this.availableAccounts.length;
		await this.saveRotationState({
			current_account_index: this.currentAccountIndex,
			last_rotation_time: Date.now()
		});
		console.log(`Rotated to account ${this.currentAccountIndex}`);
	}

	/**
	 * Initializes authentication using OAuth2 credentials with KV storage caching and key rotation.
	 */
	public async initializeAuth(): Promise<void> {
		try {
			// Get the next available account
			const { account: oauth2Creds, index: accountIndex } = await this.getNextAvailableAccount();
			
			// Create a cache key specific to this account
			const accountCacheKey = `${KV_TOKEN_KEY}_${accountIndex}`;
			
			// First, try to get a cached token from KV storage for this account
			let cachedTokenData = null;

			try {
				const cachedToken = await this.env.GEMINI_CLI_KV.get(accountCacheKey, "json");
				if (cachedToken) {
					cachedTokenData = cachedToken as CachedTokenData;
					console.log(`Found cached token for account ${accountIndex} in KV storage`);
				}
			} catch (kvError) {
				console.log(`No cached token found for account ${accountIndex} in KV storage or KV error:`, kvError);
			}

			// Check if cached token is still valid (with buffer)
			if (cachedTokenData) {
				const timeUntilExpiry = cachedTokenData.expiry_date - Date.now();
				if (timeUntilExpiry > TOKEN_BUFFER_TIME) {
					this.accessToken = cachedTokenData.access_token;
					console.log(`Using cached token for account ${accountIndex}, valid for ${Math.floor(timeUntilExpiry / 1000)} more seconds`);
					return;
				}
				console.log(`Cached token for account ${accountIndex} expired or expiring soon`);
			}

			// Check if the original token is still valid
			const timeUntilExpiry = oauth2Creds.expiry_date - Date.now();
			if (timeUntilExpiry > TOKEN_BUFFER_TIME) {
				// Original token is still valid, cache it and use it
				this.accessToken = oauth2Creds.access_token;
				console.log(`Original token for account ${accountIndex} is valid for ${Math.floor(timeUntilExpiry / 1000)} more seconds`);

				// Cache the token in KV storage
				await this.cacheTokenInKV(oauth2Creds.access_token, oauth2Creds.expiry_date, accountIndex);
				return;
			}

			// Both original and cached tokens are expired, refresh the token
			console.log(`All tokens for account ${accountIndex} expired, refreshing...`);
			await this.refreshAndCacheToken(oauth2Creds.refresh_token, accountIndex);
		} catch (e: unknown) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			console.error("Failed to initialize authentication:", e);
			throw new Error("Authentication failed: " + errorMessage);
		}
	}

	/**
	 * Refresh the OAuth token and cache it in KV storage.
	 */
	private async refreshAndCacheToken(refreshToken: string, accountIndex: number): Promise<void> {
		console.log(`Refreshing OAuth token for account ${accountIndex}...`);

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
			console.error(`Token refresh failed for account ${accountIndex}:`, errorText);
			throw new Error(`Token refresh failed for account ${accountIndex}: ${errorText}`);
		}

		const refreshData = (await refreshResponse.json()) as TokenRefreshResponse;
		this.accessToken = refreshData.access_token;

		// Calculate expiry time (typically 1 hour from now)
		const expiryTime = Date.now() + refreshData.expires_in * 1000;

		console.log(`Token refreshed successfully for account ${accountIndex}`);
		console.log(`New token expires in ${refreshData.expires_in} seconds`);

		// Cache the new token in KV storage
		await this.cacheTokenInKV(refreshData.access_token, expiryTime, accountIndex);
	}

	/**
	 * Cache the access token in KV storage.
	 */
	private async cacheTokenInKV(accessToken: string, expiryDate: number, accountIndex: number): Promise<void> {
		try {
			const tokenData = {
				access_token: accessToken,
				expiry_date: expiryDate,
				cached_at: Date.now()
			};

			// Cache for slightly less than the token expiry to be safe
			const ttlSeconds = Math.floor((expiryDate - Date.now()) / 1000) - 300; // 5 minutes buffer

			if (ttlSeconds > 0) {
				const accountCacheKey = `${KV_TOKEN_KEY}_${accountIndex}`;
				await this.env.GEMINI_CLI_KV.put(accountCacheKey, JSON.stringify(tokenData), {
					expirationTtl: ttlSeconds
				});
				console.log(`Token cached in KV storage for account ${accountIndex} with TTL of ${ttlSeconds} seconds`);
			} else {
				console.log(`Token expires too soon for account ${accountIndex}, not caching in KV`);
			}
		} catch (kvError) {
			console.error(`Failed to cache token in KV storage for account ${accountIndex}:`, kvError);
			// Don't throw an error here as the token is still valid, just not cached
		}
	}

	/**
	 * Clear cached token from KV storage.
	 */
	public async clearTokenCache(): Promise<void> {
		try {
			// Clear all account token caches
			if (this.availableAccounts.length === 0) {
				this.loadAvailableAccounts();
			}
			
			for (let i = 0; i < this.availableAccounts.length; i++) {
				const accountCacheKey = `${KV_TOKEN_KEY}_${i}`;
				await this.env.GEMINI_CLI_KV.delete(accountCacheKey);
			}
			
			console.log("Cleared cached tokens from KV storage for all accounts");
		} catch (kvError) {
			console.log("Error clearing KV cache:", kvError);
		}
	}

	/**
	 * Get rotation state from KV storage.
	 */
	private async getRotationState(): Promise<RotationState> {
		try {
			const rotationState = await this.env.GEMINI_CLI_KV.get(KV_ROTATION_KEY, "json");
			if (rotationState) {
				return rotationState as RotationState;
			}
		} catch (kvError) {
			console.log("Error getting rotation state from KV:", kvError);
		}
		
		// Default rotation state
		return {
			current_account_index: 0,
			last_rotation_time: Date.now()
		};
	}

	/**
	 * Save rotation state to KV storage.
	 */
	private async saveRotationState(rotationState: RotationState): Promise<void> {
		try {
			await this.env.GEMINI_CLI_KV.put(KV_ROTATION_KEY, JSON.stringify(rotationState));
		} catch (kvError) {
			console.log("Error saving rotation state to KV:", kvError);
		}
	}

	/**
	 * Get account status from KV storage.
	 */
	private async getAccountStatus(): Promise<AccountStatus> {
		try {
			const accountStatus = await this.env.GEMINI_CLI_KV.get(KV_ACCOUNT_STATUS_KEY, "json");
			if (accountStatus) {
				return accountStatus as AccountStatus;
			}
		} catch (kvError) {
			console.log("Error getting account status from KV:", kvError);
		}
		
		// Default account status
		return {};
	}

	/**
	 * Save account status to KV storage.
	 */
	private async saveAccountStatus(accountStatus: AccountStatus): Promise<void> {
		try {
			await this.env.GEMINI_CLI_KV.put(KV_ACCOUNT_STATUS_KEY, JSON.stringify(accountStatus));
		} catch (kvError) {
			console.log("Error saving account status to KV:", kvError);
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
	 * A generic method to call a Code Assist API endpoint with automatic key rotation.
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
			
			// Handle rate limiting (429) - rotate to next account
			if (response.status === 429 && !isRetry) {
				console.log("Got 429 rate limit error, marking account as rate limited and rotating to next account...");
				
				// Mark current account as rate limited
				await this.markAccountAsRateLimited(this.currentAccountIndex);
				
				// Rotate to next account
				await this.rotateToNextAccount();
				
				// Clear current token and reinitialize with new account
				this.accessToken = null;
				await this.initializeAuth();
				
				// Retry with new account
				return this.callEndpoint(method, body, true);
			}
			
			const errorText = await response.text();
			throw new Error(`API call failed with status ${response.status}: ${errorText}`);
		}

		return response.json();
	}

	/**
	 * Get the current access token.
	 */
	public getAccessToken(): string | null {
		return this.accessToken;
	}

	/**
	 * Handle rate limiting for external callers (like streaming requests).
	 * Marks current account as rate limited and rotates to next account.
	 */
	public async handleRateLimit(): Promise<void> {
		console.log("Handling rate limit: marking current account as rate limited and rotating...");
		
		// Mark current account as rate limited
		await this.markAccountAsRateLimited(this.currentAccountIndex);
		
		// Rotate to next account
		await this.rotateToNextAccount();
		
		// Clear current token and reinitialize with new account
		this.accessToken = null;
		await this.initializeAuth();
	}

	/**
	 * Get rotation status information.
	 */
	public async getRotationStatus(): Promise<{
		total_accounts: number;
		current_account_index: number;
		account_statuses: AccountStatus;
		rotation_state: RotationState;
	}> {
		if (this.availableAccounts.length === 0) {
			this.loadAvailableAccounts();
		}

		const accountStatuses = await this.getAccountStatus();
		const rotationState = await this.getRotationState();

		return {
			total_accounts: this.availableAccounts.length,
			current_account_index: this.currentAccountIndex,
			account_statuses: accountStatuses,
			rotation_state: rotationState
		};
	}
}
