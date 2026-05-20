/// <reference types="jest" />
/// <reference types="node" />

import { GeminiApiClient } from "./gemini-client";
import { AuthManager } from "./auth";
import { Env, ChatMessage, StreamChunk, Tool, ToolChoice } from "./types";
import { geminiCliModels } from "./models";
import { CODE_ASSIST_ENDPOINT, CODE_ASSIST_API_VERSION } from "./config";
import { REASONING_MESSAGES, THINKING_CONTENT_CHUNK_SIZE } from "./constants";

// Mock dependencies
jest.mock("./auth");
jest.mock("./helpers/generation-config-validator");
jest.mock("./helpers/auto-model-switching");
jest.mock("./helpers/native-tools-manager");
jest.mock("./helpers/citations-processor");
jest.mock("./utils/image-utils");
jest.mock("./models");

// Mock types for dependencies
const mockAuthManager = {
	initializeAuth: jest.fn(),
	getAccessToken: jest.fn(),
	callEndpoint: jest.fn(),
	clearTokenCache: jest.fn()
};

const mockGenerationConfigValidator = {
	createValidatedConfig: jest.fn(),
	createSafetySettings: jest.fn(),
	createFinalToolConfiguration: jest.fn()
};

const mockAutoModelSwitchingHelper = {
	isEnabled: jest.fn(),
	getFallbackModel: jest.fn(),
	isRateLimitStatus: jest.fn(),
	isRateLimitError: jest.fn(),
	createSwitchNotification: jest.fn(),
	handleNonStreamingFallback: jest.fn()
};

const mockNativeToolsManager = {
	determineToolConfiguration: jest.fn(),
	processCitationsInText: jest.fn()
};

const mockCitationsProcessor = {
	processChunk: jest.fn()
};

const mockValidateImageUrl = jest.fn();

// Type for geminiCliModels mock
type GeminiCliModelsMock = Record<string, { supportsImages: boolean; thinking: boolean }>;

// Setup mocks before each test
beforeEach(() => {
	jest.clearAllMocks();

	// Setup default mock implementations
	(AuthManager as jest.MockedClass<typeof AuthManager>).mockImplementation(
		() => mockAuthManager as unknown as AuthManager
	);

	// Setup GenerationConfigValidator mock
	const { GenerationConfigValidator } = require("./helpers/generation-config-validator");
	GenerationConfigValidator.createValidatedConfig = mockGenerationConfigValidator.createValidatedConfig;
	GenerationConfigValidator.createSafetySettings = mockGenerationConfigValidator.createSafetySettings;
	GenerationConfigValidator.createFinalToolConfiguration = mockGenerationConfigValidator.createFinalToolConfiguration;

	// Setup AutoModelSwitchingHelper mock
	const { AutoModelSwitchingHelper } = require("./helpers/auto-model-switching");
	AutoModelSwitchingHelper.prototype.isEnabled = mockAutoModelSwitchingHelper.isEnabled;
	AutoModelSwitchingHelper.prototype.getFallbackModel = mockAutoModelSwitchingHelper.getFallbackModel;
	AutoModelSwitchingHelper.prototype.isRateLimitStatus = mockAutoModelSwitchingHelper.isRateLimitStatus;
	AutoModelSwitchingHelper.prototype.isRateLimitError = mockAutoModelSwitchingHelper.isRateLimitError;
	AutoModelSwitchingHelper.prototype.createSwitchNotification = mockAutoModelSwitchingHelper.createSwitchNotification;
	AutoModelSwitchingHelper.prototype.handleNonStreamingFallback = mockAutoModelSwitchingHelper.handleNonStreamingFallback;

	// Setup NativeToolsManager mock
	const { NativeToolsManager } = require("./helpers/native-tools-manager");
	NativeToolsManager.prototype.determineToolConfiguration = mockNativeToolsManager.determineToolConfiguration;
	NativeToolsManager.prototype.processCitationsInText = mockNativeToolsManager.processCitationsInText;

	// Setup CitationsProcessor mock
	const { CitationsProcessor } = require("./helpers/citations-processor");
	CitationsProcessor.prototype.processChunk = mockCitationsProcessor.processChunk;

	// Setup image-utils mock
	const { validateImageUrl } = require("./utils/image-utils");
	validateImageUrl.mockImplementation(mockValidateImageUrl);

	// Default mock implementations
	mockAuthManager.initializeAuth.mockResolvedValue(undefined);
	mockAuthManager.getAccessToken.mockReturnValue("mock-access-token");
	mockAuthManager.callEndpoint.mockResolvedValue({ cloudaicompanionProject: "test-project" });
	mockAuthManager.clearTokenCache.mockResolvedValue(undefined);

	mockGenerationConfigValidator.createValidatedConfig.mockReturnValue({});
	mockGenerationConfigValidator.createSafetySettings.mockReturnValue([]);
	mockGenerationConfigValidator.createFinalToolConfiguration.mockReturnValue({
		tools: undefined,
		toolConfig: undefined
	});

	mockAutoModelSwitchingHelper.isEnabled.mockReturnValue(false);
	mockAutoModelSwitchingHelper.getFallbackModel.mockReturnValue(null);
	mockAutoModelSwitchingHelper.isRateLimitStatus.mockReturnValue(false);
	mockAutoModelSwitchingHelper.isRateLimitError.mockReturnValue(false);
	mockAutoModelSwitchingHelper.createSwitchNotification.mockReturnValue("");
	mockAutoModelSwitchingHelper.handleNonStreamingFallback.mockResolvedValue(null);

	mockNativeToolsManager.determineToolConfiguration.mockReturnValue({
		useNativeTools: false,
		useCustomTools: false,
		nativeTools: [],
		priority: "native",
		toolType: "custom_only"
	});

	mockCitationsProcessor.processChunk.mockImplementation((text: string) => text);

	mockValidateImageUrl.mockReturnValue({ isValid: true, mimeType: "image/jpeg" });

	// Mock geminiCliModels
	(geminiCliModels as unknown as GeminiCliModelsMock)["gemini-2.5-flash"] = {
		supportsImages: true,
		thinking: false
	};
});

describe("GeminiApiClient", () => {
	let client: GeminiApiClient;
	let mockEnv: Env;

	beforeEach(() => {
		mockEnv = {
			GCP_SERVICE_ACCOUNT: JSON.stringify({
				access_token: "test-token",
				refresh_token: "test-refresh",
				scope: "test-scope",
				token_type: "Bearer",
				id_token: "test-id",
				expiry_date: Date.now() + 3600000
			}),
			GEMINI_CLI_KV: {
				get: jest.fn(),
				put: jest.fn(),
				delete: jest.fn()
			} as unknown as KVNamespace
		};

		client = new GeminiApiClient(mockEnv, mockAuthManager as unknown as AuthManager);
	});

	describe("constructor", () => {
		it("should create an instance with env and authManager", () => {
			expect(client).toBeInstanceOf(GeminiApiClient);
		});
	});

	describe("discoverProjectId", () => {
		it("should return GEMINI_PROJECT_ID from env if set", async () => {
			mockEnv.GEMINI_PROJECT_ID = "env-project-id";
			const result = await client.discoverProjectId();
			expect(result).toBe("env-project-id");
			expect(mockAuthManager.callEndpoint).not.toHaveBeenCalled();
		});

		it("should return cached projectId if already discovered", async () => {
			// First call to discover
			await client.discoverProjectId();
			expect(mockAuthManager.callEndpoint).toHaveBeenCalledTimes(1);

			// Reset mock to verify it's not called again
			jest.clearAllMocks();

			// Second call should use cache - need to restore mock after clear
			mockAuthManager.callEndpoint.mockResolvedValue({ cloudaicompanionProject: "test-project" });
			const result = await client.discoverProjectId();
			expect(result).toBe("test-project");
			expect(mockAuthManager.callEndpoint).not.toHaveBeenCalled();
		});

		it("should throw error if project ID discovery fails", async () => {
			mockAuthManager.callEndpoint.mockRejectedValue(new Error("API error"));
			await expect(client.discoverProjectId()).rejects.toThrow(
				"Could not discover project ID. Make sure you're authenticated and consider setting GEMINI_PROJECT_ID."
			);
		});

		it("should throw error if response has no cloudaicompanionProject", async () => {
			mockAuthManager.callEndpoint.mockResolvedValue({});
			await expect(client.discoverProjectId()).rejects.toThrow(
				"Could not discover project ID. Make sure you're authenticated and consider setting GEMINI_PROJECT_ID."
			);
		});
	});

	describe("messageToGeminiFormat (private method via integration)", () => {
		it("should convert simple text user message", async () => {
			// This is tested indirectly through streamContent
			const messages: ChatMessage[] = [
				{
					role: "user",
					content: "Hello"
				}
			];

			// Mock fetch to capture the request
			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.close();
					}
				})
			});
			global.fetch = mockFetch;

			const stream = client.streamContent("gemini-2.5-flash", "", messages);
			for await (const _ of stream) {
				// Consume stream
			}

			const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
			expect(requestBody.request.contents[0]).toEqual({
				role: "user",
				parts: [{ text: "Hello" }]
			});
		});

		it("should convert assistant message to model role", async () => {
			const messages: ChatMessage[] = [
				{
					role: "assistant",
					content: "Hi there"
				}
			];

			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.close();
					}
				})
			});
			global.fetch = mockFetch;

			const stream = client.streamContent("gemini-2.5-flash", "", messages);
			for await (const _ of stream) {
				// Consume stream
			}

			const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
			expect(requestBody.request.contents[0]).toEqual({
				role: "model",
				parts: [{ text: "Hi there" }]
			});
		});

		it("should convert tool message to function response format", async () => {
			const messages: ChatMessage[] = [
				{
					role: "tool",
					content: "Function result",
					tool_call_id: "test_function"
				}
			];

			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.close();
					}
				})
			});
			global.fetch = mockFetch;

			const stream = client.streamContent("gemini-2.5-flash", "", messages);
			for await (const _ of stream) {
				// Consume stream
			}

			const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
			expect(requestBody.request.contents[0]).toEqual({
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "test_function",
							response: {
								result: "Function result"
							}
						}
					}
				]
			});
		});

		it("should convert assistant message with tool calls", async () => {
			const messages: ChatMessage[] = [
				{
					role: "assistant",
					content: "Let me call a function",
					tool_calls: [
						{
							id: "call_1",
							type: "function",
							function: {
								name: "testFunction",
								arguments: '{"param": "value"}'
							}
						}
					]
				}
			];

			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.close();
					}
				})
			});
			global.fetch = mockFetch;

			const stream = client.streamContent("gemini-2.5-flash", "", messages);
			for await (const _ of stream) {
				// Consume stream
			}

			const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
			expect(requestBody.request.contents[0]).toEqual({
				role: "model",
				parts: [
					{ text: "Let me call a function" },
					{
						functionCall: {
							name: "testFunction",
							args: { param: "value" }
						}
					}
				]
			});
		});

		it("should handle multimodal content with text and image", async () => {
			mockValidateImageUrl.mockReturnValue({ isValid: true, mimeType: "image/jpeg" });

			const messages: ChatMessage[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "What is this?" },
						{ type: "image_url", image_url: { url: "data:image/jpeg;base64,test123" } }
					]
				}
			];

			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.close();
					}
				})
			});
			global.fetch = mockFetch;

			const stream = client.streamContent("gemini-2.5-flash", "", messages);
			for await (const _ of stream) {
				// Consume stream
			}

			const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
			expect(requestBody.request.contents[0]).toEqual({
				role: "user",
				parts: [
					{ text: "What is this?" },
					{
						inlineData: {
							mimeType: "image/jpeg",
							data: "test123"
						}
					}
				]
			});
		});

		it("should handle image URL with fileData format", async () => {
			mockValidateImageUrl.mockReturnValue({ isValid: true, mimeType: "image/png" });

			const messages: ChatMessage[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Analyze this" },
						{ type: "image_url", image_url: { url: "https://example.com/image.png" } }
					]
				}
			];

			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.close();
					}
				})
			});
			global.fetch = mockFetch;

			const stream = client.streamContent("gemini-2.5-flash", "", messages);
			for await (const _ of stream) {
				// Consume stream
			}

			const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
			expect(requestBody.request.contents[0]).toEqual({
				role: "user",
				parts: [
					{ text: "Analyze this" },
					{
						fileData: {
							mimeType: "image/png",
							fileUri: "https://example.com/image.png"
						}
					}
				]
			});
		});

		it("should throw error for invalid image URL", async () => {
			mockValidateImageUrl.mockReturnValue({ isValid: false, error: "Invalid image format" });

			const messages: ChatMessage[] = [
				{
					role: "user",
					content: [{ type: "image_url", image_url: { url: "invalid-url" } }]
				}
			];

			await expect(client.streamContent("gemini-2.5-flash", "", messages).next()).rejects.toThrow("Invalid image");
		});
	});

	describe("streamContent", () => {
		it("should initialize auth and discover project ID", async () => {
			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.close();
					}
				})
			});
			global.fetch = mockFetch;

			const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];
			const stream = client.streamContent("gemini-2.5-flash", "", messages);
			for await (const _ of stream) {
				// Consume stream
			}

			expect(mockAuthManager.initializeAuth).toHaveBeenCalled();
			// discoverProjectId is called on the client, not auth manager
		});

		it("should prepend system prompt as first message", async () => {
			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.close();
					}
				})
			});
			global.fetch = mockFetch;

			const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];
			const stream = client.streamContent("gemini-2.5-flash", "You are helpful", messages);
			for await (const _ of stream) {
				// Consume stream
			}

			const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
			expect(requestBody.request.contents[0]).toEqual({
				role: "user",
				parts: [{ text: "You are helpful" }]
			});
		});

		it("should call GenerationConfigValidator.createValidatedConfig", async () => {
			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.close();
					}
				})
			});
			global.fetch = mockFetch;

			const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];
			const options = {
				temperature: 0.8,
				max_tokens: 100,
				thinkingBudget: 1024
			};

			const stream = client.streamContent("gemini-2.5-flash", "", messages, options);
			for await (const _ of stream) {
				// Consume stream
			}

			const { GenerationConfigValidator } = require("./helpers/generation-config-validator");
			expect(GenerationConfigValidator.createValidatedConfig).toHaveBeenCalled();
		});

		it("should call NativeToolsManager.determineToolConfiguration when tools provided", async () => {
			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.close();
					}
				})
			});
			global.fetch = mockFetch;

			const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];
			const tools: Tool[] = [
				{
					type: "function",
					function: { name: "test", description: "test function" }
				}
			];

			const stream = client.streamContent("gemini-2.5-flash", "", messages, { tools });
			for await (const _ of stream) {
				// Consume stream
			}

			expect(mockNativeToolsManager.determineToolConfiguration).toHaveBeenCalled();
		});

		it("should yield reasoning output for thinking models with fake thinking", async () => {
			(geminiCliModels as unknown as jest.Mocked<typeof geminiCliModels>)["gemini-2.5-pro"] = {
				supportsImages: true,
				thinking: true
			} as never;

			mockEnv.ENABLE_FAKE_THINKING = "true";
			mockEnv.STREAM_THINKING_AS_CONTENT = "true";

			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.close();
					}
				})
			});
			global.fetch = mockFetch;

			const messages: ChatMessage[] = [{ role: "user", content: "Test question" }];
			const stream = client.streamContent("gemini-2.5-pro", "", messages);

			const chunks: StreamChunk[] = [];
			for await (const chunk of stream) {
				chunks.push(chunk);
			}

			// Should have thinking content chunks
			const thinkingChunks = chunks.filter((c) => c.type === "thinking_content");
			expect(thinkingChunks.length).toBeGreaterThan(0);
		});

		it("should handle 401 error and retry after clearing token cache", async () => {
			let callCount = 0;
			const mockFetch = jest.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve({
						ok: false,
						status: 401,
						text: () => Promise.resolve("Unauthorized")
					});
				}
				return Promise.resolve({
					ok: true,
					body: new ReadableStream({
						start(controller) {
							controller.close();
						}
					})
				});
			});
			global.fetch = mockFetch;

			const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];
			const stream = client.streamContent("gemini-2.5-flash", "", messages);

			try {
				for await (const _ of stream) {
					// Consume stream
				}
			} catch {
				// Expected to potentially fail on retry
			}

			expect(mockAuthManager.clearTokenCache).toHaveBeenCalled();
			expect(mockAuthManager.initializeAuth).toHaveBeenCalledTimes(2);
		});

		it("should throw error for non-retryable errors", async () => {
			const mockFetch = jest.fn().mockResolvedValue({
				ok: false,
				status: 500,
				text: () => Promise.resolve("Internal server error")
			});
			global.fetch = mockFetch;

			const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];
			const stream = client.streamContent("gemini-2.5-flash", "", messages);

			const consumeStream = async () => {
				for await (const _ of stream) {
					// Consume stream
				}
			};

			await expect(consumeStream()).rejects.toThrow("Stream request failed: 500");
		});

		it("should throw error when response has no body", async () => {
			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				body: null
			});
			global.fetch = mockFetch;

			const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];
			const stream = client.streamContent("gemini-2.5-flash", "", messages);

			const consumeStream = async () => {
				for await (const _ of stream) {
					// Consume stream
				}
			};

			await expect(consumeStream()).rejects.toThrow("Response has no body");
		});
	});

	describe("parseSSEStream (private method)", () => {
		it("should parse SSE stream correctly", async () => {
			// Create a mock SSE stream
			const encoder = new TextEncoder();
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode('data: {"response": {"candidates": [{"content": {"parts": [{"text": "Hello"}]}}]}}\n'));
					controller.enqueue(encoder.encode('\n'));
					controller.enqueue(encoder.encode('data: {"response": {"candidates": [{"content": {"parts": [{"text": " World"}]}}]}}\n'));
					controller.close();
				}
			});

			// Access private method via prototype
			const clientPrototype = GeminiApiClient.prototype as unknown as {
				parseSSEStream: (stream: ReadableStream<Uint8Array>) => AsyncGenerator<unknown>;
			};

			const results: unknown[] = [];
			for await (const result of clientPrototype.parseSSEStream.call(client, stream)) {
				results.push(result);
			}

			expect(results.length).toBe(2);
			expect(results[0]).toHaveProperty("response.candidates");
		});

		it("should handle empty SSE stream", async () => {
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.close();
				}
			});

			const clientPrototype = GeminiApiClient.prototype as unknown as {
				parseSSEStream: (stream: ReadableStream<Uint8Array>) => AsyncGenerator<unknown>;
			};

			const results: unknown[] = [];
			for await (const result of clientPrototype.parseSSEStream.call(client, stream)) {
				results.push(result);
			}

			expect(results.length).toBe(0);
		});
	});

	describe("generateReasoningOutput (private method)", () => {
		it("should generate reasoning output with streaming as content", async () => {
			mockEnv.ENABLE_FAKE_THINKING = "true";
			mockEnv.STREAM_THINKING_AS_CONTENT = "true";

			const messages: ChatMessage[] = [{ role: "user", content: "What is 2+2?" }];

			const clientPrototype = GeminiApiClient.prototype as unknown as {
				generateReasoningOutput: (
					messages: ChatMessage[],
					streamAsContent: boolean
				) => AsyncGenerator<StreamChunk>;
			};

			const chunks: StreamChunk[] = [];
			for await (const chunk of clientPrototype.generateReasoningOutput.call(client, messages, true)) {
				chunks.push(chunk);
			}

			// Should start with opening tag
			expect(chunks[0]).toEqual({
				type: "thinking_content",
				data: "<thinking>\n"
			});
		});

		it("should generate reasoning output as reasoning field", async () => {
			const messages: ChatMessage[] = [{ role: "user", content: "What is 2+2?" }];

			const clientPrototype = GeminiApiClient.prototype as unknown as {
				generateReasoningOutput: (
					messages: ChatMessage[],
					streamAsContent: boolean
				) => AsyncGenerator<StreamChunk>;
			};

			const chunks: StreamChunk[] = [];
			for await (const chunk of clientPrototype.generateReasoningOutput.call(client, messages, false)) {
				chunks.push(chunk);
			}

			// Should have reasoning type chunks
			const reasoningChunks = chunks.filter((c) => c.type === "reasoning");
			expect(reasoningChunks.length).toBeGreaterThan(0);
			expect(reasoningChunks[0].data).toHaveProperty("reasoning");
		});

		it("should handle array content in last user message", async () => {
			const messages: ChatMessage[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "First part" },
						{ type: "text", text: "Second part" }
					]
				}
			];

			const clientPrototype = GeminiApiClient.prototype as unknown as {
				generateReasoningOutput: (
					messages: ChatMessage[],
					streamAsContent: boolean
				) => AsyncGenerator<StreamChunk>;
			};

			const chunks: StreamChunk[] = [];
			for await (const chunk of clientPrototype.generateReasoningOutput.call(client, messages, false)) {
				chunks.push(chunk);
			}

			expect(chunks.length).toBeGreaterThan(0);
		});
	});

	describe("getCompletion", () => {
		it("should collect text chunks and return complete response", async () => {
			const mockStream = async function* (): AsyncGenerator<StreamChunk> {
				yield { type: "text", data: "Hello" };
				yield { type: "text", data: " World" };
				yield { type: "usage", data: { inputTokens: 10, outputTokens: 20 } };
			};

			// Mock streamContent
			const streamContentSpy = jest.spyOn(client, "streamContent").mockImplementation(mockStream);

			const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];
			const result = await client.getCompletion("gemini-2.5-flash", "", messages);

			expect(result.content).toBe("Hello World");
			expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
			expect(result.tool_calls).toBeUndefined();

			streamContentSpy.mockRestore();
		});

		it("should collect tool calls from stream", async () => {
			const mockStream = async function* (): AsyncGenerator<StreamChunk> {
				yield { type: "text", data: "Let me call a function" };
				yield {
					type: "tool_code",
					data: { name: "testFunction", args: { param: "value" } }
				};
			};

			const streamContentSpy = jest.spyOn(client, "streamContent").mockImplementation(mockStream);

			const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];
			const result = await client.getCompletion("gemini-2.5-flash", "", messages);

			expect(result.tool_calls).toHaveLength(1);
			expect(result.tool_calls?.[0].function.name).toBe("testFunction");
			expect(result.tool_calls?.[0].function.arguments).toBe('{"param":"value"}');

			streamContentSpy.mockRestore();
		});

		it("should handle rate limit error with auto model switching fallback", async () => {
			mockAutoModelSwitchingHelper.isRateLimitError.mockReturnValue(true);
			mockAutoModelSwitchingHelper.handleNonStreamingFallback.mockResolvedValue({
				content: "Fallback response",
				usage: { inputTokens: 5, outputTokens: 10 }
			});

			const mockError = new Error("Stream request failed: 429");
			const mockStream = async function* (): AsyncGenerator<StreamChunk> {
				throw mockError;
			};
			const streamContentSpy = jest.spyOn(client, "streamContent").mockImplementation(mockStream);

			const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];
			const result = await client.getCompletion("gemini-2.5-pro", "", messages);

			expect(result.content).toBe("Fallback response");
			expect(mockAutoModelSwitchingHelper.handleNonStreamingFallback).toHaveBeenCalled();

			streamContentSpy.mockRestore();
		});

		it("should re-throw non-rate-limit errors", async () => {
			const mockError = new Error("Network error");
			const mockStream = async function* (): AsyncGenerator<StreamChunk> {
				throw mockError;
			};
			const streamContentSpy = jest.spyOn(client, "streamContent").mockImplementation(mockStream);

			const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];

			await expect(client.getCompletion("gemini-2.5-flash", "", messages)).rejects.toThrow("Network error");

			streamContentSpy.mockRestore();
		});
	});

	describe("extractNativeToolsParams", () => {
		it("should extract boolean params from options", () => {
			const clientPrototype = GeminiApiClient.prototype as unknown as {
				extractNativeToolsParams: (options?: Record<string, unknown>) => {
					enableSearch?: boolean;
					enableUrlContext?: boolean;
					enableNativeTools?: boolean;
					nativeToolsPriority?: "native" | "custom" | "mixed";
				};
			};

			const options = {
				enable_search: true,
				enable_url_context: false,
				enable_native_tools: true,
				native_tools_priority: "native" as const
			};

			const result = clientPrototype.extractNativeToolsParams.call(client, options);

			expect(result.enableSearch).toBe(true);
			expect(result.enableUrlContext).toBe(false);
			expect(result.enableNativeTools).toBe(true);
			expect(result.nativeToolsPriority).toBe("native");
		});

		it("should extract params from extra_body", () => {
			const clientPrototype = GeminiApiClient.prototype as unknown as {
				extractNativeToolsParams: (options?: Record<string, unknown>) => {
					enableSearch?: boolean;
				};
			};

			const options = {
				extra_body: {
					enable_search: true
				}
			};

			const result = clientPrototype.extractNativeToolsParams.call(client, options);

			expect(result.enableSearch).toBe(true);
		});

		it("should extract params from model_params", () => {
			const clientPrototype = GeminiApiClient.prototype as unknown as {
				extractNativeToolsParams: (options?: Record<string, unknown>) => {
					enableSearch?: boolean;
				};
			};

			const options = {
				model_params: {
					enable_search: true
				}
			};

			const result = clientPrototype.extractNativeToolsParams.call(client, options);

			expect(result.enableSearch).toBe(true);
		});

		it("should return undefined for invalid priority values", () => {
			const clientPrototype = GeminiApiClient.prototype as unknown as {
				extractNativeToolsParams: (options?: Record<string, unknown>) => {
					nativeToolsPriority?: "native" | "custom" | "mixed";
				};
			};

			const options = {
				native_tools_priority: "invalid"
			};

			const result = clientPrototype.extractNativeToolsParams.call(client, options);

			expect(result.nativeToolsPriority).toBeUndefined();
		});
	});


	describe("performStreamRequest", () => {
		it("should process text content from response", async () => {
			const mockResponse = {
				ok: true,
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						const encoder = new TextEncoder();
						controller.enqueue(
							encoder.encode('data: {"response": {"candidates": [{"content": {"parts": [{"text": "Hello"}]}}]}}\n\n')
						);
						controller.close();
					}
				})
			};

			const mockFetch = jest.fn().mockResolvedValue(mockResponse);
			global.fetch = mockFetch;

			const clientPrototype = GeminiApiClient.prototype as unknown as {
				performStreamRequest: (
					streamRequest: unknown,
					needsThinkingClose?: boolean,
					isRetry?: boolean,
					realThinkingAsContent?: boolean,
					originalModel?: string,
					nativeToolsManager?: unknown
				) => AsyncGenerator<StreamChunk>;
			};

			const chunks: StreamChunk[] = [];
			for await (const chunk of clientPrototype.performStreamRequest.call(
				client,
				{ model: "gemini-2.5-flash", project: "test", request: { contents: [] } },
				false,
				false,
				false,
				"gemini-2.5-flash",
				mockNativeToolsManager
			)) {
				chunks.push(chunk);
			}

			expect(chunks.some((c) => c.type === "text" && c.data === "Hello")).toBe(true);
		});

		it("should process function calls from response", async () => {
			const mockResponse = {
				ok: true,
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						const encoder = new TextEncoder();
						controller.enqueue(
							encoder.encode(
								'data: {"response": {"candidates": [{"content": {"parts": [{"functionCall": {"name": "testFunc", "args": {"key": "value"}}}]}}]}}\n\n'
							)
						);
						controller.close();
					}
				})
			};

			const mockFetch = jest.fn().mockResolvedValue(mockResponse);
			global.fetch = mockFetch;

			const clientPrototype = GeminiApiClient.prototype as unknown as {
				performStreamRequest: (
					streamRequest: unknown,
					needsThinkingClose?: boolean,
					isRetry?: boolean,
					realThinkingAsContent?: boolean,
					originalModel?: string,
					nativeToolsManager?: unknown
				) => AsyncGenerator<StreamChunk>;
			};

			const chunks: StreamChunk[] = [];
			for await (const chunk of clientPrototype.performStreamRequest.call(
				client,
				{ model: "gemini-2.5-flash", project: "test", request: { contents: [] } },
				false,
				false,
				false,
				"gemini-2.5-flash",
				mockNativeToolsManager
			)) {
				chunks.push(chunk);
			}

			expect(chunks.some((c) => c.type === "tool_code")).toBe(true);
		});

		it("should process usage metadata from response", async () => {
			const mockResponse = {
				ok: true,
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						const encoder = new TextEncoder();
						controller.enqueue(
							encoder.encode(
								'data: {"response": {"usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 20}}}\n\n'
							)
						);
						controller.close();
					}
				})
			};

			const mockFetch = jest.fn().mockResolvedValue(mockResponse);
			global.fetch = mockFetch;

			const clientPrototype = GeminiApiClient.prototype as unknown as {
				performStreamRequest: (
					streamRequest: unknown,
					needsThinkingClose?: boolean,
					isRetry?: boolean,
					realThinkingAsContent?: boolean,
					originalModel?: string,
					nativeToolsManager?: unknown
				) => AsyncGenerator<StreamChunk>;
			};

			const chunks: StreamChunk[] = [];
			for await (const chunk of clientPrototype.performStreamRequest.call(
				client,
				{ model: "gemini-2.5-flash", project: "test", request: { contents: [] } },
				false,
				false,
				false,
				"gemini-2.5-flash",
				mockNativeToolsManager
			)) {
				chunks.push(chunk);
			}

			expect(chunks.some((c) => c.type === "usage")).toBe(true);
		});

		it("should process real thinking content when enabled", async () => {
			mockEnv.ENABLE_REAL_THINKING = "true";
			mockEnv.STREAM_THINKING_AS_CONTENT = "true";

			const mockResponse = {
				ok: true,
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						const encoder = new TextEncoder();
						controller.enqueue(
							encoder.encode(
								'data: {"response": {"candidates": [{"content": {"parts": [{"thought": true, "text": "Thinking..."}]}}]}}\n\n'
							)
						);
						controller.close();
					}
				})
			};

			const mockFetch = jest.fn().mockResolvedValue(mockResponse);
			global.fetch = mockFetch;

			const clientPrototype = GeminiApiClient.prototype as unknown as {
				performStreamRequest: (
					streamRequest: unknown,
					needsThinkingClose?: boolean,
					isRetry?: boolean,
					realThinkingAsContent?: boolean,
					originalModel?: string,
					nativeToolsManager?: unknown
				) => AsyncGenerator<StreamChunk>;
			};

			const chunks: StreamChunk[] = [];
			for await (const chunk of clientPrototype.performStreamRequest.call(
				client,
				{ model: "gemini-2.5-flash", project: "test", request: { contents: [] } },
				false,
				false,
				true,
				"gemini-2.5-flash",
				mockNativeToolsManager
			)) {
				chunks.push(chunk);
			}

			expect(chunks.some((c) => c.type === "thinking_content" && c.data === "Thinking...")).toBe(true);
		});

		it("should process <think> tags in text content", async () => {
			mockEnv.STREAM_THINKING_AS_CONTENT = "true";

			const mockResponse = {
				ok: true,
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						const encoder = new TextEncoder();
						controller.enqueue(
							encoder.encode(
								'data: {"response": {"candidates": [{"content": {"parts": [{"text": "<think>Let me think</think>Answer"}]}}]}}\n\n'
							)
						);
						controller.close();
					}
				})
			};

			const mockFetch = jest.fn().mockResolvedValue(mockResponse);
			global.fetch = mockFetch;

			const clientPrototype = GeminiApiClient.prototype as unknown as {
				performStreamRequest: (
					streamRequest: unknown,
					needsThinkingClose?: boolean,
					isRetry?: boolean,
					realThinkingAsContent?: boolean,
					originalModel?: string,
					nativeToolsManager?: unknown
				) => AsyncGenerator<StreamChunk>;
			};

			const chunks: StreamChunk[] = [];
			for await (const chunk of clientPrototype.performStreamRequest.call(
				client,
				{ model: "gemini-2.5-flash", project: "test", request: { contents: [] } },
				false,
				false,
				true,
				"gemini-2.5-flash",
				mockNativeToolsManager
			)) {
				chunks.push(chunk);
			}

			expect(chunks.some((c) => c.type === "thinking_content" && c.data === "Let me think")).toBe(true);
			expect(chunks.some((c) => c.type === "text" && c.data === "Answer")).toBe(true);
		});

		it("should close thinking tag before regular content when needed", async () => {
			mockEnv.ENABLE_FAKE_THINKING = "true";
			mockEnv.STREAM_THINKING_AS_CONTENT = "true";

			const mockResponse = {
				ok: true,
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						const encoder = new TextEncoder();
						controller.enqueue(
							encoder.encode('data: {"response": {"candidates": [{"content": {"parts": [{"text": "Answer"}]}}]}}\n\n')
						);
						controller.close();
					}
				})
			};

			const mockFetch = jest.fn().mockResolvedValue(mockResponse);
			global.fetch = mockFetch;

			const clientPrototype = GeminiApiClient.prototype as unknown as {
				performStreamRequest: (
					streamRequest: unknown,
					needsThinkingClose?: boolean,
					isRetry?: boolean,
					realThinkingAsContent?: boolean,
					originalModel?: string,
					nativeToolsManager?: unknown
				) => AsyncGenerator<StreamChunk>;
			};

			const chunks: StreamChunk[] = [];
			for await (const chunk of clientPrototype.performStreamRequest.call(
				client,
				{ model: "gemini-2.5-flash", project: "test", request: { contents: [] } },
				true, // needsThinkingClose = true
				false,
				false,
				"gemini-2.5-flash",
				mockNativeToolsManager
			)) {
				chunks.push(chunk);
			}

			expect(chunks.some((c) => c.type === "thinking_content" && c.data === "\n</thinking>\n\n")).toBe(true);
		});

		it("should apply citations processing when nativeToolsManager is provided", async () => {
			const mockResponse = {
				ok: true,
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						const encoder = new TextEncoder();
						controller.enqueue(
							encoder.encode('data: {"response": {"candidates": [{"content": {"parts": [{"text": "Hello"}]}}]}}\n\n')
						);
						controller.close();
					}
				})
			};

			const mockFetch = jest.fn().mockResolvedValue(mockResponse);
			global.fetch = mockFetch;
			mockCitationsProcessor.processChunk.mockReturnValue("Hello [1](http://example.com)");

			const clientPrototype = GeminiApiClient.prototype as unknown as {
				performStreamRequest: (
					streamRequest: unknown,
					needsThinkingClose?: boolean,
					isRetry?: boolean,
					realThinkingAsContent?: boolean,
					originalModel?: string,
					nativeToolsManager?: unknown
				) => AsyncGenerator<StreamChunk>;
			};

			const chunks: StreamChunk[] = [];
			for await (const chunk of clientPrototype.performStreamRequest.call(
				client,
				{ model: "gemini-2.5-flash", project: "test", request: { contents: [] } },
				false,
				false,
				false,
				"gemini-2.5-flash",
				mockNativeToolsManager
			)) {
				chunks.push(chunk);
			}

			expect(mockCitationsProcessor.processChunk).toHaveBeenCalled();
		});
	});
});
