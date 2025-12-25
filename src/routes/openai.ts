import { Hono } from "hono";
import { Env, ChatCompletionRequest, ChatCompletionResponse, ChatMessage, ModelInfo, MessageContent } from "../types";
import { DEFAULT_MODEL, getAllModelIds } from "../models";
import { OPENAI_MODEL_OWNER } from "../config";
import { DEFAULT_THINKING_BUDGET, MIME_TYPE_MAP } from "../constants";
import { AuthManager } from "../auth";
import { GeminiApiClient } from "../gemini-client";
import { createOpenAIStreamTransformer } from "../stream-transformer";
import { isMediaTypeSupported, validateContent, validateModel } from "../utils/validation";
import { Buffer } from "node:buffer";

/**
 * OpenAI-compatible API routes for models and chat completions.
 */
export const OpenAIRoute = new Hono<{ Bindings: Env }>();

// List available models
OpenAIRoute.get("/models", async (c) => {
	const modelData = getAllModelIds().map((modelId) => ({
		id: modelId,
		object: "model",
		created: Math.floor(Date.now() / 1000),
		owned_by: OPENAI_MODEL_OWNER
	}));

	return c.json({
		object: "list",
		data: modelData
	});
});

// Chat completions endpoint
OpenAIRoute.post("/chat/completions", async (c) => {
	try {
		console.log("Chat completions request received");
		const body = await c.req.json<ChatCompletionRequest>();
		const model = body.model || DEFAULT_MODEL;
		const messages = body.messages || [];
		// OpenAI API compatibility: stream defaults to true unless explicitly set to false
		const stream = body.stream !== false;

		// Check environment settings for real thinking
		const isRealThinkingEnabled = c.env.ENABLE_REAL_THINKING === "true";
		let includeReasoning = isRealThinkingEnabled; // Automatically enable reasoning when real thinking is enabled
		let thinkingBudget = body.thinking_budget ?? DEFAULT_THINKING_BUDGET; // Default to dynamic allocation

		// Newly added parameters
		const generationOptions = {
			max_tokens: body.max_tokens,
			temperature: body.temperature,
			top_p: body.top_p,
			stop: body.stop,
			presence_penalty: body.presence_penalty,
			frequency_penalty: body.frequency_penalty,
			seed: body.seed,
			response_format: body.response_format
		};

		// Handle effort level mapping to thinking_budget (check multiple locations for client compatibility)
		const reasoning_effort =
			body.reasoning_effort || body.extra_body?.reasoning_effort || body.model_params?.reasoning_effort;
		if (reasoning_effort) {
			includeReasoning = true; // Effort implies reasoning
			const isFlashModel = model.includes("flash");
			switch (reasoning_effort) {
				case "low":
					thinkingBudget = 1024;
					break;
				case "medium":
					thinkingBudget = isFlashModel ? 12288 : 16384;
					break;
				case "high":
					thinkingBudget = isFlashModel ? 24576 : 32768;
					break;
				case "none":
					thinkingBudget = 0;
					includeReasoning = false;
					break;
			}
		}

		const tools = body.tools;
		const tool_choice = body.tool_choice;

		console.log("Request body parsed:", {
			model,
			messageCount: messages.length,
			stream,
			includeReasoning,
			thinkingBudget,
			tools,
			tool_choice
		});

		if (!messages.length) {
			return c.json({ error: "messages is a required field" }, 400);
		}

		// Validate model
		const modelValidation = validateModel(model);
		if (!modelValidation.isValid) {
			return c.json({ error: modelValidation.error }, 400);
		}

		// Unified media validation
		const mediaChecks: {
			type: string;
			supportKey: keyof ModelInfo;
			name: string;
		}[] = [
			{ type: "image_url", supportKey: "supportsImages", name: "image inputs" },
			{ type: "input_audio", supportKey: "supportsAudios", name: "audio inputs" },
			{ type: "input_video", supportKey: "supportsVideos", name: "video inputs" },
			{ type: "input_pdf", supportKey: "supportsPdfs", name: "PDF inputs" }
		];

		for (const { type, supportKey, name } of mediaChecks) {
			const messagesWithMedia = messages.filter(
				(msg) => Array.isArray(msg.content) && msg.content.some((content) => content.type === type)
			);

			if (messagesWithMedia.length > 0) {
				if (!isMediaTypeSupported(model, supportKey)) {
					return c.json(
						{
							error: `Model '${model}' does not support ${name}. Please use a model that supports this feature.`
						},
						400
					);
				}

				for (const msg of messagesWithMedia) {
					for (const content of msg.content as MessageContent[]) {
						if (content.type === type) {
							const { isValid, error } = validateContent(type, content);
							if (!isValid) {
								return c.json({ error }, 400);
							}
						}
					}
				}
			}
		}

		// Extract system prompt and user/assistant messages
		let systemPrompt = "";
		const otherMessages = messages.filter((msg) => {
			if (msg.role === "system") {
				// Handle system messages with both string and array content
				if (typeof msg.content === "string") {
					systemPrompt = msg.content;
				} else if (Array.isArray(msg.content)) {
					// For system messages, only extract text content
					const textContent = msg.content
						.filter((part) => part.type === "text")
						.map((part) => part.text || "")
						.join(" ");
					systemPrompt = textContent;
				}
				return false;
			}
			return true;
		});

		// Initialize services
		const authManager = new AuthManager(c.env);
		const geminiClient = new GeminiApiClient(c.env, authManager);

		// Test authentication first
		try {
			await authManager.initializeAuth();
			console.log("Authentication successful");
		} catch (authError: unknown) {
			const errorMessage = authError instanceof Error ? authError.message : String(authError);
			console.error("Authentication failed:", errorMessage);
			return c.json({ error: "Authentication failed: " + errorMessage }, 401);
		}

		if (stream) {
			// Streaming response
			const { readable, writable } = new TransformStream();
			const writer = writable.getWriter();
			const openAITransformer = createOpenAIStreamTransformer(model);
			const openAIStream = readable.pipeThrough(openAITransformer);

			// Asynchronously pipe data from Gemini to transformer
			(async () => {
				try {
					console.log("Starting stream generation");
					const geminiStream = geminiClient.streamContent(model, systemPrompt, otherMessages, {
						includeReasoning,
						thinkingBudget,
						tools,
						tool_choice,
						...generationOptions
					});

					for await (const chunk of geminiStream) {
						await writer.write(chunk);
					}
					console.log("Stream completed successfully");
					await writer.close();
				} catch (streamError: unknown) {
					const errorMessage = streamError instanceof Error ? streamError.message : String(streamError);
					console.error("Stream error:", errorMessage);
					// Try to write an error chunk before closing
					await writer.write({
						type: "text",
						data: `Error: ${errorMessage}`
					});
					await writer.close();
				}
			})();

			// Return streaming response
			console.log("Returning streaming response");
			return new Response(openAIStream, {
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type, Authorization"
				}
			});
		} else {
			// Non-streaming response
			try {
				console.log("Starting non-streaming completion");
				const completion = await geminiClient.getCompletion(model, systemPrompt, otherMessages, {
					includeReasoning,
					thinkingBudget,
					tools,
					tool_choice,
					...generationOptions
				});

				const response: ChatCompletionResponse = {
					id: `chatcmpl-${crypto.randomUUID()}`,
					object: "chat.completion",
					created: Math.floor(Date.now() / 1000),
					model: model,
					choices: [
						{
							index: 0,
							message: {
								role: "assistant",
								content: completion.content,
								tool_calls: completion.tool_calls
							},
							finish_reason: completion.tool_calls && completion.tool_calls.length > 0 ? "tool_calls" : "stop"
						}
					]
				};

				// Add usage information if available
				if (completion.usage) {
					response.usage = {
						prompt_tokens: completion.usage.inputTokens,
						completion_tokens: completion.usage.outputTokens,
						total_tokens: completion.usage.inputTokens + completion.usage.outputTokens
					};
				}

				console.log("Non-streaming completion successful");
				return c.json(response);
			} catch (completionError: unknown) {
				const errorMessage = completionError instanceof Error ? completionError.message : String(completionError);
				console.error("Completion error:", errorMessage);
				return c.json({ error: errorMessage }, 500);
			}
		}
	} catch (e: unknown) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		console.error("Top-level error:", e);
		return c.json({ error: errorMessage }, 500);
	}
});

// Audio transcriptions endpoint
OpenAIRoute.post("/audio/transcriptions", async (c) => {
	try {
		console.log("Audio transcription request received");
		const body = await c.req.parseBody();
		const file = body["file"];
		const model = (body["model"] as string) || DEFAULT_MODEL;
		const prompt = (body["prompt"] as string) || "Transcribe this audio in detail.";

		if (!file || !(file instanceof File)) {
			return c.json({ error: "File is required" }, 400);
		}

		// Validate model
		const modelValidation = validateModel(model);
		if (!modelValidation.isValid) {
			return c.json({ error: modelValidation.error }, 400);
		}

		let mimeType = file.type;

		// Fallback for application/octet-stream
		if (mimeType === "application/octet-stream" && file.name) {
			const ext = file.name.split(".").pop()?.toLowerCase();
			if (ext && MIME_TYPE_MAP[ext]) {
				mimeType = MIME_TYPE_MAP[ext];
				console.log(`Detected MIME type from extension .${ext}: ${mimeType}`);
			}
		}

		// Check for video or audio support based on MIME type
		const isVideo = mimeType.startsWith("video/");
		// gemini can generate transcriptions of videos too
		const isAudio = mimeType.startsWith("audio/");

		if (isVideo) {
			if (!isMediaTypeSupported(model, "supportsVideos")) {
				return c.json(
					{
						error: `Model '${model}' does not support video inputs.`
					},
					400
				);
			}
		} else if (isAudio) {
			if (!isMediaTypeSupported(model, "supportsAudios")) {
				return c.json(
					{
						error: `Model '${model}' does not support audio inputs.`
					},
					400
				);
			}
		} else {
			return c.json(
				{
					error: `Unsupported media type: ${mimeType}. Only audio and video files are supported.`
				},
				400
			);
		}

		// Convert File to base64
		const arrayBuffer = await file.arrayBuffer();
		console.log(`Processing audio file: size=${arrayBuffer.byteLength} bytes, type=${file.type}`);

		let base64Audio: string;
		try {
			base64Audio = Buffer.from(arrayBuffer).toString("base64");
		} catch (e: unknown) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			console.error("Base64 conversion failed:", errorMessage);
			throw new Error(`Failed to process audio file: ${errorMessage}`);
		}

		// Construct message
		const messages: ChatMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: prompt
					},
					{
						type: "input_audio",
						input_audio: {
							data: base64Audio,
							format: mimeType
						}
					}
				]
			}
		];

		// Initialize client
		const authManager = new AuthManager(c.env);
		const geminiClient = new GeminiApiClient(c.env, authManager);

		// Get completion
		const completion = await geminiClient.getCompletion(model, "", messages);

		return c.json({ text: completion.content });
	} catch (e: unknown) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		console.error("Transcription error:", errorMessage);
		return c.json({ error: errorMessage }, 500);
	}
});
