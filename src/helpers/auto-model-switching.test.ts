/// <reference types="jest" />

import { AutoModelSwitchingHelper } from "./auto-model-switching";
import { Env, ChatMessage, UsageData, StreamChunk } from "../types";

/**
 * Unit tests for AutoModelSwitchingHelper
 */
describe("AutoModelSwitchingHelper", () => {
	const createMockEnv = (overrides?: Partial<Env>): Env => ({
		GCP_SERVICE_ACCOUNT: "{}",
		GEMINI_CLI_KV: {} as KVNamespace,
		...overrides
	});

	describe("constructor", () => {
		it("should create an instance with the provided env", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper).toBeInstanceOf(AutoModelSwitchingHelper);
		});
	});

	describe("isEnabled", () => {
		it("should return true when ENABLE_AUTO_MODEL_SWITCHING is 'true'", () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "true" });
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.isEnabled()).toBe(true);
		});

		it("should return false when ENABLE_AUTO_MODEL_SWITCHING is 'false'", () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "false" });
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.isEnabled()).toBe(false);
		});

		it("should return false when ENABLE_AUTO_MODEL_SWITCHING is undefined", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.isEnabled()).toBe(false);
		});

		it("should return false when ENABLE_AUTO_MODEL_SWITCHING is an empty string", () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "" });
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.isEnabled()).toBe(false);
		});
	});

	describe("getFallbackModel", () => {
		it("should return the fallback model for gemini-2.5-pro", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.getFallbackModel("gemini-2.5-pro")).toBe("gemini-2.5-flash");
		});

		it("should return null for models without a configured fallback", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.getFallbackModel("gemini-2.0-flash")).toBeNull();
		});

		it("should return null for an empty string model", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.getFallbackModel("")).toBeNull();
		});

		it("should return null for an unknown model", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.getFallbackModel("unknown-model")).toBeNull();
		});
	});

	describe("isRateLimitError", () => {
		it("should return true for 429 rate limit error", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			const error = new Error("Stream request failed: 429 Too Many Requests");
			expect(helper.isRateLimitError(error)).toBe(true);
		});

		it("should return true for 503 rate limit error", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			const error = new Error("Stream request failed: 503 Service Unavailable");
			expect(helper.isRateLimitError(error)).toBe(true);
		});

		it("should return false for non-rate-limit errors", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			const error = new Error("Stream request failed: 400 Bad Request");
			expect(helper.isRateLimitError(error)).toBe(false);
		});

		it("should return false for non-Error objects", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.isRateLimitError("string error")).toBe(false);
			expect(helper.isRateLimitError({ message: "error" })).toBe(false);
			expect(helper.isRateLimitError(null)).toBe(false);
			expect(helper.isRateLimitError(undefined)).toBe(false);
		});

		it("should return false for Error without rate limit message", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			const error = new Error("Some other error");
			expect(helper.isRateLimitError(error)).toBe(false);
		});
	});

	describe("isRateLimitStatus", () => {
		it("should return true for 429 status code", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.isRateLimitStatus(429)).toBe(true);
		});

		it("should return true for 503 status code", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.isRateLimitStatus(503)).toBe(true);
		});

		it("should return false for other status codes", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.isRateLimitStatus(200)).toBe(false);
			expect(helper.isRateLimitStatus(400)).toBe(false);
			expect(helper.isRateLimitStatus(401)).toBe(false);
			expect(helper.isRateLimitStatus(404)).toBe(false);
			expect(helper.isRateLimitStatus(500)).toBe(false);
		});
	});

	describe("shouldAttemptFallback", () => {
		it("should return true when enabled and fallback model exists", () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "true" });
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.shouldAttemptFallback("gemini-2.5-pro")).toBe(true);
		});

		it("should return false when disabled even if fallback model exists", () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "false" });
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.shouldAttemptFallback("gemini-2.5-pro")).toBe(false);
		});

		it("should return false when no fallback model exists even if enabled", () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "true" });
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.shouldAttemptFallback("unknown-model")).toBe(false);
		});

		it("should return false when disabled and no fallback model exists", () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "false" });
			const helper = new AutoModelSwitchingHelper(env);
			expect(helper.shouldAttemptFallback("unknown-model")).toBe(false);
		});
	});

	describe("createSwitchNotification", () => {
		it("should create a notification message with original and fallback models", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			const notification = helper.createSwitchNotification("gemini-2.5-pro", "gemini-2.5-flash");
			expect(notification).toBe("[Auto-switched from gemini-2.5-pro to gemini-2.5-flash due to rate limiting]\n\n");
		});

		it("should work with any model names", () => {
			const env = createMockEnv();
			const helper = new AutoModelSwitchingHelper(env);
			const notification = helper.createSwitchNotification("model-a", "model-b");
			expect(notification).toBe("[Auto-switched from model-a to model-b due to rate limiting]\n\n");
		});
	});

	describe("handleNonStreamingFallback", () => {
		const createMockStreamChunk = (type: StreamChunk["type"], data: StreamChunk["data"]): StreamChunk => ({
			type,
			data
		});

		const createMockMessages = (): ChatMessage[] => [
			{ role: "user", content: "Hello" },
			{ role: "assistant", content: "Hi there!" }
		];

		it("should return null when auto model switching is disabled", async () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "false" });
			const helper = new AutoModelSwitchingHelper(env);

			const mockStreamFn = jest.fn().mockImplementation(async function* () {
				// Empty generator
			});

			const result = await helper.handleNonStreamingFallback(
				"gemini-2.5-pro",
				"system prompt",
				createMockMessages(),
				undefined,
				mockStreamFn
			);

			expect(result).toBeNull();
			expect(mockStreamFn).not.toHaveBeenCalled();
		});

		it("should return null when no fallback model exists", async () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "true" });
			const helper = new AutoModelSwitchingHelper(env);

			const mockStreamFn = jest.fn().mockImplementation(async function* () {
				// Empty generator
			});

			const result = await helper.handleNonStreamingFallback(
				"unknown-model",
				"system prompt",
				createMockMessages(),
				undefined,
				mockStreamFn
			);

			expect(result).toBeNull();
			expect(mockStreamFn).not.toHaveBeenCalled();
		});

		it("should collect text chunks from the stream", async () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "true" });
			const helper = new AutoModelSwitchingHelper(env);

			const mockChunks: StreamChunk[] = [
				createMockStreamChunk("text", "Hello"),
				createMockStreamChunk("text", " "),
				createMockStreamChunk("text", "World")
			];

			const mockStreamFn = jest.fn().mockImplementation(async function* () {
				for (const chunk of mockChunks) {
					yield chunk;
				}
			});

			const result = await helper.handleNonStreamingFallback(
				"gemini-2.5-pro",
				"system prompt",
				createMockMessages(),
				undefined,
				mockStreamFn
			);

			expect(result).not.toBeNull();
			expect(result?.content).toContain("[Auto-switched from gemini-2.5-pro to gemini-2.5-flash due to rate limiting]");
			expect(result?.content).toContain("Hello World");
			expect(mockStreamFn).toHaveBeenCalledWith("gemini-2.5-flash", "system prompt", createMockMessages(), undefined);
		});

		it("should collect usage data from the stream", async () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "true" });
			const helper = new AutoModelSwitchingHelper(env);

			const mockUsage: UsageData = { inputTokens: 10, outputTokens: 20 };
			const mockChunks: StreamChunk[] = [
				createMockStreamChunk("text", "Response"),
				createMockStreamChunk("usage", mockUsage)
			];

			const mockStreamFn = jest.fn().mockImplementation(async function* () {
				for (const chunk of mockChunks) {
					yield chunk;
				}
			});

			const result = await helper.handleNonStreamingFallback(
				"gemini-2.5-pro",
				"system prompt",
				createMockMessages(),
				undefined,
				mockStreamFn
			);

			expect(result).not.toBeNull();
			expect(result?.usage).toEqual(mockUsage);
		});

		it("should pass options to the stream function", async () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "true" });
			const helper = new AutoModelSwitchingHelper(env);

			const mockChunks: StreamChunk[] = [createMockStreamChunk("text", "Response")];
			const mockStreamFn = jest.fn().mockImplementation(async function* () {
				for (const chunk of mockChunks) {
					yield chunk;
				}
			});

			const options = { includeReasoning: true, thinkingBudget: 1024 };

			await helper.handleNonStreamingFallback(
				"gemini-2.5-pro",
				"system prompt",
				createMockMessages(),
				options,
				mockStreamFn
			);

			expect(mockStreamFn).toHaveBeenCalledWith("gemini-2.5-flash", "system prompt", createMockMessages(), options);
		});

		it("should handle empty stream", async () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "true" });
			const helper = new AutoModelSwitchingHelper(env);

			const mockStreamFn = jest.fn().mockImplementation(async function* () {
				// Empty generator
			});

			const result = await helper.handleNonStreamingFallback(
				"gemini-2.5-pro",
				"system prompt",
				createMockMessages(),
				undefined,
				mockStreamFn
			);

			expect(result).not.toBeNull();
			expect(result?.content).toContain("[Auto-switched from gemini-2.5-pro to gemini-2.5-flash due to rate limiting]");
			expect(result?.usage).toBeUndefined();
		});

		it("should handle stream with only usage data", async () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "true" });
			const helper = new AutoModelSwitchingHelper(env);

			const mockUsage: UsageData = { inputTokens: 5, outputTokens: 10 };
			const mockChunks: StreamChunk[] = [createMockStreamChunk("usage", mockUsage)];

			const mockStreamFn = jest.fn().mockImplementation(async function* () {
				for (const chunk of mockChunks) {
					yield chunk;
				}
			});

			const result = await helper.handleNonStreamingFallback(
				"gemini-2.5-pro",
				"system prompt",
				createMockMessages(),
				undefined,
				mockStreamFn
			);

			expect(result).not.toBeNull();
			expect(result?.content).toContain("[Auto-switched from gemini-2.5-pro to gemini-2.5-flash due to rate limiting]");
			expect(result?.usage).toEqual(mockUsage);
		});

		it("should log rate limit message when switching models", async () => {
			const env = createMockEnv({ ENABLE_AUTO_MODEL_SWITCHING: "true" });
			const helper = new AutoModelSwitchingHelper(env);

			const consoleSpy = jest.spyOn(console, "log").mockImplementation();

			const mockChunks: StreamChunk[] = [createMockStreamChunk("text", "Response")];
			const mockStreamFn = jest.fn().mockImplementation(async function* () {
				for (const chunk of mockChunks) {
					yield chunk;
				}
			});

			await helper.handleNonStreamingFallback(
				"gemini-2.5-pro",
				"system prompt",
				createMockMessages(),
				undefined,
				mockStreamFn
			);

			expect(consoleSpy).toHaveBeenCalledWith(
				"Got rate limit error for model gemini-2.5-pro, switching to fallback model: gemini-2.5-flash"
			);

			consoleSpy.mockRestore();
		});
	});
});
