// Native Tools Type Definitions for Gemini API Integration

// Tool interface (moved here to avoid circular dependency)
export interface Tool {
	type: "function";
	function: {
		name: string;
		description?: string;
		parameters?: Record<string, unknown>;
	};
}

// Google Search Grounding Types
export interface GroundingMetadata {
	webSearchQueries?: string[];
	searchEntryPoint?: {
		renderedContent: string;
	};
	groundingChunks: GroundingChunk[];
	groundingSupports: GroundingSupport[];
}

export interface GroundingChunk {
	web: {
		uri: string;
		title: string;
	};
}

export interface GroundingSupport {
	segment: {
		startIndex: number;
		endIndex: number;
		text: string;
	};
	groundingChunkIndices: number[];
}

// URL Context Types
export interface GeminiUrlContextMetadata {
	url_metadata: Array<{
		retrieved_url: string;
		url_retrieval_status: string;
	}>;
}

// Native Tools Configuration
export interface NativeTool {
	google_search?: object;
	url_context?: object;
}

export interface NativeToolsConfiguration {
	useNativeTools: boolean;
	useCustomTools: boolean;
	nativeTools: NativeTool[];
	customTools?: Tool[];
	priority: "native" | "custom";
	toolType: "search_and_url" | "custom_only";
}

export interface NativeToolsRequestParams {
	enableSearch?: boolean;
	enableUrlContext?: boolean;
	enableNativeTools?: boolean;
	nativeToolsPriority?: "native" | "custom" | "mixed";
}

export interface NativeToolsEnvSettings {
	enableNativeTools: boolean;
	enableGoogleSearch: boolean;
	enableUrlContext: boolean;
	priority: "native_first" | "custom_first" | "user_choice";
	defaultToNativeTools: boolean;
	allowRequestControl: boolean;
	enableInlineCitations: boolean;
	includeGroundingMetadata: boolean;
	includeSearchEntryPoint: boolean;
}

// Citation Processing Types
export interface CitationSource {
	id: number;
	title: string;
	uri: string;
}

export interface NativeToolResponse {
	type: "search" | "url_context";
	data: unknown;
	metadata?: unknown;
}
