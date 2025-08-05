import { Env } from "../types";
import { GroundingMetadata, CitationSource } from "../types/native-tools";

/**
 * Processes grounding metadata to add inline citations to text responses.
 * Implements the citation logic as described in the Gemini API documentation.
 */
export class CitationsProcessor {
	private enableInlineCitations: boolean;

	constructor(env: Env) {
		this.enableInlineCitations = env.ENABLE_INLINE_CITATIONS === "true";
	}

	/**
	 * Finds a "safe" insertion point for a citation to avoid breaking words or URLs.
	 * It searches for the nearest whitespace or punctuation after the given index.
	 */
	private findSafeInsertionPoint(text: string, index: number): number {
		// If the index is at the end of the text, it's always safe
		if (index >= text.length) {
			return text.length;
		}

		// Check if the character at the index is already a safe break
		const charAtIndex = text.charAt(index);
		if (/\s|[.,!?;:]/.test(charAtIndex)) {
			return index;
		}

		// Search forward for a safe break
		for (let i = index; i < text.length; i++) {
			const char = text.charAt(i);
			if (/\s|[.,!?;:]/.test(char)) {
				return i;
			}
		}

		// If no safe break found, return the original index (fallback)
		return index;
	}

	public processChunk(textChunk: string, metadata?: GroundingMetadata): string {
		if (!this.enableInlineCitations) {
			return textChunk;
		}

		let citedTextChunk = textChunk; // This will be the textChunk with citations applied
		let offset = 0; // Tracks the cumulative length added by inserted citations within the current textChunk

		if (metadata && metadata.groundingSupports && metadata.groundingChunks) {
			const sortedSupports = [...metadata.groundingSupports].sort(
				(a, b) => (a.segment?.startIndex ?? 0) - (b.segment?.startIndex ?? 0)
			);

			for (const support of sortedSupports) {
				const originalStartIndex = support.segment?.startIndex;
				const originalEndIndex = support.segment?.endIndex;

				// Only process citations that fall within the current textChunk
				if (
					originalStartIndex === undefined ||
					originalEndIndex === undefined ||
					!support.groundingChunkIndices?.length ||
					originalStartIndex < 0 || // Ensure startIndex is not negative
					originalEndIndex > textChunk.length // Ensure endIndex is within the current textChunk
				) {
					continue;
				}

				const citationLinks = support.groundingChunkIndices
					.map((i) => {
						const uri = metadata.groundingChunks[i]?.web?.uri;
						if (uri) {
							return `[${i + 1}](${uri})`;
						}
						return null;
					})
					.filter(Boolean);

				if (citationLinks.length > 0) {
					const citationString = citationLinks.join(", ");
					// Calculate the insertion index relative to the current `citedTextChunk`
					const insertionIndex = originalEndIndex + offset;
					const safeInsertionIndex = this.findSafeInsertionPoint(citedTextChunk, insertionIndex);

					// Insert the citation into the citedTextChunk
					citedTextChunk =
						citedTextChunk.slice(0, safeInsertionIndex) + citationString + citedTextChunk.slice(safeInsertionIndex);

					offset += citationString.length; // Update offset for subsequent insertions
				}
			}
		}
		return citedTextChunk;
	}

	/**
	 * Extracts search queries that were used to generate the grounded response.
	 */
	public extractSearchQueries(groundingMetadata: GroundingMetadata): string[] {
		return groundingMetadata.webSearchQueries || [];
	}

	/**
	 * Extracts a structured list of sources with IDs, titles, and URIs.
	 */
	public extractSourceList(groundingMetadata: GroundingMetadata): CitationSource[] {
		return groundingMetadata.groundingChunks.map((chunk, index) => ({
			id: index + 1,
			title: chunk.web.title,
			uri: chunk.web.uri
		}));
	}

	/**
	 * Generates search entry point HTML if available and enabled.
	 */
	public getSearchEntryPoint(groundingMetadata: GroundingMetadata): string | null {
		return groundingMetadata.searchEntryPoint?.renderedContent || null;
	}

	/**
	 * Creates a summary of the grounding information for debugging/logging.
	 */
	public createGroundingSummary(groundingMetadata: GroundingMetadata): {
		queryCount: number;
		sourceCount: number;
		supportCount: number;
		queries: string[];
		sources: CitationSource[];
	} {
		return {
			queryCount: groundingMetadata.webSearchQueries?.length || 0,
			sourceCount: groundingMetadata.groundingChunks?.length || 0,
			supportCount: groundingMetadata.groundingSupports?.length || 0,
			queries: this.extractSearchQueries(groundingMetadata),
			sources: this.extractSourceList(groundingMetadata)
		};
	}
}
