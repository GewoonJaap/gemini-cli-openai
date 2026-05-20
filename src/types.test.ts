/// <reference types="jest" />
/// <reference types="node" />

import type {
	SafetyThreshold,
	Env,
	OAuth2Credentials,
	ModelInfo,
	EffortLevel,
	Tool,
	ToolChoice,
	ChatCompletionRequest,
	ToolCall,
	ChatMessage,
	MessageContent,
	ChatCompletionResponse,
	ChatCompletionChoice,
	ChatCompletionMessage,
	ChatCompletionUsage,
	GeminiFunctionCall,
	UsageData,
	ReasoningData,
	StreamChunk,
} from "./types";

import { describe, it, expect } from "@jest/globals";

describe("types.ts", () => {
	describe("SafetyThreshold", () => {
		it("should accept valid safety threshold values", () => {
			const values: SafetyThreshold[] = [
				"BLOCK_NONE",
				"BLOCK_FEW",
				"BLOCK_SOME",
				"BLOCK_ONLY_HIGH",
				"HARM_BLOCK_THRESHOLD_UNSPECIFIED",
			];
			expect(values).toHaveLength(5);
		});
	});

	describe("Env", () => {
		it("should create valid Env object with required fields", () => {
			const env: Env = {
				GCP_SERVICE_ACCOUNT: "test-credentials",
				GEMINI_CLI_KV: {} as KVNamespace,
			};
			expect(env.GCP_SERVICE_ACCOUNT).toBe("test-credentials");
		});

		it("should accept optional Env fields", () => {
			const env: Env = {
				GCP_SERVICE_ACCOUNT: "test-credentials",
				GEMINI_CLI_KV: {} as KVNamespace,
				GEMINI_PROJECT_ID: "test-project",
				OPENAI_API_KEY: "test-key",
				ENABLE_FAKE_THINKING: "true",
				ENABLE_REAL_THINKING: "true",
				STREAM_THINKING_AS_CONTENT: "true",
				ENABLE_AUTO_MODEL_SWITCHING: "true",
				GEMINI_MODERATION_HARASSMENT_THRESHOLD: "BLOCK_NONE",
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_GOOGLE_SEARCH: "true",
				ENABLE_URL_CONTEXT: "true",
				GEMINI_TOOLS_PRIORITY: "native_first",
				DEFAULT_TO_NATIVE_TOOLS: "true",
				ALLOW_REQUEST_TOOL_CONTROL: "true",
				ENABLE_INLINE_CITATIONS: "true",
				INCLUDE_GROUNDING_METADATA: "true",
				INCLUDE_SEARCH_ENTRY_POINT: "true",
			};
			expect(env.GEMINI_PROJECT_ID).toBe("test-project");
		});
	});

	describe("OAuth2Credentials", () => {
		it("should create valid OAuth2Credentials object", () => {
			const credentials: OAuth2Credentials = {
				access_token: "access-token",
				refresh_token: "refresh-token",
				scope: "read write",
				token_type: "Bearer",
				id_token: "id-token",
				expiry_date: 1234567890,
			};
			expect(credentials.access_token).toBe("access-token");
			expect(credentials.expiry_date).toBe(1234567890);
		});
	});

	describe("ModelInfo", () => {
	});

	describe("EffortLevel", () => {
		it("should accept valid effort level values", () => {
			const values: EffortLevel[] = ["none", "low", "medium", "high"];
			expect(values).toHaveLength(4);
		});
	});

	describe("Tool", () => {
		it("should create valid Tool object", () => {
			const tool: Tool = {
				type: "function",
				function: {
					name: "testFunction",
					description: "A test function",
					parameters: { type: "object" },
				},
			};
			expect(tool.type).toBe("function");
			expect(tool.function.name).toBe("testFunction");
		});

		it("should create Tool with minimal fields", () => {
			const tool: Tool = {
				type: "function",
				function: {
					name: "minimalFunction",
				},
			};
			expect(tool.function.name).toBe("minimalFunction");
		});
	});

	describe("ToolChoice", () => {
		it("should accept string values", () => {
			const choices: ToolChoice[] = ["none", "auto"];
			expect(choices).toHaveLength(2);
		});

		it("should accept function object", () => {
			const choice: ToolChoice = {
				type: "function",
				function: { name: "specificFunction" },
			};
			expect(choice.type).toBe("function");
		});
	});

	describe("ChatCompletionRequest", () => {
		it("should create valid ChatCompletionRequest with minimal fields", () => {
			const request: ChatCompletionRequest = {
				model: "gemini-pro",
				messages: [{ role: "user", content: "Hello" }],
			};
			expect(request.model).toBe("gemini-pro");
		});

		it("should accept optional stream field", () => {
			const request: ChatCompletionRequest = {
				model: "gemini-pro",
				messages: [{ role: "user", content: "Hello" }],
				stream: true,
			};
			expect(request.stream).toBe(true);
		});

		it("should accept thinking_budget and reasoning_effort", () => {
			const request: ChatCompletionRequest = {
				model: "gemini-pro",
				messages: [{ role: "user", content: "Hello" }],
				thinking_budget: 1000,
				reasoning_effort: "high",
			};
			expect(request.thinking_budget).toBe(1000);
			expect(request.reasoning_effort).toBe("high");
		});

		it("should accept tools and tool_choice", () => {
			const request: ChatCompletionRequest = {
				model: "gemini-pro",
				messages: [{ role: "user", content: "Hello" }],
				tools: [
					{
						type: "function",
						function: { name: "test" },
					},
				],
				tool_choice: "auto",
			};
			expect(request.tools).toHaveLength(1);
		});

		it("should accept extra_body parameters", () => {
			const request: ChatCompletionRequest = {
				model: "gemini-pro",
				messages: [{ role: "user", content: "Hello" }],
				extra_body: {
					reasoning_effort: "medium",
					enable_search: true,
					enable_url_context: true,
					enable_native_tools: true,
					native_tools_priority: "native",
				},
			};
			expect(request.extra_body?.enable_search).toBe(true);
		});

		it("should accept model_params", () => {
			const request: ChatCompletionRequest = {
				model: "gemini-pro",
				messages: [{ role: "user", content: "Hello" }],
				model_params: {
					reasoning_effort: "low",
					enable_native_tools: false,
				},
			};
			expect(request.model_params?.enable_native_tools).toBe(false);
		});

		it("should accept OpenAI standard parameters", () => {
			const request: ChatCompletionRequest = {
				model: "gemini-pro",
				messages: [{ role: "user", content: "Hello" }],
				max_tokens: 100,
				temperature: 0.7,
				top_p: 0.9,
				stop: ["END"],
				presence_penalty: 0.5,
				frequency_penalty: 0.5,
				seed: 42,
				response_format: { type: "json_object" },
			};
			expect(request.max_tokens).toBe(100);
			expect(request.temperature).toBe(0.7);
		});

		it("should accept native tools flags", () => {
			const request: ChatCompletionRequest = {
				model: "gemini-pro",
				messages: [{ role: "user", content: "Hello" }],
				enable_search: true,
				enable_url_context: true,
				enable_native_tools: true,
				native_tools_priority: "custom",
			};
			expect(request.enable_search).toBe(true);
		});
	});

	describe("ToolCall", () => {
		it("should create valid ToolCall object", () => {
			const toolCall: ToolCall = {
				id: "call-123",
				type: "function",
				function: {
					name: "testFunction",
					arguments: '{"arg": "value"}',
				},
			};
			expect(toolCall.id).toBe("call-123");
			expect(toolCall.function.name).toBe("testFunction");
		});
	});

	describe("ChatMessage", () => {
		it("should create valid ChatMessage with string content", () => {
			const message: ChatMessage = {
				role: "user",
				content: "Hello, world!",
			};
			expect(message.role).toBe("user");
			expect(message.content).toBe("Hello, world!");
		});

		it("should create valid ChatMessage with array content", () => {
			const message: ChatMessage = {
				role: "user",
				content: [
					{ type: "text", text: "Hello" },
					{ type: "image_url", image_url: { url: "https://example.com/img.png" } },
				],
			};
			expect(Array.isArray(message.content)).toBe(true);
		});

		it("should accept optional tool_calls", () => {
			const message: ChatMessage = {
				role: "assistant",
				content: "Let me call a function",
				tool_calls: [
					{
						id: "call-1",
						type: "function",
						function: { name: "test", arguments: "{}" },
					},
				],
			};
			expect(message.tool_calls).toHaveLength(1);
		});

		it("should accept optional tool_call_id", () => {
			const message: ChatMessage = {
				role: "tool",
				content: "Result",
				tool_call_id: "call-1",
			};
			expect(message.tool_call_id).toBe("call-1");
		});
	});

	describe("MessageContent", () => {
		it("should create text content", () => {
			const content: MessageContent = {
				type: "text",
				text: "Hello",
			};
			expect(content.type).toBe("text");
			expect(content.text).toBe("Hello");
		});

		it("should create image_url content with required url", () => {
			const content: MessageContent = {
				type: "image_url",
				image_url: { url: "https://example.com/img.png" },
			};
			expect(content.type).toBe("image_url");
			expect(content.image_url?.url).toBe("https://example.com/img.png");
		});

		it("should accept optional detail for image_url", () => {
			const content: MessageContent = {
				type: "image_url",
				image_url: { url: "https://example.com/img.png", detail: "high" },
			};
			expect(content.image_url?.detail).toBe("high");
		});
	});

	describe("ChatCompletionResponse", () => {
		it("should create valid ChatCompletionResponse", () => {
			const response: ChatCompletionResponse = {
				id: "chatcmpl-123",
				object: "chat.completion",
				created: 1234567890,
				model: "gemini-pro",
				choices: [
					{
						index: 0,
						message: { role: "assistant", content: "Hello!" },
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 5,
					total_tokens: 15,
				},
			};
			expect(response.id).toBe("chatcmpl-123");
			expect(response.object).toBe("chat.completion");
		});
	});

	describe("ChatCompletionChoice", () => {
		it("should create valid ChatCompletionChoice", () => {
			const choice: ChatCompletionChoice = {
				index: 0,
				message: { role: "assistant", content: "Response" },
				finish_reason: "stop",
			};
			expect(choice.index).toBe(0);
			expect(choice.finish_reason).toBe("stop");
		});

		it("should accept all finish_reason values", () => {
			const reasons: Array<ChatCompletionChoice["finish_reason"]> = [
				"stop",
				"length",
				"tool_calls",
				"content_filter",
				null,
			];
			expect(reasons).toHaveLength(5);
		});
	});

	describe("ChatCompletionMessage", () => {
		it("should create valid ChatCompletionMessage", () => {
			const message: ChatCompletionMessage = {
				role: "assistant",
				content: "Hello!",
			};
			expect(message.role).toBe("assistant");
		});

		it("should accept null content", () => {
			const message: ChatCompletionMessage = {
				role: "assistant",
				content: null,
			};
			expect(message.content).toBe(null);
		});

		it("should accept optional tool_calls", () => {
			const message: ChatCompletionMessage = {
				role: "assistant",
				content: null,
				tool_calls: [
					{
						id: "call-1",
						type: "function",
						function: { name: "test", arguments: "{}" },
					},
				],
			};
			expect(message.tool_calls).toHaveLength(1);
		});
	});

	describe("ChatCompletionUsage", () => {
		it("should create valid ChatCompletionUsage", () => {
			const usage: ChatCompletionUsage = {
				prompt_tokens: 100,
				completion_tokens: 50,
				total_tokens: 150,
			};
			expect(usage.prompt_tokens).toBe(100);
			expect(usage.total_tokens).toBe(150);
		});
	});

	describe("GeminiFunctionCall", () => {
		it("should create valid GeminiFunctionCall", () => {
			const call: GeminiFunctionCall = {
				name: "testFunction",
				args: { param: "value" },
			};
			expect(call.name).toBe("testFunction");
			expect(call.args).toEqual({ param: "value" });
		});
	});

	describe("UsageData", () => {
		it("should create valid UsageData", () => {
			const usage: UsageData = {
				inputTokens: 100,
				outputTokens: 50,
			};
			expect(usage.inputTokens).toBe(100);
			expect(usage.outputTokens).toBe(50);
		});
	});

	describe("ReasoningData", () => {
		it("should create valid ReasoningData with required field", () => {
			const data: ReasoningData = {
				reasoning: "This is the reasoning",
			};
			expect(data.reasoning).toBe("This is the reasoning");
		});

		it("should accept optional toolCode", () => {
			const data: ReasoningData = {
				reasoning: "Reasoning here",
				toolCode: "function_call_code",
			};
			expect(data.toolCode).toBe("function_call_code");
		});
	});

	describe("StreamChunk", () => {
		it("should create text stream chunk", () => {
			const chunk: StreamChunk = {
				type: "text",
				data: "Hello world",
			};
			expect(chunk.type).toBe("text");
			expect(chunk.data).toBe("Hello world");
		});

		it("should create usage stream chunk", () => {
			const chunk: StreamChunk = {
				type: "usage",
				data: { inputTokens: 10, outputTokens: 5 } as UsageData,
			};
			expect(chunk.type).toBe("usage");
		});

		it("should create reasoning stream chunk", () => {
			const chunk: StreamChunk = {
				type: "reasoning",
				data: { reasoning: "Thinking..." } as ReasoningData,
			};
			expect(chunk.type).toBe("reasoning");
		});

		it("should create thinking_content stream chunk", () => {
			const chunk: StreamChunk = {
				type: "thinking_content",
				data: "Internal thought",
			};
			expect(chunk.type).toBe("thinking_content");
		});

		it("should create real_thinking stream chunk", () => {
			const chunk: StreamChunk = {
				type: "real_thinking",
				data: "Real thinking output",
			};
			expect(chunk.type).toBe("real_thinking");
		});

		it("should create tool_code stream chunk", () => {
			const chunk: StreamChunk = {
				type: "tool_code",
				data: { reasoning: "Tool execution", toolCode: "code" } as ReasoningData,
			};
			expect(chunk.type).toBe("tool_code");
		});

		it("should create native_tool stream chunk", () => {
			const chunk: StreamChunk = {
				type: "native_tool",
				data: { type: "search", data: {} } as { type: "search"; data: unknown },
			};
			expect(chunk.type).toBe("native_tool");
		});

		it("should create grounding_metadata stream chunk", () => {
			const chunk: StreamChunk = {
				type: "grounding_metadata",
				data: { type: "search", data: { metadata: "test" } } as {
					type: "search";
					data: unknown;
				},
			};
			expect(chunk.type).toBe("grounding_metadata");
		});
	});
});
