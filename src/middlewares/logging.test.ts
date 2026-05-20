/// <reference types="jest" />
/// <reference types="node" />

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { loggingMiddleware } from "./logging";
import type { Context, Next } from "hono";
import type { Env } from "../types";

interface MockReq {
	method: string;
	path: string;
	raw: {
		clone: () => {
			text: () => Promise<string>;
		};
	};
}

interface MockContext {
	req: MockReq;
	res: {
		status: number;
	};
}

const createMockContext = (
	method: string = "GET",
	path: string = "/test",
	status: number = 200,
): MockContext => {
	const ctx: Partial<MockContext> = {
		req: {
			method,
			path,
			raw: {
				clone: () => ({
					text: async () => "",
				}),
			},
		},
		res: {
			status,
		},
	};
	return ctx as MockContext;
};

describe("loggingMiddleware", () => {
	let mockContext: MockContext;
	let mockNext: Next;
	let consoleLogSpy: ReturnType<typeof jest.spyOn>;

	beforeEach(() => {
		consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		mockNext = jest.fn<() => Promise<void>>(() => Promise.resolve()) as unknown as Next;
		mockContext = createMockContext();
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		jest.clearAllMocks();
	});

	describe("GET requests", () => {
		it("should log request start without body for GET request", async () => {
			mockContext = createMockContext("GET", "/test");

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			expect(consoleLogSpy).toHaveBeenCalledTimes(2);
			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain("GET");
			expect(firstLog).toContain("/test");
			expect(firstLog).toContain("Request started");
			expect(firstLog).not.toContain("Body");
		});

		it("should log request completion with status and duration for GET request", async () => {
			mockContext = createMockContext("GET", "/test", 200);

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const secondLog = consoleLogSpy.mock.calls[1][0];
			expect(secondLog).toContain("GET");
			expect(secondLog).toContain("/test");
			expect(secondLog).toContain("Completed with status 200");
			expect(secondLog).toMatch(/\(\d+ms\)/);
		});
	});

	describe("POST requests", () => {
		it("should log request with body for POST request", async () => {
			mockContext = createMockContext("POST", "/test");
			mockContext.req.raw.clone = () => ({
				text: async () => JSON.stringify({ name: "test", value: 123 }),
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain("POST");
			expect(firstLog).toContain("Body");
			expect(firstLog).toContain("name");
			expect(firstLog).toContain("test");
		});

		it("should mask api_key in request body", async () => {
			mockContext = createMockContext("POST", "/test");
			mockContext.req.raw.clone = () => ({
				text: async () => JSON.stringify({ api_key: "secret123", data: "public" }),
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain('"api_key": "***"');
			expect(firstLog).not.toContain("secret123");
		});

		it("should mask apiKey in request body", async () => {
			mockContext = createMockContext("POST", "/test");
			mockContext.req.raw.clone = () => ({
				text: async () => JSON.stringify({ apiKey: "secret123", data: "public" }),
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain('"apiKey": "***"');
			expect(firstLog).not.toContain("secret123");
		});

		it("should mask token in request body", async () => {
			mockContext = createMockContext("POST", "/test");
			mockContext.req.raw.clone = () => ({
				text: async () => JSON.stringify({ token: "secret123", data: "public" }),
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain('"token": "***"');
			expect(firstLog).not.toContain("secret123");
		});

		it("should mask authorization in request body", async () => {
			mockContext = createMockContext("POST", "/test");
			mockContext.req.raw.clone = () => ({
				text: async () => JSON.stringify({ authorization: "Bearer secret123", data: "public" }),
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain('"authorization": "***"');
			expect(firstLog).not.toContain("Bearer secret123");
		});

		it("should mask multiple sensitive fields in request body", async () => {
			mockContext = createMockContext("POST", "/test");
			mockContext.req.raw.clone = () => ({
				text: async () => JSON.stringify({ api_key: "key123", token: "tok456", data: "public" }),
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain('"api_key": "***"');
			expect(firstLog).toContain('"token": "***"');
			expect(firstLog).not.toContain("key123");
			expect(firstLog).not.toContain("tok456");
		});

		it("should truncate long request body", async () => {
			mockContext = createMockContext("POST", "/test");
			const longBody = JSON.stringify({ data: "x".repeat(600) });
			mockContext.req.raw.clone = () => ({
				text: async () => longBody,
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain("...");
			expect(firstLog.length).toBeLessThan(longBody.length);
		});

		it("should handle body parse failure gracefully", async () => {
			mockContext = createMockContext("POST", "/test");
			mockContext.req.raw.clone = () => ({
				text: async () => {
					throw new Error("Parse error");
				},
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain("[unable to parse]");
		});
	});

	describe("PUT requests", () => {
		it("should log request with body for PUT request", async () => {
			mockContext = createMockContext("PUT", "/test");
			mockContext.req.raw.clone = () => ({
				text: async () => JSON.stringify({ updated: true }),
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain("PUT");
			expect(firstLog).toContain("Body");
			expect(firstLog).toContain("updated");
		});

		it("should mask sensitive data in PUT request body", async () => {
			mockContext = createMockContext("PUT", "/test");
			mockContext.req.raw.clone = () => ({
				text: async () => JSON.stringify({ api_key: "newkey123" }),
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain('"api_key": "***"');
			expect(firstLog).not.toContain("newkey123");
		});
	});

	describe("PATCH requests", () => {
		it("should log request with body for PATCH request", async () => {
			mockContext = createMockContext("PATCH", "/test");
			mockContext.req.raw.clone = () => ({
				text: async () => JSON.stringify({ patched: true }),
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain("PATCH");
			expect(firstLog).toContain("Body");
			expect(firstLog).toContain("patched");
		});

		it("should mask sensitive data in PATCH request body", async () => {
			mockContext = createMockContext("PATCH", "/test");
			mockContext.req.raw.clone = () => ({
				text: async () => JSON.stringify({ token: "patchtoken" }),
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain('"token": "***"');
			expect(firstLog).not.toContain("patchtoken");
		});
	});

	describe("DELETE requests", () => {
		it("should not log body for DELETE request", async () => {
			mockContext = createMockContext("DELETE", "/test");

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain("DELETE");
			expect(firstLog).not.toContain("Body");
		});
	});

	describe("response logging", () => {
		it("should log different status codes", async () => {
			mockContext = createMockContext("GET", "/test", 404);

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const secondLog = consoleLogSpy.mock.calls[1][0];
			expect(secondLog).toContain("Completed with status 404");
		});

		it("should log 500 status code", async () => {
			mockContext = createMockContext("GET", "/test", 500);

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const secondLog = consoleLogSpy.mock.calls[1][0];
			expect(secondLog).toContain("Completed with status 500");
		});

		it("should log 201 status code", async () => {
			mockContext = createMockContext("GET", "/test", 201);

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const secondLog = consoleLogSpy.mock.calls[1][0];
			expect(secondLog).toContain("Completed with status 201");
		});

		it("should call next middleware", async () => {
			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			expect(mockNext).toHaveBeenCalledTimes(1);
		});

		it("should log duration in milliseconds", async () => {
			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const secondLog = consoleLogSpy.mock.calls[1][0];
			expect(secondLog).toMatch(/\(\d+ms\)/);
		});
	});

	describe("timestamp format", () => {
		it("should include ISO timestamp in request log", async () => {
			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			// ISO format: YYYY-MM-DDTHH:mm:ss.sssZ
			expect(firstLog).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z?\]/);
		});

		it("should include ISO timestamp in response log", async () => {
			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const secondLog = consoleLogSpy.mock.calls[1][0];
			expect(secondLog).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z?\]/);
		});
	});

	describe("case insensitive masking", () => {
		it("should mask API_KEY in uppercase", async () => {
			mockContext = createMockContext("POST", "/test");
			mockContext.req.raw.clone = () => ({
				text: async () => JSON.stringify({ API_KEY: "upper123" }),
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain('"API_KEY": "***"');
			expect(firstLog).not.toContain("upper123");
		});

		it("should mask Token with capital T", async () => {
			mockContext = createMockContext("POST", "/test");
			mockContext.req.raw.clone = () => ({
				text: async () => JSON.stringify({ Token: "capital123" }),
			});

			await loggingMiddleware(mockContext as Context<{ Bindings: Env }>, mockNext);

			const firstLog = consoleLogSpy.mock.calls[0][0];
			expect(firstLog).toContain('"Token": "***"');
			expect(firstLog).not.toContain("capital123");
		});
	});
});
