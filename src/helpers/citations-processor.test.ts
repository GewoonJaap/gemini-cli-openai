/// <reference types="jest" />

import { CitationsProcessor } from "./citations-processor";
import { GroundingMetadata, CitationSource } from "../types/native-tools";
import { Env } from "../types";

describe("CitationsProcessor", () => {
	let processor: CitationsProcessor;

	const createMockEnv = (enableInlineCitations = "true"): Env => ({
		GCP_SERVICE_ACCOUNT: "{}",
		GEMINI_CLI_KV: {} as KVNamespace,
		ENABLE_INLINE_CITATIONS: enableInlineCitations
	});

	const createMockGroundingMetadata = (overrides?: Partial<GroundingMetadata>): GroundingMetadata => ({
		webSearchQueries: [],
		searchEntryPoint: undefined,
		groundingChunks: [],
		groundingSupports: [],
		...overrides
	});

	describe("constructor", () => {
		it("should enable inline citations when ENABLE_INLINE_CITATIONS is 'true'", () => {
			const env = createMockEnv("true");
			processor = new CitationsProcessor(env);
			// Test by checking if processChunk adds citations
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toContain("[1](https://example.com)");
		});

		it("should disable inline citations when ENABLE_INLINE_CITATIONS is 'false'", () => {
			const env = createMockEnv("false");
			processor = new CitationsProcessor(env);
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello world");
		});

		it("should disable inline citations when ENABLE_INLINE_CITATIONS is undefined", () => {
			const env: Env = {
				GCP_SERVICE_ACCOUNT: "{}",
				GEMINI_CLI_KV: {} as KVNamespace
				// ENABLE_INLINE_CITATIONS is intentionally omitted
			};
			processor = new CitationsProcessor(env);
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello world");
		});
	});

	describe("processChunk", () => {
		beforeEach(() => {
			processor = new CitationsProcessor(createMockEnv("true"));
		});

		it("should return text unchanged when metadata is undefined", () => {
			const result = processor.processChunk("Hello world");
			expect(result).toBe("Hello world");
		});

		it("should return text unchanged when metadata has no groundingSupports", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: []
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello world");
		});

		it("should return text unchanged when metadata has no groundingChunks", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello world");
		});

		it("should add citation at the end of supported text segment", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello[1](https://example.com) world");
		});

		it("should handle multiple citations in sorted order", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example1.com", title: "Example 1" } },
					{ web: { uri: "https://example2.com", title: "Example 2" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					},
					{
						segment: { startIndex: 6, endIndex: 11, text: "world" },
						groundingChunkIndices: [1]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello[1](https://example1.com) world[2](https://example2.com)");
		});

		it("should handle multiple sources for a single segment", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example1.com", title: "Example 1" } },
					{ web: { uri: "https://example2.com", title: "Example 2" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0, 1]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello[1](https://example1.com), [2](https://example2.com) world");
		});

		it("should skip citations with undefined startIndex", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: undefined as unknown as number, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello world");
		});

		it("should skip citations with undefined endIndex", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: undefined as unknown as number, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello world");
		});

		it("should skip citations with negative startIndex", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: -1, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello world");
		});

		it("should skip citations with endIndex beyond text length", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 20, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello world");
		});

		it("should skip citations with empty groundingChunkIndices", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: []
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello world");
		});

		it("should skip citations when groundingChunk has no URI", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello world");
		});

		it("should find safe insertion point at whitespace", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			// Citation should be inserted at the space after "Hello"
			expect(result).toBe("Hello[1](https://example.com) world");
		});

		it("should find safe insertion point at punctuation", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello, world", metadata);
			// Citation should be inserted at the comma
			expect(result).toBe("Hello[1](https://example.com), world");
		});

		it("should handle citation at end of text", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 11, text: "Hello world" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello world[1](https://example.com)");
		});

		it("should handle citation in middle of word (fallback)", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 3, text: "Hel" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Helloworld", metadata);
			// No safe break found, should insert at original index
			expect(result).toBe("Hel[1](https://example.com)loworld");
		});

		it("should sort groundingSupports by startIndex before processing", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example1.com", title: "Example 1" } },
					{ web: { uri: "https://example2.com", title: "Example 2" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 6, endIndex: 11, text: "world" },
						groundingChunkIndices: [1]
					},
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello[1](https://example1.com) world[2](https://example2.com)");
		});
	});

	describe("extractSearchQueries", () => {
		beforeEach(() => {
			processor = new CitationsProcessor(createMockEnv());
		});

		it("should extract web search queries from metadata", () => {
			const metadata = createMockGroundingMetadata({
				webSearchQueries: ["query 1", "query 2", "query 3"]
			});
			const result = processor.extractSearchQueries(metadata);
			expect(result).toEqual(["query 1", "query 2", "query 3"]);
		});

		it("should return empty array when no web search queries", () => {
			const metadata = createMockGroundingMetadata({
				webSearchQueries: []
			});
			const result = processor.extractSearchQueries(metadata);
			expect(result).toEqual([]);
		});

		it("should return empty array when webSearchQueries is undefined", () => {
			const metadata = createMockGroundingMetadata();
			const result = processor.extractSearchQueries(metadata);
			expect(result).toEqual([]);
		});
	});

	describe("extractSourceList", () => {
		beforeEach(() => {
			processor = new CitationsProcessor(createMockEnv());
		});

		it("should extract sources with IDs, titles, and URIs", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example1.com", title: "Example 1" } },
					{ web: { uri: "https://example2.com", title: "Example 2" } }
				]
			});
			const result = processor.extractSourceList(metadata);
			expect(result).toEqual([
				{ id: 1, title: "Example 1", uri: "https://example1.com" },
				{ id: 2, title: "Example 2", uri: "https://example2.com" }
			]);
		});

		it("should return empty array when no grounding chunks", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: []
			});
			const result = processor.extractSourceList(metadata);
			expect(result).toEqual([]);
		});

		it("should use 1-based indexing for source IDs", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				]
			});
			const result = processor.extractSourceList(metadata);
			expect(result[0].id).toBe(1);
		});
	});

	describe("getSearchEntryPoint", () => {
		beforeEach(() => {
			processor = new CitationsProcessor(createMockEnv());
		});

		it("should return rendered content from search entry point", () => {
			const metadata = createMockGroundingMetadata({
				searchEntryPoint: {
					renderedContent: "<div>search results</div>"
				}
			});
			const result = processor.getSearchEntryPoint(metadata);
			expect(result).toBe("<div>search results</div>");
		});

		it("should return null when search entry point is undefined", () => {
			const metadata = createMockGroundingMetadata({
				searchEntryPoint: undefined
			});
			const result = processor.getSearchEntryPoint(metadata);
			expect(result).toBeNull();
		});

		it("should return null when rendered content is undefined", () => {
			const metadata = createMockGroundingMetadata({
				searchEntryPoint: {
					renderedContent: undefined as unknown as string
				}
			});
			const result = processor.getSearchEntryPoint(metadata);
			expect(result).toBeNull();
		});
	});

	describe("createGroundingSummary", () => {
		beforeEach(() => {
			processor = new CitationsProcessor(createMockEnv());
		});

		it("should create summary with all grounding information", () => {
			const metadata = createMockGroundingMetadata({
				webSearchQueries: ["query 1", "query 2"],
				groundingChunks: [
					{ web: { uri: "https://example1.com", title: "Example 1" } },
					{ web: { uri: "https://example2.com", title: "Example 2" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					},
					{
						segment: { startIndex: 6, endIndex: 11, text: "world" },
						groundingChunkIndices: [1]
					}
				]
			});
			const result = processor.createGroundingSummary(metadata);
			expect(result).toEqual({
				queryCount: 2,
				sourceCount: 2,
				supportCount: 2,
				queries: ["query 1", "query 2"],
				sources: [
					{ id: 1, title: "Example 1", uri: "https://example1.com" },
					{ id: 2, title: "Example 2", uri: "https://example2.com" }
				]
			});
		});

		it("should handle empty grounding data", () => {
			const metadata = createMockGroundingMetadata({
				webSearchQueries: [],
				groundingChunks: [],
				groundingSupports: []
			});
			const result = processor.createGroundingSummary(metadata);
			expect(result).toEqual({
				queryCount: 0,
				sourceCount: 0,
				supportCount: 0,
				queries: [],
				sources: []
			});
		});

		it("should handle undefined arrays", () => {
			const metadata = createMockGroundingMetadata();
			const result = processor.createGroundingSummary(metadata);
			expect(result).toEqual({
				queryCount: 0,
				sourceCount: 0,
				supportCount: 0,
				queries: [],
				sources: []
			});
		});
	});

	describe("findSafeInsertionPoint (private method via processChunk)", () => {
		beforeEach(() => {
			processor = new CitationsProcessor(createMockEnv("true"));
		});

		it("should return text length when index is at or beyond end of text", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 11, text: "Hello world" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world", metadata);
			expect(result).toBe("Hello world[1](https://example.com)");
		});

		it("should find whitespace as safe insertion point", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello world test", metadata);
			expect(result).toBe("Hello[1](https://example.com) world test");
		});

		it("should find period as safe insertion point", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello. World", metadata);
			expect(result).toBe("Hello[1](https://example.com). World");
		});

		it("should find comma as safe insertion point", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello, world", metadata);
			expect(result).toBe("Hello[1](https://example.com), world");
		});

		it("should find exclamation mark as safe insertion point", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello! World", metadata);
			expect(result).toBe("Hello[1](https://example.com)! World");
		});

		it("should find question mark as safe insertion point", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello? World", metadata);
			expect(result).toBe("Hello[1](https://example.com)? World");
		});

		it("should find semicolon as safe insertion point", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello; world", metadata);
			expect(result).toBe("Hello[1](https://example.com); world");
		});

		it("should find colon as safe insertion point", () => {
			const metadata = createMockGroundingMetadata({
				groundingChunks: [
					{ web: { uri: "https://example.com", title: "Example" } }
				],
				groundingSupports: [
					{
						segment: { startIndex: 0, endIndex: 5, text: "Hello" },
						groundingChunkIndices: [0]
					}
				]
			});
			const result = processor.processChunk("Hello: world", metadata);
			expect(result).toBe("Hello[1](https://example.com): world");
		});
	});
});
