/// <reference types="jest" />
/// <reference types="node" />

// Polyfill for TransformStream in Node.js
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TransformStream } = require("stream/web");

// Make TransformStream available globally for the code under test
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(globalThis as any).TransformStream) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).TransformStream = TransformStream;
}

import { createOpenAIStreamTransformer } from "./stream-transformer";
import { StreamChunk, UsageData, ReasoningData, GeminiFunctionCall } from "./types";
import { NativeToolResponse } from "./types/native-tools";

describe("createOpenAIStreamTransformer", () => {
	const mockModel = "test-model";
	const decoder = new TextDecoder();

	/**
	 * Process chunks using the TransformStream with proper async handling.
	 */
	const processChunksAsync = async (inputChunks: StreamChunk[]): Promise<{ outputs: string[]; finalOutput: string }> => {
		const transformer = createOpenAIStreamTransformer(mockModel);
		const writer = transformer.writable.getWriter();
		const reader = transformer.readable.getReader();

		const outputs: string[] = [];
		let finalOutput = "";

		// Write all input chunks
		const writePromise = (async () => {
			for (const chunk of inputChunks) {
				await writer.write(chunk);
			}
			await writer.close();
		})();

		// Read all output chunks
		const readPromise = (async () => {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				const text = decoder.decode(value);
				// Separate [DONE] marker from the final chunk
				if (text.includes("[DONE]")) {
					finalOutput += text;
				} else {
					outputs.push(text);
					finalOutput += text;
				}
			}
		})();

		// Wait for both write and read to complete
		await Promise.all([writePromise, readPromise]);

		return { outputs, finalOutput };
	};

	const parseChunk = (text: string): Record<string, unknown> => {
		return JSON.parse(text.replace("data: ", "").trim()) as Record<string, unknown>;
	};

	describe("text chunks", () => {
		it("should transform text chunk with role on first chunk", async () => {
			const inputChunks: StreamChunk[] = [{ type: "text", data: "Hello" }];
			const { outputs, finalOutput } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBeGreaterThan(0);
			const chunk = parseChunk(outputs[0]);
			expect(chunk.id).toMatch(/^chatcmpl-/);
			expect(chunk.object).toBe("chat.completion.chunk");
			expect(chunk.model).toBe(mockModel);
			expect(chunk.choices).toHaveLength(1);
			const choices = chunk.choices as Array<Record<string, unknown>>;
			expect(choices[0]).toEqual({
				index: 0,
				delta: { role: "assistant", content: "Hello" },
				finish_reason: null,
				logprobs: null,
				matched_stop: null
			});
			expect(chunk.usage).toBeNull();

			// Check final chunk
			expect(finalOutput).toBeTruthy();
		});

		it("should transform subsequent text chunks without role", async () => {
			const inputChunks: StreamChunk[] = [
				{ type: "text", data: "First" },
				{ type: "text", data: "Second" }
			];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(3); // 2 text chunks + 1 final chunk
			const chunk0 = parseChunk(outputs[0]);
			const chunk1 = parseChunk(outputs[1]);
			const choices0 = chunk0.choices as Array<Record<string, unknown>>;
			const choices1 = chunk1.choices as Array<Record<string, unknown>>;
			const delta0 = choices0[0].delta as Record<string, unknown>;
			const delta1 = choices1[0].delta as Record<string, unknown>;
			expect(delta0).toEqual({ role: "assistant", content: "First" });
			expect(delta1).toEqual({ content: "Second" });
		});

		it("should handle empty text chunks", async () => {
			const inputChunks: StreamChunk[] = [{ type: "text", data: "" }];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(2); // 1 text chunk + 1 final chunk
			const chunk = parseChunk(outputs[0]);
			const choices = chunk.choices as Array<Record<string, unknown>>;
			const delta = choices[0].delta as Record<string, unknown>;
			expect(delta).toEqual({ role: "assistant", content: "" });
		});
	});

	describe("thinking_content chunks", () => {
		it("should transform thinking_content chunk with role on first chunk", async () => {
			const inputChunks: StreamChunk[] = [{ type: "thinking_content", data: "Let me think" }];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(2); // 1 thinking_content chunk + 1 final chunk
			const chunk = parseChunk(outputs[0]);
			const choices = chunk.choices as Array<Record<string, unknown>>;
			const delta = choices[0].delta as Record<string, unknown>;
			expect(delta).toEqual({ role: "assistant", content: "Let me think" });
		});

		it("should transform subsequent thinking_content chunks without role", async () => {
			const inputChunks: StreamChunk[] = [
				{ type: "thinking_content", data: "First thought" },
				{ type: "thinking_content", data: "Second thought" }
			];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(3); // 2 thinking_content chunks + 1 final chunk
			const chunk0 = parseChunk(outputs[0]);
			const chunk1 = parseChunk(outputs[1]);
			const choices0 = chunk0.choices as Array<Record<string, unknown>>;
			const choices1 = chunk1.choices as Array<Record<string, unknown>>;
			const delta0 = choices0[0].delta as Record<string, unknown>;
			const delta1 = choices1[0].delta as Record<string, unknown>;
			expect(delta0).toEqual({ role: "assistant", content: "First thought" });
			expect(delta1).toEqual({ content: "Second thought" });
		});
	});

	describe("real_thinking chunks", () => {
		it("should transform real_thinking chunk with reasoning field", async () => {
			const inputChunks: StreamChunk[] = [{ type: "real_thinking", data: "Deep thought" }];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(2); // 1 real_thinking chunk + 1 final chunk
			const chunk = parseChunk(outputs[0]);
			const choices = chunk.choices as Array<Record<string, unknown>>;
			const delta = choices[0].delta as Record<string, unknown>;
			expect(delta).toEqual({ reasoning: "Deep thought" });
		});

		it("should handle multiple real_thinking chunks", async () => {
			const inputChunks: StreamChunk[] = [
				{ type: "real_thinking", data: "Thought 1" },
				{ type: "real_thinking", data: "Thought 2" }
			];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(3); // 2 real_thinking chunks + 1 final chunk
			const chunk0 = parseChunk(outputs[0]);
			const chunk1 = parseChunk(outputs[1]);
			const choices0 = chunk0.choices as Array<Record<string, unknown>>;
			const choices1 = chunk1.choices as Array<Record<string, unknown>>;
			const delta0 = choices0[0].delta as Record<string, unknown>;
			const delta1 = choices1[0].delta as Record<string, unknown>;
			expect(delta0).toEqual({ reasoning: "Thought 1" });
			expect(delta1).toEqual({ reasoning: "Thought 2" });
		});
	});

	describe("reasoning chunks", () => {
		it("should transform reasoning chunk with reasoning field", async () => {
			const reasoningData: ReasoningData = { reasoning: "I need to analyze this" };
			const inputChunks: StreamChunk[] = [{ type: "reasoning", data: reasoningData }];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(2); // 1 reasoning chunk + 1 final chunk
			const chunk = parseChunk(outputs[0]);
			const choices = chunk.choices as Array<Record<string, unknown>>;
			const delta = choices[0].delta as Record<string, unknown>;
			expect(delta).toEqual({ reasoning: "I need to analyze this" });
		});

		it("should handle reasoning with toolCode", async () => {
			const reasoningData: ReasoningData = { reasoning: "Analyzing", toolCode: "some code" };
			const inputChunks: StreamChunk[] = [{ type: "reasoning", data: reasoningData }];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(2); // 1 reasoning chunk + 1 final chunk
			const chunk = parseChunk(outputs[0]);
			const choices = chunk.choices as Array<Record<string, unknown>>;
			const delta = choices[0].delta as Record<string, unknown>;
			expect(delta).toEqual({ reasoning: "Analyzing" });
		});
	});

	describe("tool_code chunks", () => {
		it("should transform tool_code chunk with tool_calls", async () => {
			const toolData: GeminiFunctionCall = { name: "get_weather", args: { location: "NYC" } };
			const inputChunks: StreamChunk[] = [{ type: "tool_code", data: toolData }];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(2); // 1 tool_code chunk + 1 final chunk
			const chunk = parseChunk(outputs[0]);
			const choices = chunk.choices as Array<Record<string, unknown>>;
			const delta = choices[0].delta as Record<string, unknown>;
			expect(delta.role).toBe("assistant");
			expect(delta.content).toBeNull();
			const toolCalls = delta.tool_calls as Array<Record<string, unknown>>;
			expect(toolCalls).toHaveLength(1);
			expect(toolCalls[0].index).toBe(0);
			expect(typeof toolCalls[0].id).toBe("string");
			expect((toolCalls[0].id as string)).toMatch(/^call_/);
			expect(toolCalls[0].type).toBe("function");
			const fn = toolCalls[0].function as Record<string, unknown>;
			expect(fn.name).toBe("get_weather");
			expect(fn.arguments).toBe('{"location":"NYC"}');
		});

		it("should set role to assistant on first tool_code chunk", async () => {
			const toolData: GeminiFunctionCall = { name: "search", args: { query: "test" } };
			const inputChunks: StreamChunk[] = [
				{ type: "text", data: "Before" },
				{ type: "tool_code", data: toolData }
			];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(3); // 1 text + 1 tool_code + 1 final chunk
			const chunk0 = parseChunk(outputs[0]);
			const chunk1 = parseChunk(outputs[1]);
			const choices0 = chunk0.choices as Array<Record<string, unknown>>;
			const choices1 = chunk1.choices as Array<Record<string, unknown>>;
			const delta0 = choices0[0].delta as Record<string, unknown>;
			const delta1 = choices1[0].delta as Record<string, unknown>;
			expect(delta0.role).toBe("assistant");
			// Second chunk (tool_code) doesn't have role since firstChunk was already set by text chunk
			// content is also not set (undefined) since it's a tool_code chunk
		});
	});

	describe("native_tool chunks", () => {
		it("should transform native_tool chunk with native_tool_calls", async () => {
			const nativeToolResponse: NativeToolResponse = { type: "search", data: { queries: ["test"] } };
			const inputChunks: StreamChunk[] = [{ type: "native_tool", data: nativeToolResponse }];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(2); // 1 native_tool chunk + 1 final chunk
			const chunk = parseChunk(outputs[0]);
			const choices = chunk.choices as Array<Record<string, unknown>>;
			const delta = choices[0].delta as Record<string, unknown>;
			const nativeToolCalls = delta.native_tool_calls as Array<NativeToolResponse>;
			expect(nativeToolCalls).toHaveLength(1);
			expect(nativeToolCalls[0]).toEqual(nativeToolResponse);
		});

		it("should handle url_context native tool", async () => {
			const nativeToolResponse: NativeToolResponse = { type: "url_context", data: { url: "https://example.com" } };
			const inputChunks: StreamChunk[] = [{ type: "native_tool", data: nativeToolResponse }];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(2); // 1 native_tool chunk + 1 final chunk
			const chunk = parseChunk(outputs[0]);
			const choices = chunk.choices as Array<Record<string, unknown>>;
			const delta = choices[0].delta as Record<string, unknown>;
			const nativeToolCalls = delta.native_tool_calls as Array<NativeToolResponse>;
			expect(nativeToolCalls).toHaveLength(1);
			expect(nativeToolCalls[0]).toEqual(nativeToolResponse);
		});
	});

	describe("grounding_metadata chunks", () => {
		it("should transform grounding_metadata chunk with grounding field", async () => {
			const groundingData = { webSearchQueries: ["test"], groundingChunks: [] };
			const inputChunks: StreamChunk[] = [{ type: "grounding_metadata", data: groundingData } as unknown as StreamChunk];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(2); // 1 grounding_metadata chunk + 1 final chunk
			const chunk = parseChunk(outputs[0]);
			const choices = chunk.choices as Array<Record<string, unknown>>;
			const delta = choices[0].delta as Record<string, unknown>;
			expect(delta.grounding).toEqual(groundingData);
		});

		it("should not emit chunk for null grounding_metadata", async () => {
			const inputChunks: StreamChunk[] = [{ type: "grounding_metadata", data: null as unknown as string }];
			const { outputs } = await processChunksAsync(inputChunks);
			expect(outputs.length).toBe(1); // Only final chunk
		});
	});

	describe("usage chunks", () => {
		it("should not emit chunk for usage data but store it for final chunk", async () => {
			const usageData: UsageData = { inputTokens: 10, outputTokens: 20 };
			const inputChunks: StreamChunk[] = [
				{ type: "text", data: "Hello" },
				{ type: "usage", data: usageData }
			];
			const { outputs, finalOutput } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(2); // 1 text chunk + 1 final chunk
			const chunk = parseChunk(outputs[0]);
			expect(chunk.id).toMatch(/^chatcmpl-/);
			expect(chunk.object).toBe("chat.completion.chunk");
			expect(chunk.model).toBe(mockModel);
			const choices = chunk.choices as Array<Record<string, unknown>>;
			expect(choices[0]).toEqual({
				index: 0,
				delta: { role: "assistant", content: "Hello" },
				finish_reason: null,
				logprobs: null,
				matched_stop: null
			});
			expect(chunk.usage).toBeNull();

			// Check final chunk has usage
			expect(finalOutput).toContain('"usage"');
			expect(finalOutput).toContain('"prompt_tokens":10');
			expect(finalOutput).toContain('"completion_tokens":20');
			expect(finalOutput).toContain('"total_tokens":30');
		});

		it("should handle usage data at the end of stream", async () => {
			const usageData: UsageData = { inputTokens: 5, outputTokens: 15 };
			const inputChunks: StreamChunk[] = [
				{ type: "text", data: "Response" },
				{ type: "usage", data: usageData }
			];
			const { finalOutput } = await processChunksAsync(inputChunks);

			expect(finalOutput).toContain('"prompt_tokens":5');
			expect(finalOutput).toContain('"completion_tokens":15');
			expect(finalOutput).toContain('"total_tokens":20');
		});
	});

	describe("flush behavior", () => {
		it("should emit final chunk with finish_reason stop when no tool calls", async () => {
			const inputChunks: StreamChunk[] = [{ type: "text", data: "Hello" }];
			const { finalOutput } = await processChunksAsync(inputChunks);

			expect(finalOutput).toContain('"finish_reason":"stop"');
			expect(finalOutput).toContain('"delta":{}');
		});

		it("should emit final chunk with finish_reason tool_calls when tool was called", async () => {
			const toolData: GeminiFunctionCall = { name: "calculator", args: { expression: "2+2" } };
			const inputChunks: StreamChunk[] = [{ type: "tool_code", data: toolData }];
			const { finalOutput } = await processChunksAsync(inputChunks);

			expect(finalOutput).toContain('"finish_reason":"tool_calls"');
		});

		it("should emit [DONE] marker after final chunk", async () => {
			const inputChunks: StreamChunk[] = [{ type: "text", data: "Test" }];
			const { finalOutput } = await processChunksAsync(inputChunks);

			expect(finalOutput).toContain("data: [DONE]");
		});

		it("should include usage in final chunk when usage data was provided", async () => {
			const usageData: UsageData = { inputTokens: 100, outputTokens: 50 };
			const inputChunks: StreamChunk[] = [
				{ type: "text", data: "Response" },
				{ type: "usage", data: usageData }
			];
			const { finalOutput } = await processChunksAsync(inputChunks);

			expect(finalOutput).toContain('"prompt_tokens":100');
			expect(finalOutput).toContain('"completion_tokens":50');
			expect(finalOutput).toContain('"total_tokens":150');
		});
	});

	describe("stream metadata", () => {
		it("should generate consistent chat ID across all chunks", async () => {
			const inputChunks: StreamChunk[] = [
				{ type: "text", data: "First" },
				{ type: "text", data: "Second" }
			];
			const { outputs, finalOutput } = await processChunksAsync(inputChunks);

			const chunk0 = parseChunk(outputs[0]);
			const chunk1 = parseChunk(outputs[1]);
			// Extract ID from final output
			const finalMatch = finalOutput.match(/"id":"([^"]+)"/);
			const finalId = finalMatch ? finalMatch[1] : "";

			expect(chunk0.id).toBe(chunk1.id);
			expect(chunk0.id).toBe(finalId);
		});

		it("should generate consistent creation time across all chunks", async () => {
			const inputChunks: StreamChunk[] = [
				{ type: "text", data: "First" },
				{ type: "text", data: "Second" }
			];
			const { outputs } = await processChunksAsync(inputChunks);

			const chunk0 = parseChunk(outputs[0]);
			const chunk1 = parseChunk(outputs[1]);
			expect(chunk0.created).toBe(chunk1.created);
		});

		it("should use correct model name in all chunks", async () => {
			const customModel = "gemini-2.0-flash";
			const transformer = createOpenAIStreamTransformer(customModel);
			const writer = transformer.writable.getWriter();
			const reader = transformer.readable.getReader();

			const inputChunks: StreamChunk[] = [{ type: "text", data: "Test" }];

			const writePromise = (async () => {
				for (const chunk of inputChunks) {
					await writer.write(chunk);
				}
				await writer.close();
			})();

			const readPromise = (async () => {
				const { value } = await reader.read();
				if (value) {
					const text = decoder.decode(value);
					const chunk = parseChunk(text);
					expect(chunk.model).toBe(customModel);
				}
				// Read remaining chunks to completion
				while (true) {
					const { done } = await reader.read();
					if (done) break;
				}
			})();

			await Promise.all([writePromise, readPromise]);
		});
	});

	describe("mixed chunk types", () => {
		it("should handle mixed text and reasoning chunks", async () => {
			const inputChunks: StreamChunk[] = [
				{ type: "text", data: "Answer:" },
				{ type: "reasoning", data: { reasoning: "Thinking..." } },
				{ type: "text", data: "The result is 42" }
			];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(4); // 3 data chunks + 1 final chunk
			const chunk0 = parseChunk(outputs[0]);
			const chunk1 = parseChunk(outputs[1]);
			const chunk2 = parseChunk(outputs[2]);
			const choices0 = chunk0.choices as Array<Record<string, unknown>>;
			const choices1 = chunk1.choices as Array<Record<string, unknown>>;
			const choices2 = chunk2.choices as Array<Record<string, unknown>>;
			const delta0 = choices0[0].delta as Record<string, unknown>;
			const delta1 = choices1[0].delta as Record<string, unknown>;
			const delta2 = choices2[0].delta as Record<string, unknown>;
			expect(delta0).toEqual({ role: "assistant", content: "Answer:" });
			expect(delta1).toEqual({ reasoning: "Thinking..." });
			expect(delta2).toEqual({ content: "The result is 42" });
		});

		it("should handle text, native_tool, and grounding_metadata", async () => {
			const nativeToolResponse: NativeToolResponse = { type: "search", data: { query: "weather" } };
			const groundingData = { sources: ["source1"] };
			const inputChunks: StreamChunk[] = [
				{ type: "text", data: "Let me search" },
				{ type: "native_tool", data: nativeToolResponse },
				{ type: "grounding_metadata", data: groundingData } as unknown as StreamChunk
			];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(4); // 3 data chunks + 1 final chunk
			const chunk0 = parseChunk(outputs[0]);
			const chunk1 = parseChunk(outputs[1]);
			const chunk2 = parseChunk(outputs[2]);
			const choices0 = chunk0.choices as Array<Record<string, unknown>>;
			const choices1 = chunk1.choices as Array<Record<string, unknown>>;
			const choices2 = chunk2.choices as Array<Record<string, unknown>>;
			const delta0 = choices0[0].delta as Record<string, unknown>;
			const delta1 = choices1[0].delta as Record<string, unknown>;
			const delta2 = choices2[0].delta as Record<string, unknown>;
			expect(delta0.content).toBe("Let me search");
			expect(delta1.native_tool_calls).toEqual([nativeToolResponse]);
			expect(delta2.grounding).toEqual(groundingData);
		});
	});

	describe("edge cases", () => {
		it("should handle empty stream", async () => {
			const inputChunks: StreamChunk[] = [];
			const { outputs, finalOutput } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(1); // Only final chunk
			// Should still emit final chunk and [DONE]
			expect(finalOutput).toContain("data: [DONE]");
		});

		it("should handle only usage chunk", async () => {
			const usageData: UsageData = { inputTokens: 10, outputTokens: 5 };
			const inputChunks: StreamChunk[] = [{ type: "usage", data: usageData }];
			const { outputs, finalOutput } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(1); // Only final chunk
			expect(finalOutput).toContain('"prompt_tokens":10');
			expect(finalOutput).toContain('"completion_tokens":5');
			expect(finalOutput).toContain('"total_tokens":15');
		});

		it("should handle special characters in text", async () => {
			const inputChunks: StreamChunk[] = [{ type: "text", data: "Hello 世界 🌍\n\t" }];
			const { outputs } = await processChunksAsync(inputChunks);

			expect(outputs.length).toBe(2); // 1 text chunk + 1 final chunk
			const chunk = parseChunk(outputs[0]);
			const choices = chunk.choices as Array<Record<string, unknown>>;
			const delta = choices[0].delta as Record<string, unknown>;
			expect(delta.content).toBe("Hello 世界 🌍\n\t");
		});

		it("should handle large numbers in usage data", async () => {
			const usageData: UsageData = { inputTokens: 1000000, outputTokens: 500000 };
			const inputChunks: StreamChunk[] = [
				{ type: "text", data: "Test" },
				{ type: "usage", data: usageData }
			];
			const { finalOutput } = await processChunksAsync(inputChunks);

			expect(finalOutput).toContain('"prompt_tokens":1000000');
			expect(finalOutput).toContain('"completion_tokens":500000');
			expect(finalOutput).toContain('"total_tokens":1500000');
		});
	});
});
