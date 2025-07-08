import { StreamChunk, ReasoningData } from "./types";
import { OPENAI_CHAT_COMPLETION_OBJECT } from "./config";

// OpenAI API interfaces
interface OpenAIChoice {
	index: number;
	delta: OpenAIDelta;
	finish_reason: string | null;
	logprobs?: null;
	matched_stop?: null;
}

interface OpenAIDelta {
	role?: string;
	content?: string;
	reasoning?: string;
	reasoning_content?: string | null;
	tool_calls?: null;
}

interface OpenAIChunk {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: OpenAIChoice[];
	usage?: null;
}

interface OpenAIFinalChoice {
	index: number;
	delta: Record<string, never>;
	finish_reason: string;
}

interface OpenAIFinalChunk {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: OpenAIFinalChoice[];
}

// Type guard functions
function isReasoningData(data: unknown): data is ReasoningData {
	return typeof data === "object" && data !== null && "reasoning" in data;
}

/**
 * Creates a TransformStream to convert Gemini's output chunks
 * into OpenAI-compatible server-sent events.
 */
export function createOpenAIStreamTransformer(model: string): TransformStream<StreamChunk, Uint8Array> {
	const chatID = `chatcmpl-${crypto.randomUUID()}`;
	const creationTime = Math.floor(Date.now() / 1000);
	const encoder = new TextEncoder();
	let firstChunk = true;

	return new TransformStream({
		transform(chunk, controller) {
			if (chunk.type === "text" && chunk.data && typeof chunk.data === "string") {
				const delta: OpenAIDelta = {
					content: chunk.data,
					reasoning_content: null,
					tool_calls: null
				};
				if (firstChunk) {
					delta.role = "assistant";
					firstChunk = false;
				}

				const openAIChunk: OpenAIChunk = {
					id: chatID,
					object: OPENAI_CHAT_COMPLETION_OBJECT,
					created: creationTime,
					model: model,
					choices: [
						{
							index: 0,
							delta: delta,
							finish_reason: null,
							logprobs: null,
							matched_stop: null
						}
					],
					usage: null
				};
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
			} else if (chunk.type === "thinking_content" && chunk.data && typeof chunk.data === "string") {
				// Handle thinking content streamed as regular content (DeepSeek R1 style)
				const delta: OpenAIDelta = {
					content: chunk.data,
					reasoning_content: null,
					tool_calls: null
				};
				if (firstChunk) {
					delta.role = "assistant";
					firstChunk = false;
				}

				const openAIChunk: OpenAIChunk = {
					id: chatID,
					object: OPENAI_CHAT_COMPLETION_OBJECT,
					created: creationTime,
					model: model,
					choices: [
						{
							index: 0,
							delta: delta,
							finish_reason: null,
							logprobs: null,
							matched_stop: null
						}
					],
					usage: null
				};
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
			} else if (chunk.type === "reasoning" && isReasoningData(chunk.data)) {
				// Handle thinking/reasoning chunks (original format)
				const delta: OpenAIDelta = {
					reasoning: chunk.data.reasoning,
					reasoning_content: null,
					tool_calls: null
				};

				const openAIChunk: OpenAIChunk = {
					id: chatID,
					object: OPENAI_CHAT_COMPLETION_OBJECT,
					created: creationTime,
					model: model,
					choices: [
						{
							index: 0,
							delta: delta,
							finish_reason: null,
							logprobs: null,
							matched_stop: null
						}
					],
					usage: null
				};
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
			}
			// Note: Usage chunks are intentionally not forwarded in streaming responses
			// as OpenAI's streaming format doesn't include usage data in individual chunks.
			// Usage information is available in non-streaming responses via the usage field.
			// Future enhancement: Could be added to the final chunk if needed for compatibility.
		},
		flush(controller) {
			// Send the final chunk with the finish reason.
			const finalChunk: OpenAIFinalChunk = {
				id: chatID,
				object: OPENAI_CHAT_COMPLETION_OBJECT,
				created: creationTime,
				model: model,
				choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
			};
			controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
		}
	});
}
