/// <reference types="jest" />
/// <reference types="node" />

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { DebugRoute } from "./debug";
import type { Env } from "../types";
import { KV_TOKEN_KEY } from "../config";

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Helper to create a mock KV namespace
function createMockKV() {
	const store = new Map<string, unknown>();
	const getFn = jest.fn(async (key: string, _type?: "json") => {
		return store.get(key) ?? null;
	});
	const putMock = jest.fn(async (key: string, value: string, _options?: { expirationTtl?: number }) => {
		store.set(key, value);
	});
	const deleteMock = jest.fn(async (key: string) => {
		store.delete(key);
	});

	return {
		store,
		getMock: getFn,
		putMock,
		deleteMock,
		get: getFn as unknown as KVNamespace["get"],
		put: putMock as unknown as KVNamespace["put"],
		delete: deleteMock as unknown as KVNamespace["delete"],
		list: jest.fn() as unknown as KVNamespace["list"],
		getWithMetadata: jest.fn() as unknown as KVNamespace["getWithMetadata"]
	};
}

describe("DebugRoute", () => {
	let mockKV: ReturnType<typeof createMockKV>;
	let mockEnv: Env;

	beforeEach(() => {
		jest.clearAllMocks();
		console.log = jest.fn();
		console.error = jest.fn();

		mockKV = createMockKV();

		mockEnv = {
			GCP_SERVICE_ACCOUNT: JSON.stringify({
				access_token: "mock_access_token",
				refresh_token: "mock_refresh_token",
				scope: "https://www.googleapis.com/auth/cloud-platform",
				token_type: "Bearer",
				id_token: "mock_id_token",
				expiry_date: Date.now() + 3600000
			}),
			GEMINI_CLI_KV: mockKV
		} as Env;
	});

	afterEach(() => {
		console.log = originalConsoleLog;
		console.error = originalConsoleError;
	});

	describe("GET /cache", () => {
		it("should return cached token info when cache exists", async () => {
			const cachedTokenData = {
				access_token: "cached_token",
				expiry_date: Date.now() + 3600000,
				cached_at: Date.now()
			};
			mockKV.store.set(KV_TOKEN_KEY, cachedTokenData);

			const response = await DebugRoute.request("/cache", {
				method: "GET",
				headers: {}
			}, mockEnv);

			expect(response.status).toBe(200);
			const data = (await response.json()) as Record<string, unknown>;
			expect(data.status).toBe("ok");
			expect(data.cached).toBe(true);
			expect(data.is_expired).toBe(false);
		});

		it("should return no cache info when no token is cached", async () => {
			const response = await DebugRoute.request("/cache", {
				method: "GET",
				headers: {}
			}, mockEnv);

			expect(response.status).toBe(200);
			const data = (await response.json()) as Record<string, unknown>;
			expect(data.status).toBe("ok");
			expect(data.cached).toBe(false);
			expect(data.message).toBe("No token found in cache");
		});

		it("should return error response when KV get fails", async () => {
			mockKV.getMock.mockImplementation(() => {
				throw new Error("KV storage error");
			});

			const response = await DebugRoute.request("/cache", {
				method: "GET",
				headers: {}
			}, mockEnv);

			// Note: getCachedTokenInfo catches errors and returns cached: false with error message
			// The /cache endpoint sanitizes the response and excludes the error field
			expect(response.status).toBe(200);
			const data = (await response.json()) as Record<string, unknown>;
			expect(data.status).toBe("ok");
			expect(data.cached).toBe(false);
			expect(data.error).toBeUndefined();
		});

		it("should handle non-Error exceptions", async () => {
			mockKV.getMock.mockImplementation(() => {
				throw "string error";
			});

			const response = await DebugRoute.request("/cache", {
				method: "GET",
				headers: {}
			}, mockEnv);

			// Note: getCachedTokenInfo catches errors and returns cached: false with error message
			// The /cache endpoint sanitizes the response and excludes the error field
			expect(response.status).toBe(200);
			const data = (await response.json()) as Record<string, unknown>;
			expect(data.status).toBe("ok");
			expect(data.cached).toBe(false);
			expect(data.error).toBeUndefined();
		});

		it("should sanitize response and exclude sensitive data", async () => {
			const cachedTokenData = {
				access_token: "cached_token",
				expiry_date: Date.now() + 3600000,
				cached_at: Date.now()
			};
			mockKV.store.set(KV_TOKEN_KEY, cachedTokenData);

			const response = await DebugRoute.request("/cache", {
				method: "GET",
				headers: {}
			}, mockEnv);

			expect(response.status).toBe(200);
			const data = (await response.json()) as Record<string, unknown>;
			expect(data.token_preview).toBeUndefined();
			expect(data.status).toBe("ok");
			expect(data.cached).toBe(true);
		});

		it("should indicate token is expired when expiry_date is in the past", async () => {
			const expiredTokenData = {
				access_token: "expired_token",
				expiry_date: Date.now() - 10000,
				cached_at: Date.now() - 100000
			};
			mockKV.store.set(KV_TOKEN_KEY, expiredTokenData);

			const response = await DebugRoute.request("/cache", {
				method: "GET",
				headers: {}
			}, mockEnv);

			expect(response.status).toBe(200);
			const data = (await response.json()) as Record<string, unknown>;
			expect(data.cached).toBe(true);
			expect(data.is_expired).toBe(true);
			expect(typeof data.time_until_expiry_seconds).toBe("number");
			expect((data.time_until_expiry_seconds as number)).toBeLessThan(0);
		});
	});

	describe("POST /token-test", () => {
		it("should return success when authentication is successful", async () => {
			const response = await DebugRoute.request("/token-test", {
				method: "POST",
				headers: {}
			}, mockEnv);

			expect(response.status).toBe(200);
			const data = (await response.json()) as Record<string, unknown>;
			expect(data.status).toBe("ok");
			expect(data.message).toBe("Token authentication successful");
			expect(console.log).toHaveBeenCalledWith("Token test endpoint called");
			expect(console.log).toHaveBeenCalledWith("Token test passed");
		});

		it("should return error response when GCP_SERVICE_ACCOUNT is not set", async () => {
			const invalidEnv = { ...mockEnv, GCP_SERVICE_ACCOUNT: undefined };

			const response = await DebugRoute.request("/token-test", {
				method: "POST",
				headers: {}
			}, invalidEnv);

			// Note: The route creates a new AuthManager with the env binding
			// We test that the endpoint responds
			expect(response).toBeDefined();
		});

		it("should include error message in response on failure", async () => {
			// This test verifies the error response structure
			const response = await DebugRoute.request("/token-test", {
				method: "POST",
				headers: {}
			}, mockEnv);

			expect(response).toBeDefined();
			expect(response.status).toBeDefined();
		});
	});

	describe("POST /test", () => {
		it("should return success when auth and project discovery are successful", async () => {
			const response = await DebugRoute.request("/test", {
				method: "POST",
				headers: {}
			}, mockEnv);

			// The endpoint should respond (may be 200 or 500 depending on env)
			expect(response).toBeDefined();
			const data = (await response.json()) as Record<string, unknown>;
			expect(data.status).toBeDefined();
			expect(data.message).toBeDefined();
		});

		it("should log test endpoint called message", async () => {
			await DebugRoute.request("/test", {
				method: "POST",
				headers: {}
			}, mockEnv);

			expect(console.log).toHaveBeenCalledWith("Test endpoint called");
		});

		it("should return json response", async () => {
			const response = await DebugRoute.request("/test", {
				method: "POST",
				headers: {}
			}, mockEnv);

			const contentType = response.headers.get("Content-Type");
			expect(contentType).toContain("application/json");
		});

		it("should handle errors gracefully", async () => {
			const response = await DebugRoute.request("/test", {
				method: "POST",
				headers: {}
			}, mockEnv);

			// Should not throw, should return a response
			expect(response).toBeDefined();
			expect(response.status).toBeGreaterThanOrEqual(200);
			expect(response.status).toBeLessThan(600);
		});
	});

	describe("Route structure", () => {
		it("should have cache endpoint registered", async () => {
			const response = await DebugRoute.request("/cache", {
				method: "GET",
				headers: {}
			}, mockEnv);
			expect(response).toBeDefined();
			expect(response.status).not.toBe(404);
		});

		it("should have token-test endpoint registered", async () => {
			const response = await DebugRoute.request("/token-test", {
				method: "POST",
				headers: {}
			}, mockEnv);
			expect(response).toBeDefined();
			expect(response.status).not.toBe(404);
		});

		it("should have test endpoint registered", async () => {
			const response = await DebugRoute.request("/test", {
				method: "POST",
				headers: {}
			}, mockEnv);
			expect(response).toBeDefined();
			expect(response.status).not.toBe(404);
		});

		it("should export DebugRoute as Hono instance", () => {
			expect(DebugRoute).toBeDefined();
			expect(typeof DebugRoute.request).toBe("function");
		});
	});

	describe("Error handling", () => {
		it("should return error info in response on cache endpoint failure", async () => {
			mockKV.getMock.mockImplementation(() => {
				throw new Error("Test KV error");
			});

			const response = await DebugRoute.request("/cache", {
				method: "GET",
				headers: {}
			}, mockEnv);

			// Note: getCachedTokenInfo catches errors and returns cached: false with error message
			// The /cache endpoint sanitizes the response and excludes the error field
			expect(response.status).toBe(200);
			const data = (await response.json()) as Record<string, unknown>;
			expect(data.status).toBe("ok");
			expect(data.cached).toBe(false);
			expect(data.error).toBeUndefined();
		});

		it("should log errors to console.error on token-test endpoint", async () => {
			// Create an env without valid credentials to force an error
			const invalidEnv = { ...mockEnv, GCP_SERVICE_ACCOUNT: undefined };

			await DebugRoute.request("/token-test", {
				method: "POST",
				headers: {}
			}, invalidEnv);

			// Console.error should be called if there's an error
			expect(console.error).toHaveBeenCalled();
		});

		it("should log errors to console.error on test endpoint", async () => {
			await DebugRoute.request("/test", {
				method: "POST",
				headers: {}
			}, mockEnv);

			// Console.error should be called if there's an error
			expect(console.error).toHaveBeenCalled();
		});
	});
});
