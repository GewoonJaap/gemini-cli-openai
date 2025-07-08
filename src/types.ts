// --- Environment Variable Typings ---
export interface Env {
	GCP_SERVICE_ACCOUNT: string; // Now contains OAuth2 credentials JSON
	GEMINI_PROJECT_ID?: string;
	GEMINI_CLI_KV: KVNamespace; // Cloudflare KV for token caching
	OPENAI_API_KEY?: string; // Optional API key for authentication
	ENABLE_FAKE_THINKING?: string; // Optional flag to enable fake thinking output (set to "true" to enable)
	ENABLE_REAL_THINKING?: string; // Optional flag to enable real Gemini thinking output (set to "true" to enable)
	STREAM_THINKING_AS_CONTENT?: string; // Optional flag to stream thinking as content with <thinking> tags (set to "true" to enable)
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
export interface ChatCompletionRequest {
	model: string;
	messages: ChatMessage[];
	stream?: boolean;
	thinking_budget?: number; // Optional thinking token budget
}

export interface ChatMessage {
	role: string;
	content: string | MessageContent[];
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
	finish_reason: "stop" | "length" | "function_call" | "content_filter" | null;
}

export interface ChatCompletionMessage {
	role: "assistant";
	content: string;
}

export interface ChatCompletionUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

// --- Usage and Reasoning Data Types ---
export interface UsageData {
	inputTokens: number;
	outputTokens: number;
}

export interface ReasoningData {
	reasoning: string;
}

// --- Stream Chunk Types ---
export interface StreamChunk {
	type: "text" | "usage" | "reasoning" | "thinking_content" | "real_thinking";
	data: string | UsageData | ReasoningData;
}
