// Native Tools Type Definitions for Gemini API Integration

import { Tool } from "../types";

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

// Code Execution Types
export interface GeminiExecutableCode {
	language: "PYTHON";
	code: string;
}

export interface GeminiCodeExecutionResult {
	outcome: "OUTCOME_OK" | "OUTCOME_FAILED" | "OUTCOME_DEADLINE_EXCEEDED";
	output: string;
}

// URL Context Types
export interface GeminiUrlContextMetadata {
	url_metadata: Array<{
		retrieved_url: string;
		url_retrieval_status: string;
	}>;
}

// Legacy Google Search Retrieval (Gemini 1.5)
export interface GoogleSearchRetrievalConfig {
	dynamic_retrieval_config: {
		mode: "MODE_DYNAMIC";
		dynamic_threshold: number;
	};
}

// Native Tools Configuration
export interface NativeTool {
	google_search?: object;
	google_search_retrieval?: GoogleSearchRetrievalConfig;
	code_execution?: object;
	url_context?: object;
}

export interface NativeToolsConfiguration {
	useNativeTools: boolean;
	useCustomTools: boolean;
	nativeTools: NativeTool[];
	customTools?: Tool[];
	priority: "native" | "custom";
	toolType: "code_execution_exclusive" | "search_and_url" | "custom_only";
}

export interface NativeToolsRequestParams {
	enableSearch?: boolean;
	enableCodeExecution?: boolean;
	enableUrlContext?: boolean;
	enableNativeTools?: boolean;
	nativeToolsPriority?: "native" | "custom" | "mixed";
}

export interface NativeToolsEnvSettings {
	enableNativeTools: boolean;
	enableGoogleSearch: boolean;
	enableCodeExecution: boolean;
	enableUrlContext: boolean;
	priority: "native_first" | "custom_first" | "user_choice" | "code_execution_priority";
	codeExecutionPriority: boolean;
	defaultToNativeTools: boolean;
	allowRequestControl: boolean;
	enableInlineCitations: boolean;
	includeGroundingMetadata: boolean;
	includeSearchEntryPoint: boolean;
	enableLegacyGoogleSearchRetrieval: boolean;
	googleSearchDynamicThreshold: number;
}

// Citation Processing Types
export interface CitationSource {
	id: number;
	title: string;
	uri: string;
}

export interface NativeToolResponse {
	type: "search" | "code_execution" | "code_execution_result" | "url_context";
	data: unknown;
	metadata?: unknown;
}
