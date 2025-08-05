import { GeminiUrlContextMetadata, GroundingMetadata, NativeToolResponse } from "../types/native-tools";
import { GeminiPart } from "../gemini-client";

/**
 * Processes response parts from the Gemini API that are related to native tools.
 * This includes grounding metadata, and URL context.
 */
export class NativeToolsResponseProcessor {
	/**
	 * Processes a single part from the Gemini API response and returns a
	 * structured native tool response if the part is a native tool output.
	 */
	public processNativeToolResponse(part: GeminiPart): NativeToolResponse | null {
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
