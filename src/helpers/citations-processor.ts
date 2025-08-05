import { Env } from "../types";
import { GroundingMetadata, CitationSource } from "../types/native-tools";

/**
 * Processes grounding metadata to add inline citations to text responses.
 * Implements the citation logic as described in the Gemini API documentation.
 */
export class CitationsProcessor {
	private enableInlineCitations: boolean;
	private fullText = "";
	private lastCitedText = "";

	constructor(env: Env) {
		this.enableInlineCitations = env.ENABLE_INLINE_CITATIONS === "true";
	}

	public processChunk(textChunk: string, metadata?: GroundingMetadata): string {
		if (!this.enableInlineCitations) {
			return textChunk;
		}

		this.fullText += textChunk;

		let newCitedText = this.fullText;

		if (metadata && metadata.groundingSupports && metadata.groundingChunks) {
			const supports = [...metadata.groundingSupports].sort(
				(a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0)
			);

			for (const support of supports) {
				const endIndex = support.segment?.endIndex;
				if (endIndex === undefined || !support.groundingChunkIndices?.length) {
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
					newCitedText = newCitedText.slice(0, endIndex) + citationString + newCitedText.slice(endIndex);
				}
			}
		}

		const newContent = newCitedText.substring(this.lastCitedText.length);
		this.lastCitedText = newCitedText; // Always update lastCitedText with the fully cited text
		return newContent;
	}

	/**
	 * Adds inline citations to text based on grounding metadata.
	 * Citations are inserted at the end of text segments that have grounding support.
	 * Format: [1](link1), [2](link2)
	 */
	public addCitations(text: string, groundingMetadata: GroundingMetadata): string {
		if (!this.enableInlineCitations || !groundingMetadata.groundingSupports) {
			return text;
		}

		console.log(JSON.stringify(groundingMetadata, null, 2));
		console.log("Processing citations in text:", text);

		const supports = groundingMetadata.groundingSupports;
		const chunks = groundingMetadata.groundingChunks;

		if (!supports || !chunks || supports.length === 0 || chunks.length === 0) {
			return text;
		}

		// Sort supports by end_index in descending order to avoid shifting issues when inserting.
		const sortedSupports = [...supports].sort((a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0));

		let processedText = text;

		for (const support of sortedSupports) {
			const endIndex = support.segment?.endIndex;
			if (endIndex === undefined || !support.groundingChunkIndices?.length) {
				continue;
			}

			const citationLinks = support.groundingChunkIndices
				.map((i) => {
					const uri = chunks[i]?.web?.uri;
					if (uri) {
						return `[${i + 1}](${uri})`;
					}
					return null;
				})
				.filter(Boolean);

			if (citationLinks.length > 0) {
				const citationString = citationLinks.join(", ");
				processedText = processedText.slice(0, endIndex) + citationString + processedText.slice(endIndex);
			}
		}

		return processedText;
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
