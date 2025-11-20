import { NativeToolResponse } from "./types/native-tools";

// --- Safety Threshold Types ---
export type SafetyThreshold =
	| "BLOCK_NONE"
	| "BLOCK_FEW"
	| "BLOCK_SOME"
	| "BLOCK_ONLY_HIGH"
	| "HARM_BLOCK_THRESHOLD_UNSPECIFIED";

// --- Environment Variable Typings ---
export interface Env {
	GCP_SERVICE_ACCOUNT: string; // Now contains OAuth2 credentials JSON
	GEMINI_PROJECT_ID?: string;
	GEMINI_CLI_KV: KVNamespace; // Cloudflare KV for token caching
	GEMINI_PROJECT_MAP?: string;// Multiple auth profile
	OPENAI_API_KEY?: string; // Optional API key for authentication
	ENABLE_FAKE_THINKING?: string; // Optional flag to enable fake thinking output (set to "true" to enable)
	ENABLE_REAL_THINKING?: string; // Optional flag to enable real Gemini thinking output (set to "true" to enable)
	STREAM_THINKING_AS_CONTENT?: string; // Optional flag to stream thinking as content with <thinking> tags (set to "true" to enable)
	ENABLE_AUTO_MODEL_SWITCHING?: string; // Optional flag to enable automatic fallback from pro to flash on 429 errors (set to "true" to enable)
	GEMINI_MODERATION_HARASSMENT_THRESHOLD?: SafetyThreshold;
	GEMINI_MODERATION_HATE_SPEECH_THRESHOLD?: SafetyThreshold;
	GEMINI_MODERATION_SEXUALLY_EXPLICIT_THRESHOLD?: SafetyThreshold;
	GEMINI_MODERATION_DANGEROUS_CONTENT_THRESHOLD?: SafetyThreshold;

	// Native Tools Configuration
	ENABLE_GEMINI_NATIVE_TOOLS?: string; // Enable native Gemini tools (default: false)
	ENABLE_GOOGLE_SEARCH?: string; // Enable Google Search tool (default: false)
	ENABLE_URL_CONTEXT?: string; // Enable URL Context tool (default: false)
	GEMINI_TOOLS_PRIORITY?: string; // Tool priority strategy (native_first, custom_first, user_choice)
	DEFAULT_TO_NATIVE_TOOLS?: string; // Default behavior when no custom tools provided (default: true)
	ALLOW_REQUEST_TOOL_CONTROL?: string; // Allow request-level tool control (default: true)

	// Citations and Grounding Configuration
	ENABLE_INLINE_CITATIONS?: string; // Enable inline citations in responses (default: false)
	INCLUDE_GROUNDING_METADATA?: string; // Include grounding metadata in responses (default: true)
	INCLUDE_SEARCH_ENTRY_POINT?: string; // Include search entry point HTML (default: false)
}

// --- OAuth2 Credentials Interface ---
export interface OAuth2Credentials {
	access_token: string;
	refresh_token: string;
	scope: string;
	token_type: string;
	id_token: string;
	expiry_date: number;
}

// --- Model Information Interface ---
export interface ModelInfo {
	maxTokens: number;
	contextWindow: number;
	supportsImages: boolean;
	supportsPromptCache: boolean;
	inputPrice: number;
	outputPrice: number;
	description: string;
	thinking: boolean; // Indicates if the model supports thinking
}

// --- Chat Completion Request Interface ---
export type EffortLevel = "none" | "low" | "medium" | "high";

export interface Tool {
	type: "function";
	function: {
		name: string;
		description?: string;
		parameters?: Record<string, unknown>;
	};
}

export type ToolChoice = "none" | "auto" | { type: "function"; function: { name: string } };

export interface ChatCompletionRequest {
	model: string;
	messages: ChatMessage[];
	stream?: boolean;
	thinking_budget?: number; // Optional thinking token budget
	reasoning_effort?: EffortLevel; // Optional effort level for thinking
	tools?: Tool[];
	tool_choice?: ToolChoice;
	// Support for common custom parameter locations
	extra_body?: {
		reasoning_effort?: EffortLevel;
		enable_search?: boolean;
		enable_url_context?: boolean;
		enable_native_tools?: boolean;
		native_tools_priority?: "native" | "custom" | "mixed";
	};
	model_params?: {
		reasoning_effort?: EffortLevel;
		enable_search?: boolean;
		enable_url_context?: boolean;
		enable_native_tools?: boolean;
		native_tools_priority?: "native" | "custom" | "mixed";
	};
	// Newly added OpenAI parameters
	max_tokens?: number;
	temperature?: number;
	top_p?: number;
	stop?: string | string[];
	presence_penalty?: number;
	frequency_penalty?: number;
	seed?: number;
	response_format?: {
		type: "text" | "json_object";
	};
	// Native Tools flags
	enable_search?: boolean;
	enable_url_context?: boolean;
	enable_native_tools?: boolean;
	native_tools_priority?: "native" | "custom" | "mixed";
}

export interface ToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface ChatMessage {
	role: string;
	content: string | MessageContent[];
	tool_calls?: ToolCall[];
	tool_call_id?: string;
}

export interface MessageContent {
	type: "text" | "image_url";
	text?: string;
	image_url?: {
		url: string;
		detail?: "low" | "high" | "auto";
	};
}

// --- Chat Completion Response Interfaces ---
export interface ChatCompletionResponse {
	id: string;
	object: "chat.completion";
	created: number;
	model: string;
	choices: ChatCompletionChoice[];
	usage?: ChatCompletionUsage;
}

export interface ChatCompletionChoice {
	index: number;
	message: ChatCompletionMessage;
	finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

export interface ChatCompletionMessage {
	role: "assistant";
	content: string | null;
	tool_calls?: ToolCall[];
}

export interface ChatCompletionUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

// --- Gemini Specific Types ---
export interface GeminiFunctionCall {
	name: string;
	args: object;
}

// --- Usage and Reasoning Data Types ---
export interface UsageData {
	inputTokens: number;
	outputTokens: number;
}

export interface ReasoningData {
	reasoning: string;
	toolCode?: string;
}

// --- Stream Chunk Types ---
export interface StreamChunk {
	type:
		| "text"
		| "usage"
		| "reasoning"
		| "thinking_content"
		| "real_thinking"
		| "tool_code"
		| "native_tool"
		| "grounding_metadata";
	data: string | UsageData | ReasoningData | GeminiFunctionCall | NativeToolResponse;
}
