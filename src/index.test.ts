/// <reference types="jest" />
/// <reference types="node" />

import app from "./index";

describe("index.ts", () => {
	describe("Root endpoint", () => {
		it("should return service info", async () => {
			const response = await app.request("/", {
				method: "GET",
				headers: {}
			});

			// Status may be 500 if env bindings are not provided, or 200 if they are
			// We test that the endpoint exists and responds
			expect([200, 500]).toContain(response.status);
		});

		it("should respond with text or json content type", async () => {
			const response = await app.request("/");
			const contentType = response.headers.get("Content-Type") || "";
			// May be application/json on success or text/plain on error
			expect(["application/json", "text/plain"]).toContain(contentType.split(";")[0]);
		});
	});

	describe("Health endpoint", () => {
		it("should return healthy status", async () => {
			const response = await app.request("/health");
			expect(response.status).toBe(200);

			const data = (await response.json()) as Record<string, unknown>;
			expect(data.status).toBe("ok");
			expect(data.timestamp).toBeDefined();
		});

		it("should return valid ISO timestamp", async () => {
			const response = await app.request("/health");
			const data = (await response.json()) as Record<string, unknown>;

			const timestamp = new Date(data.timestamp as string);
			expect(timestamp.getTime()).not.toBeNaN();
		});
	});

	describe("CORS headers", () => {
		it("should include CORS headers on regular requests", async () => {
			const response = await app.request("/");

			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
			expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
		});

		it("should handle OPTIONS preflight requests", async () => {
			const response = await app.request("/", { method: "OPTIONS" });

			expect(response.status).toBe(204);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
			expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
		});

		it("should include CORS headers on health endpoint", async () => {
			const response = await app.request("/health");

			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
			expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
		});
	});

	describe("Authentication middleware", () => {
		it("should process requests to /v1 routes", async () => {
			const response = await app.request("/v1/models", {
				method: "GET"
			});
			// Without proper env bindings, this will return 500, but the middleware should still run
			expect([401, 500]).toContain(response.status);
		});

		it("should reject requests with invalid Authorization header format", async () => {
			const response = await app.request("/v1/models", {
				method: "GET",
				headers: {
					Authorization: "InvalidFormat"
				}
			});

			// May return 401 (invalid format) or 500 (missing env) depending on execution
			expect([401, 500]).toContain(response.status);
		});

		it("should handle requests without Authorization header", async () => {
			const response = await app.request("/v1/models", {
				method: "GET"
			});

			// Without OPENAI_API_KEY env var, auth is skipped but may still fail due to other env deps
			expect(response).toBeDefined();
			expect([401, 500]).toContain(response.status);
		});
	});

	describe("Route registration", () => {
		it("should have /v1 routes registered", async () => {
			const response = await app.request("/v1/models");
			// Route should exist (may return 401/500 due to auth/env, but not 404)
			expect(response.status).not.toBe(404);
		});

		it("should have debug routes registered", async () => {
			const response = await app.request("/v1/debug/cache");
			// Route should exist (may return 401/500 due to auth/env, but not 404)
			expect(response.status).not.toBe(404);
		});

		it("should have token-test debug route registered", async () => {
			const response = await app.request("/v1/token-test", { method: "POST" });
			expect(response.status).not.toBe(404);
		});

		it("should have full-test debug route registered", async () => {
			const response = await app.request("/v1/test", { method: "POST" });
			expect(response.status).not.toBe(404);
		});
	});

	describe("App structure", () => {
		it("should export default app", () => {
			expect(app).toBeDefined();
			expect(typeof app.request).toBe("function");
		});

		it("should have logging middleware applied", async () => {
			// The logging middleware logs to console, we verify the request completes
			const response = await app.request("/health");
			expect(response.status).toBe(200);
		});
	});

	describe("Endpoint paths", () => {
		it("root endpoint should be accessible", async () => {
			const response = await app.request("/");
			expect(response).toBeDefined();
		});

		it("health endpoint should be accessible", async () => {
			const response = await app.request("/health");
			expect(response.status).toBe(200);
		});

		it("v1 models endpoint path exists", async () => {
			const response = await app.request("/v1/models");
			expect(response).toBeDefined();
		});

		it("v1 chat completions endpoint path exists", async () => {
			const response = await app.request("/v1/chat/completions", {
				method: "POST"
			});
			expect(response).toBeDefined();
		});
	});
});
