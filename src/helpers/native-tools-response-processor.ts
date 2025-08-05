import {
	GeminiCodeExecutionResult,
	GeminiExecutableCode,
	GeminiUrlContextMetadata,
	GroundingMetadata,
	NativeToolResponse
} from "../types/native-tools";
import { GeminiPart } from "../gemini-client";

/**
 * Processes response parts from the Gemini API that are related to native tools.
 * This includes code execution, grounding metadata, and URL context.
 */
export class NativeToolsResponseProcessor {
	/**
	 * Processes a single part from the Gemini API response and returns a
	 * structured native tool response if the part is a native tool output.
	 */
	public processNativeToolResponse(part: GeminiPart): NativeToolResponse | null {
		// Handle executable code from the model
		if (part.executable_code) {
			return {
				type: "code_execution",
				data: {
					language: part.executable_code.language,
					code: part.executable_code.code
				} as GeminiExecutableCode
			};
		}

		// Handle the result of code execution
		if (part.code_execution_result) {
			return {
				type: "code_execution_result",
				data: {
					outcome: part.code_execution_result.outcome,
					output: part.code_execution_result.output
				} as GeminiCodeExecutionResult
			};
		}

		// Handle URL context metadata
		if (part.url_context_metadata) {
			return {
				type: "url_context",
				data: part.url_context_metadata as GeminiUrlContextMetadata
			};
		}

		return null;
	}

	/**
	 * Processes grounding metadata from the Gemini API response.
	 */
	public processGroundingMetadata(metadata: GroundingMetadata): NativeToolResponse {
		return {
			type: "search",
			data: metadata.groundingChunks || [],
			metadata: metadata
		};
	}
}
