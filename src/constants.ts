/**
 * Constants for the Gemini CLI OpenAI Worker
 */

// Static reasoning messages for thinking models
export const REASONING_MESSAGES = [
	'🔍 **Analyzing the request: "{requestPreview}"**\n\n',
	"🤔 Let me think about this step by step... ",
	"💭 I need to consider the context and provide a comprehensive response. ",
	"🎯 Based on my understanding, I should address the key points while being accurate and helpful. ",
	"✨ Let me formulate a clear and structured answer.\n\n"
];

// Default reasoning delay between chunks (in milliseconds)
export const REASONING_CHUNK_DELAY = 100;

// Default chunk size for streaming thinking content (in characters)
// This controls how many characters are sent per chunk when streaming thinking content
// Smaller values create smoother streaming but more network requests
export const THINKING_CONTENT_CHUNK_SIZE = 15;

// Thinking budget constants
export const DEFAULT_THINKING_BUDGET = -1; // -1 means dynamic allocation by Gemini (recommended)
export const DISABLED_THINKING_BUDGET = 0; // 0 disables thinking entirely

// Generation config defaults
export const DEFAULT_TEMPERATURE = 0.7;

// Auto model switching configuration
export const AUTO_SWITCH_MODEL_MAP = {
	"gemini-2.5-pro": "gemini-2.5-flash",
	"gemini-3-pro-preview": "gemini-3-flash-preview"
} as const;

// HTTP status codes for rate limiting
export const RATE_LIMIT_STATUS_CODES = [429, 503] as const;

// Reasoning effort mapping to thinking budgets
export const REASONING_EFFORT_BUDGETS = {
	none: 0,
	low: 1024,
	medium: {
		flash: 12288,
		default: 16384
	},
	high: {
		flash: 24576,
		default: 32768
	}
} as const;

// Gemini safety categories
export const GEMINI_SAFETY_CATEGORIES = {
	HARASSMENT: "HARM_CATEGORY_HARASSMENT",
	HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
	SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
	DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT"
} as const;

// Native tools defaults
export const NATIVE_TOOLS_DEFAULTS = {
	ENABLE_GEMINI_NATIVE_TOOLS: false,
	ENABLE_GOOGLE_SEARCH: false,
	ENABLE_URL_CONTEXT: false,
	GEMINI_TOOLS_PRIORITY: "native_first",
	DEFAULT_TO_NATIVE_TOOLS: true,
	ALLOW_REQUEST_TOOL_CONTROL: true,
	ENABLE_INLINE_CITATIONS: false,
	INCLUDE_GROUNDING_METADATA: true,
	INCLUDE_SEARCH_ENTRY_POINT: false
} as const;

export const MIME_TYPE_MAP: Record<string, string> = {
	mp3: "audio/mpeg",
	mp4: "audio/mp4",
	mpeg: "audio/mpeg",
	mpga: "audio/mpeg",
	m4a: "audio/mp4",
	wav: "audio/wav",
	webm: "audio/webm",
	ogg: "audio/ogg",
	oga: "audio/ogg",
	flac: "audio/flac",
	mov: "video/quicktime",
	mpg: "video/mpeg",
	avi: "video/x-msvideo",
	wmv: "video/x-ms-wmv",
	flv: "video/x-flv"
};
