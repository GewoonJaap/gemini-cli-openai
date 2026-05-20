/// <reference types="jest" />

import { NativeToolsResponseProcessor } from "./native-tools-response-processor";
import { GeminiUrlContextMetadata, GroundingMetadata } from "../types/native-tools";
import { GeminiPart } from "../gemini-client";

describe("NativeToolsResponseProcessor", () => {
	let processor: NativeToolsResponseProcessor;

	beforeEach(() => {
		processor = new NativeToolsResponseProcessor();
	});

	describe("processNativeToolResponse", () => {
		it("should return url_context response when part has url_context_metadata", () => {
			const urlContextMetadata: GeminiUrlContextMetadata = {
				url_metadata: [
					{
						retrieved_url: "https://example.com",
						url_retrieval_status: "success"
					},
					{
						retrieved_url: "https://test.com",
						url_retrieval_status: "failed"
					}
				]
			};

			const part: GeminiPart = {
				url_context_metadata: urlContextMetadata
			};

			const result = processor.processNativeToolResponse(part);

			expect(result).toEqual({
				type: "url_context",
				data: urlContextMetadata
			});
		});

		it("should return null when part has no url_context_metadata", () => {
			const part: GeminiPart = {
				text: "Hello, world!"
			};

			const result = processor.processNativeToolResponse(part);

			expect(result).toBeNull();
		});

		it("should return null when part is empty", () => {
			const part: GeminiPart = {};

			const result = processor.processNativeToolResponse(part);

			expect(result).toBeNull();
		});

		it("should return null when part only has text", () => {
			const part: GeminiPart = {
				text: "Some text content"
			};

			const result = processor.processNativeToolResponse(part);

			expect(result).toBeNull();
		});

		it("should return null when part only has functionCall", () => {
			const part: GeminiPart = {
				functionCall: {
					name: "testFunction",
					args: { key: "value" }
				}
			};

			const result = processor.processNativeToolResponse(part);

			expect(result).toBeNull();
		});

		it("should return null when part only has functionResponse", () => {
			const part: GeminiPart = {
				functionResponse: {
					name: "testFunction",
					response: {
						result: "test result"
					}
				}
			};

			const result = processor.processNativeToolResponse(part);

			expect(result).toBeNull();
		});

		it("should return null when part only has inlineData", () => {
			const part: GeminiPart = {
				inlineData: {
					mimeType: "image/png",
					data: "base64data"
				}
			};

			const result = processor.processNativeToolResponse(part);

			expect(result).toBeNull();
		});

		it("should return null when part only has fileData", () => {
			const part: GeminiPart = {
				fileData: {
					mimeType: "image/jpeg",
					fileUri: "https://example.com/image.jpg"
				}
			};

			const result = processor.processNativeToolResponse(part);

			expect(result).toBeNull();
		});

		it("should prioritize url_context_metadata when part has multiple properties", () => {
			const urlContextMetadata: GeminiUrlContextMetadata = {
				url_metadata: [
					{
						retrieved_url: "https://example.com",
						url_retrieval_status: "success"
					}
				]
			};

			const part: GeminiPart = {
				text: "Some text",
				url_context_metadata: urlContextMetadata
			};

			const result = processor.processNativeToolResponse(part);

			expect(result).toEqual({
				type: "url_context",
				data: urlContextMetadata
			});
		});

		it("should handle empty url_metadata array", () => {
			const urlContextMetadata: GeminiUrlContextMetadata = {
				url_metadata: []
			};

			const part: GeminiPart = {
				url_context_metadata: urlContextMetadata
			};

			const result = processor.processNativeToolResponse(part);

			expect(result).toEqual({
				type: "url_context",
				data: urlContextMetadata
			});
		});
	});

	describe("processGroundingMetadata", () => {
		it("should return search response with groundingChunks and metadata", () => {
			const groundingMetadata: GroundingMetadata = {
				webSearchQueries: ["test query"],
				searchEntryPoint: {
					renderedContent: "<div>search results</div>"
				},
				groundingChunks: [
					{
						web: {
							uri: "https://example.com",
							title: "Example Website"
						}
					},
					{
						web: {
							uri: "https://test.com",
							title: "Test Website"
						}
					}
				],
				groundingSupports: [
					{
						segment: {
							startIndex: 0,
							endIndex: 10,
							text: "Some text"
						},
						groundingChunkIndices: [0, 1]
					}
				]
			};

			const result = processor.processGroundingMetadata(groundingMetadata);

			expect(result).toEqual({
				type: "search",
				data: groundingMetadata.groundingChunks,
				metadata: groundingMetadata
			});
		});

		it("should handle groundingMetadata with empty groundingChunks", () => {
			const groundingMetadata: GroundingMetadata = {
				groundingChunks: [],
				groundingSupports: []
			};

			const result = processor.processGroundingMetadata(groundingMetadata);

			expect(result).toEqual({
				type: "search",
				data: [],
				metadata: groundingMetadata
			});
		});

		it("should handle groundingMetadata with only groundingChunks", () => {
			const groundingMetadata: GroundingMetadata = {
				groundingChunks: [
					{
						web: {
							uri: "https://example.com",
							title: "Example"
						}
					}
				],
				groundingSupports: []
			};

			const result = processor.processGroundingMetadata(groundingMetadata);

			expect(result).toEqual({
				type: "search",
				data: groundingMetadata.groundingChunks,
				metadata: groundingMetadata
			});
		});

		it("should handle groundingMetadata without optional fields", () => {
			const groundingMetadata: GroundingMetadata = {
				groundingChunks: [
					{
						web: {
							uri: "https://example.com",
							title: "Example"
						}
					}
				],
				groundingSupports: []
			};

			const result = processor.processGroundingMetadata(groundingMetadata);

			expect(result).toEqual({
				type: "search",
				data: groundingMetadata.groundingChunks,
				metadata: groundingMetadata
			});
		});

		it("should handle groundingMetadata with multiple groundingChunks", () => {
			const groundingMetadata: GroundingMetadata = {
				groundingChunks: [
					{
						web: {
							uri: "https://example1.com",
							title: "Example 1"
						}
					},
					{
						web: {
							uri: "https://example2.com",
							title: "Example 2"
						}
					},
					{
						web: {
							uri: "https://example3.com",
							title: "Example 3"
						}
					}
				],
				groundingSupports: []
			};

			const result = processor.processGroundingMetadata(groundingMetadata);

			expect(result.data).toHaveLength(3);
			expect(result.type).toBe("search");
			expect(result.metadata).toBe(groundingMetadata);
		});
	});
});
