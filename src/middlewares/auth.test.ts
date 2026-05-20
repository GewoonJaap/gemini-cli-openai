/// <reference types="jest" />
/// <reference types="node" />

import { describe, it, expect, jest } from "@jest/globals";
import { openAIApiKeyAuth } from "./auth";
import type { Env } from "../types";
import type { Context, Next } from "hono";

interface MockReq {
	path: string;
	header: jest.Mock;
}

interface MockContext {
	req: MockReq;
	env: {
		OPENAI_API_KEY?: string;
	};
	json: jest.Mock;
}

const createMockContext = (path: string = "/", openaiApiKey?: string): unknown => {
	const ctx: Partial<MockContext> = {
		req: {
			path,
			header: jest.fn(),
		},
		env: {
			OPENAI_API_KEY: openaiApiKey,
		},
		json: jest.fn(),
	};
	return ctx;
};

describe("auth.ts", () => {
	describe("openAIApiKeyAuth", () => {
		describe("public endpoints", () => {
			it("should skip authentication for root path '/'", async () => {
				const ctx = createMockContext("/", "test-key") as Partial<Context<{ Bindings: Env }>> & {
					req: MockReq;
					json: jest.Mock;
				};
				const next: Next = jest.fn<() => Promise<void>>(() => Promise.resolve()) as unknown as Next;
				await openAIApiKeyAuth(ctx as unknown as Context<{ Bindings: Env }>, next);
				expect(next).toHaveBeenCalled();
				expect(ctx.json).not.toHaveBeenCalled();
			});

			it("should skip authentication for '/health' path", async () => {
				const ctx = createMockContext("/health", "test-key") as Partial<Context<{ Bindings: Env }>> & {
					req: MockReq;
					json: jest.Mock;
				};
				const next: Next = jest.fn<() => Promise<void>>(() => Promise.resolve()) as unknown as Next;
				await openAIApiKeyAuth(ctx as unknown as Context<{ Bindings: Env }>, next);
				expect(next).toHaveBeenCalled();
				expect(ctx.json).not.toHaveBeenCalled();
			});
		});

		describe("when OPENAI_API_KEY is not set", () => {
			it("should allow request without API key configured", async () => {
				const ctx = createMockContext("/v1/chat/completions", undefined) as Partial<
					Context<{ Bindings: Env }>
				> & {
					req: MockReq;
					json: jest.Mock;
				};
				const next: Next = jest.fn<() => Promise<void>>(() => Promise.resolve()) as unknown as Next;
				ctx.req.header.mockReturnValue("Bearer any-token");
				await openAIApiKeyAuth(ctx as unknown as Context<{ Bindings: Env }>, next);
				expect(next).toHaveBeenCalled();
				expect(ctx.json).not.toHaveBeenCalled();
			});
		});

		describe("when OPENAI_API_KEY is set", () => {
			describe("missing Authorization header", () => {
				it("should return 401 when Authorization header is missing", async () => {
					const ctx = createMockContext("/v1/chat/completions", "test-key") as Partial<
						Context<{ Bindings: Env }>
					> & {
						req: MockReq;
						json: jest.Mock;
					};
					const next: Next = jest.fn<() => Promise<void>>(() => Promise.resolve()) as unknown as Next;
					ctx.req.header.mockReturnValue(undefined);
					await openAIApiKeyAuth(ctx as unknown as Context<{ Bindings: Env }>, next);
					expect(ctx.json).toHaveBeenCalledWith(
						{
							error: {
								message: "Missing Authorization header",
								type: "authentication_error",
								code: "missing_authorization",
							},
						},
						401,
					);
					expect(next).not.toHaveBeenCalled();
				});
			});

			describe("invalid Authorization header format", () => {
				it("should return 401 when Authorization header does not have Bearer prefix", async () => {
					const ctx = createMockContext("/v1/chat/completions", "test-key") as Partial<
						Context<{ Bindings: Env }>
					> & {
						req: MockReq;
						json: jest.Mock;
					};
					const next: Next = jest.fn<() => Promise<void>>(() => Promise.resolve()) as unknown as Next;
					ctx.req.header.mockReturnValue("Basic some-token");
					await openAIApiKeyAuth(ctx as unknown as Context<{ Bindings: Env }>, next);
					expect(ctx.json).toHaveBeenCalledWith(
						{
							error: {
								message: "Invalid Authorization header format. Expected: Bearer <token>",
								type: "authentication_error",
								code: "invalid_authorization_format",
							},
						},
						401,
					);
					expect(next).not.toHaveBeenCalled();
				});

				it("should return 401 when Authorization header is just 'Bearer' without token", async () => {
					const ctx = createMockContext("/v1/chat/completions", "test-key") as Partial<
						Context<{ Bindings: Env }>
					> & {
						req: MockReq;
						json: jest.Mock;
					};
					const next: Next = jest.fn<() => Promise<void>>(() => Promise.resolve()) as unknown as Next;
					ctx.req.header.mockReturnValue("Bearer");
					await openAIApiKeyAuth(ctx as unknown as Context<{ Bindings: Env }>, next);
					expect(ctx.json).toHaveBeenCalledWith(
						{
							error: {
								message: "Invalid Authorization header format. Expected: Bearer <token>",
								type: "authentication_error",
								code: "invalid_authorization_format",
							},
						},
						401,
					);
					expect(next).not.toHaveBeenCalled();
				});

				it("should return 401 for malformed Authorization header", async () => {
					const ctx = createMockContext("/v1/chat/completions", "test-key") as Partial<
						Context<{ Bindings: Env }>
					> & {
						req: MockReq;
						json: jest.Mock;
					};
					const next: Next = jest.fn<() => Promise<void>>(() => Promise.resolve()) as unknown as Next;
					ctx.req.header.mockReturnValue("InvalidFormat");
					await openAIApiKeyAuth(ctx as unknown as Context<{ Bindings: Env }>, next);
					expect(ctx.json).toHaveBeenCalledWith(
						{
							error: {
								message: "Invalid Authorization header format. Expected: Bearer <token>",
								type: "authentication_error",
								code: "invalid_authorization_format",
							},
						},
						401,
					);
					expect(next).not.toHaveBeenCalled();
				});
			});

			describe("invalid API key", () => {
				it("should return 401 when provided key does not match", async () => {
					const ctx = createMockContext("/v1/chat/completions", "test-key") as Partial<
						Context<{ Bindings: Env }>
					> & {
						req: MockReq;
						json: jest.Mock;
					};
					const next: Next = jest.fn<() => Promise<void>>(() => Promise.resolve()) as unknown as Next;
					ctx.req.header.mockReturnValue("Bearer wrong-key");
					await openAIApiKeyAuth(ctx as unknown as Context<{ Bindings: Env }>, next);
					expect(ctx.json).toHaveBeenCalledWith(
						{
							error: {
								message: "Invalid API key",
								type: "authentication_error",
								code: "invalid_api_key",
							},
						},
						401,
					);
					expect(next).not.toHaveBeenCalled();
				});
			});

			describe("valid API key", () => {
				it("should call next() when API key matches", async () => {
					const ctx = createMockContext("/v1/chat/completions", "test-key") as Partial<
						Context<{ Bindings: Env }>
					> & {
						req: MockReq;
						json: jest.Mock;
					};
					const next: Next = jest.fn<() => Promise<void>>(() => Promise.resolve()) as unknown as Next;
					ctx.req.header.mockReturnValue("Bearer test-key");
					await openAIApiKeyAuth(ctx as unknown as Context<{ Bindings: Env }>, next);
					expect(next).toHaveBeenCalled();
					expect(ctx.json).not.toHaveBeenCalled();
				});

				it("should call next() with extra whitespace in Bearer token", async () => {
					const ctx = createMockContext("/v1/chat/completions", "test-key") as Partial<
						Context<{ Bindings: Env }>
					> & {
						req: MockReq;
						json: jest.Mock;
					};
					const next: Next = jest.fn<() => Promise<void>>(() => Promise.resolve()) as unknown as Next;
					ctx.req.header.mockReturnValue("Bearer  test-key");
					await openAIApiKeyAuth(ctx as unknown as Context<{ Bindings: Env }>, next);
					expect(next).toHaveBeenCalled();
					expect(ctx.json).not.toHaveBeenCalled();
				});
			});
		});
	});
});
