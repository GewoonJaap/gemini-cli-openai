/// <reference types="jest" />
/// <reference types="node" />

import { AuthManager } from "./auth";
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

// Mock the config module
jest.mock("./config", () => {
	const actualConfig = jest.requireActual("./config");
	return {
		...actualConfig,
		OAUTH_REFRESH_URL: "https://oauth2.googleapis.com/token"
	};
});

// Mock KVNamespace
interface MockKVNamespace {
	store: Map<string, unknown>;
	get: jest.Mock<Promise<unknown | null>, [string, "json"]>;
	put: jest.Mock<Promise<void>, [string, string, { expirationTtl?: number }?]>;
	delete: jest.Mock<Promise<void>, [string]>;
}

function createMockKV(): MockKVNamespace {
	const store = new Map<string, unknown>();
	return {
		store,
		get: jest.fn(async (key: string, _type: "json") => {
			return store.get(key) ?? null;
		}),
		put: jest.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
			store.set(key, value);
		}),
		delete: jest.fn(async (key: string) => {
			store.delete(key);
		})
	};
}

describe("AuthManager", () => {
	let mockKV: MockKVNamespace;
	let mockEnv: Env;
	let authManager: AuthManager;

	const mockOAuthCredentials: OAuth2Credentials = {
		access_token: "mock_access_token",
		refresh_token: "mock_refresh_token",
		scope: "https://www.googleapis.com/auth/cloud-platform",
		token_type: "Bearer",
		id_token: "mock_id_token",
		expiry_date: Date.now() + 3600000 // 1 hour from now
	};

	const mockRefreshResponse = {
		access_token: "new_access_token",
		expires_in: 3600
	};

	beforeEach(() => {
		mockKV = createMockKV();
		mockEnv = {
			GCP_SERVICE_ACCOUNT: JSON.stringify(mockOAuthCredentials),
			GEMINI_CLI_KV: mockKV as unknown as KVNamespace
		};
		authManager = new AuthManager(mockEnv);

		// Clear all mocks
		jest.clearAllMocks();
	});

	describe("constructor", () => {
		it("should create an instance with the provided env", () => {
			expect(authManager).toBeInstanceOf(AuthManager);
		});
	});

	describe("initializeAuth", () => {
		it("should throw error if GCP_SERVICE_ACCOUNT is not set", async () => {
			const invalidEnv = { ...mockEnv, GCP_SERVICE_ACCOUNT: "" as unknown as undefined };
			const newAuthManager = new AuthManager(invalidEnv as unknown as Env);

			await expect(newAuthManager.initializeAuth()).rejects.toThrow(
				"`GCP_SERVICE_ACCOUNT` environment variable not set"
			);
		});

		it("should use cached token from KV storage if valid", async () => {
			const cachedTokenData = {
				access_token: "cached_access_token",
				expiry_date: Date.now() + 3600000,
				cached_at: Date.now()
			};

			mockKV.store.set(KV_TOKEN_KEY, cachedTokenData);

			await authManager.initializeAuth();

			expect(authManager.getAccessToken()).toBe("cached_access_token");
			expect(mockKV.get).toHaveBeenCalledWith(KV_TOKEN_KEY, "json");
		});

		it("should use original token from credentials if valid and no cached token", async () => {
			// Valid credentials with future expiry_date
			await authManager.initializeAuth();

			expect(authManager.getAccessToken()).toBe("mock_access_token");
			expect(mockKV.put).toHaveBeenCalled();
		});

		it("should refresh token if both cached and original tokens are expired", async () => {
			// Expired credentials
			const expiredCredentials: OAuth2Credentials = {
				...mockOAuthCredentials,
				expiry_date: Date.now() - 10000 // Expired 10 seconds ago
			};

			mockEnv.GCP_SERVICE_ACCOUNT = JSON.stringify(expiredCredentials);

			// Mock fetch for token refresh
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: jest.fn().mockResolvedValue(mockRefreshResponse),
				text: jest.fn().mockResolvedValue("")
			}) as jest.Mock;

			await authManager.initializeAuth();

			expect(authManager.getAccessToken()).toBe("new_access_token");
			expect(global.fetch).toHaveBeenCalledWith(
				OAUTH_REFRESH_URL,
				expect.objectContaining({
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded"
					}
				})
			);
		});

		it("should throw error if token refresh fails", async () => {
			const expiredCredentials: OAuth2Credentials = {
				...mockOAuthCredentials,
				expiry_date: Date.now() - 10000
			};

			mockEnv.GCP_SERVICE_ACCOUNT = JSON.stringify(expiredCredentials);

			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				text: jest.fn().mockResolvedValue("refresh_failed")
			}) as jest.Mock;

			await expect(authManager.initializeAuth()).rejects.toThrow("Authentication failed");
		});

		it("should handle cached token that is expiring soon", async () => {
			const expiringSoonTokenData = {
				access_token: "expiring_token",
				expiry_date: Date.now() + TOKEN_BUFFER_TIME - 1000, // Less than buffer time
				cached_at: Date.now()
			};

			mockKV.store.set(KV_TOKEN_KEY, expiringSoonTokenData);

			// Also set expired credentials so it will refresh
			const expiredCredentials: OAuth2Credentials = {
				...mockOAuthCredentials,
				expiry_date: Date.now() - 10000
			};
			mockEnv.GCP_SERVICE_ACCOUNT = JSON.stringify(expiredCredentials);

			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: jest.fn().mockResolvedValue(mockRefreshResponse),
				text: jest.fn().mockResolvedValue("")
			}) as jest.Mock;

			await authManager.initializeAuth();

			expect(authManager.getAccessToken()).toBe("new_access_token");
		});
	});

	describe("refreshAndCacheToken (via initializeAuth)", () => {
		it("should cache refreshed token in KV storage", async () => {
			const expiredCredentials: OAuth2Credentials = {
				...mockOAuthCredentials,
				expiry_date: Date.now() - 10000
			};

			mockEnv.GCP_SERVICE_ACCOUNT = JSON.stringify(expiredCredentials);

			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: jest.fn().mockResolvedValue(mockRefreshResponse),
				text: jest.fn().mockResolvedValue("")
			}) as jest.Mock;

			await authManager.initializeAuth();

			expect(mockKV.put).toHaveBeenCalledWith(
				KV_TOKEN_KEY,
				expect.any(String),
				expect.objectContaining({
					expirationTtl: expect.any(Number)
				})
			);
		});
	});

	describe("clearTokenCache", () => {
		it("should delete cached token from KV storage", async () => {
			mockKV.store.set(KV_TOKEN_KEY, { access_token: "test" });

			await authManager.clearTokenCache();

			expect(mockKV.delete).toHaveBeenCalledWith(KV_TOKEN_KEY);
		});

		it("should not throw error if KV delete fails", async () => {
			mockKV.delete.mockRejectedValue(new Error("KV delete error"));

			await expect(authManager.clearTokenCache()).resolves.not.toThrow();
		});
	});

	describe("getCachedTokenInfo", () => {
		it("should return cached token info if token exists", async () => {
			const cachedTokenData = {
				access_token: "cached_token",
				expiry_date: Date.now() + 3600000,
				cached_at: Date.now()
			};

			mockKV.store.set(KV_TOKEN_KEY, cachedTokenData);

			const result = await authManager.getCachedTokenInfo();

			expect(result.cached).toBe(true);
			expect(result.cached_at).toBeDefined();
			expect(result.expires_at).toBeDefined();
			expect(result.time_until_expiry_seconds).toBeGreaterThan(0);
			expect(result.is_expired).toBe(false);
		});

		it("should return no cached info if no token exists", async () => {
			const result = await authManager.getCachedTokenInfo();

			expect(result.cached).toBe(false);
			expect(result.message).toBe("No token found in cache");
		});

		it("should return error info if KV get fails", async () => {
			mockKV.get.mockRejectedValue(new Error("KV error"));

			const result = await authManager.getCachedTokenInfo();

			expect(result.cached).toBe(false);
			expect(result.error).toBeDefined();
		});

		it("should indicate token is expired when expiry_date is in the past", async () => {
			const expiredTokenData = {
				access_token: "expired_token",
				expiry_date: Date.now() - 10000,
				cached_at: Date.now() - 100000
			};

			mockKV.store.set(KV_TOKEN_KEY, expiredTokenData);

			const result = await authManager.getCachedTokenInfo();

			expect(result.cached).toBe(true);
			expect(result.is_expired).toBe(true);
			expect(result.time_until_expiry_seconds).toBeLessThan(0);
		});
	});

	describe("callEndpoint", () => {
		const mockBody = { test: "data" };
		const mockResponse = { result: "success" };

		beforeEach(() => {
			// Set up valid credentials
			authManager = new AuthManager(mockEnv);
		});

		it("should successfully call endpoint with valid token", async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: jest.fn().mockResolvedValue(mockResponse)
			}) as jest.Mock;

			const result = await authManager.callEndpoint("testMethod", mockBody);

			expect(result).toEqual(mockResponse);
			expect(global.fetch).toHaveBeenCalledWith(
				`${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:testMethod`,
				expect.objectContaining({
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: "Bearer mock_access_token"
					}
				})
			);
		});

		it("should retry on 401 error and clear token cache", async () => {
			// First call returns 401, second call succeeds
			global.fetch = jest
				.fn()
				.mockResolvedValueOnce({
					ok: false,
					status: 401,
					text: jest.fn().mockResolvedValue("Unauthorized")
				})
				.mockResolvedValueOnce({
					ok: true,
					json: jest.fn().mockResolvedValue(mockResponse)
				}) as jest.Mock;

			const result = await authManager.callEndpoint("testMethod", mockBody);

			expect(result).toEqual(mockResponse);
			expect(global.fetch).toHaveBeenCalledTimes(2);
			expect(mockKV.delete).toHaveBeenCalledWith(KV_TOKEN_KEY);
		});

		it("should throw error on non-401 API failure", async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				status: 500,
				text: jest.fn().mockResolvedValue("Internal Server Error")
			}) as jest.Mock;

			await expect(authManager.callEndpoint("testMethod", mockBody)).rejects.toThrow(
				"API call failed with status 500"
			);
		});

		it("should throw error if retry also fails with 401", async () => {
			global.fetch = jest
				.fn()
				.mockResolvedValue({
					ok: false,
					status: 401,
					text: jest.fn().mockResolvedValue("Unauthorized")
				})
				.mockResolvedValue({
					ok: false,
					status: 401,
					text: jest.fn().mockResolvedValue("Unauthorized again")
				}) as jest.Mock;

			await expect(authManager.callEndpoint("testMethod", mockBody)).rejects.toThrow(
				"API call failed with status 401"
			);
		});
	});

	describe("getAccessToken", () => {
		it("should return null when no token is set", () => {
			const newAuthManager = new AuthManager(mockEnv);
			expect(newAuthManager.getAccessToken()).toBeNull();
		});

		it("should return access token after initialization", async () => {
			await authManager.initializeAuth();
			expect(authManager.getAccessToken()).toBe("mock_access_token");
		});
	});
});
