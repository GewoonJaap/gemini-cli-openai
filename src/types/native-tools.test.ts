// Unit tests for native-tools.ts type definitions
// These tests verify TypeScript type correctness through compile-time checks

/// <reference types="jest" />
/// <reference types="node" />

import {
	GroundingMetadata,
	GroundingChunk,
	GroundingSupport,
	GeminiUrlContextMetadata,
	NativeTool,
	NativeToolsConfiguration,
	NativeToolsRequestParams,
	NativeToolsEnvSettings,
	CitationSource,
	NativeToolResponse,
} from "./native-tools";
import { Tool } from "../types";
import { describe, it, expect } from "@jest/globals";

describe("Native Tools Type Definitions", () => {
	describe("GroundingMetadata", () => {
		it("should accept valid GroundingMetadata object with all fields", () => {
			const metadata: GroundingMetadata = {
				webSearchQueries: ["query1", "query2"],
				searchEntryPoint: {
					renderedContent: "<div>content</div>",
				},
				groundingChunks: [
					{
						web: {
							uri: "https://example.com",
							title: "Example",
						},
					},
				],
				groundingSupports: [
					{
						segment: {
							startIndex: 0,
							endIndex: 10,
							text: "sample text",
						},
						groundingChunkIndices: [0, 1],
					},
				],
			};
			expect(metadata).toBeDefined();
		});

		it("should accept GroundingMetadata with optional fields omitted", () => {
			const metadata: GroundingMetadata = {
				webSearchQueries: undefined,
				searchEntryPoint: undefined,
				groundingChunks: [],
				groundingSupports: [],
			};
			expect(metadata).toBeDefined();
		});
	});

	describe("GroundingChunk", () => {
		it("should accept valid GroundingChunk object", () => {
			const chunk: GroundingChunk = {
				web: {
					uri: "https://example.com/article",
					title: "Article Title",
				},
			};
			expect(chunk.web.uri).toBe("https://example.com/article");
			expect(chunk.web.title).toBe("Article Title");
		});
	});

	describe("GroundingSupport", () => {
		it("should accept valid GroundingSupport object", () => {
			const support: GroundingSupport = {
				segment: {
					startIndex: 5,
					endIndex: 25,
					text: "supported text segment",
				},
				groundingChunkIndices: [0, 2, 4],
			};
			expect(support.segment.startIndex).toBe(5);
			expect(support.groundingChunkIndices.length).toBe(3);
		});
	});

	describe("GeminiUrlContextMetadata", () => {
		it("should accept valid GeminiUrlContextMetadata object", () => {
			const metadata: GeminiUrlContextMetadata = {
				url_metadata: [
					{
						retrieved_url: "https://example.com",
						url_retrieval_status: "success",
					},
					{
						retrieved_url: "https://another.com",
						url_retrieval_status: "failed",
					},
				],
			};
			expect(metadata.url_metadata.length).toBe(2);
		});

		it("should accept empty url_metadata array", () => {
			const metadata: GeminiUrlContextMetadata = {
				url_metadata: [],
			};
			expect(metadata.url_metadata).toEqual([]);
		});
	});

	describe("NativeTool", () => {
		it("should accept NativeTool with google_search", () => {
			const tool: NativeTool = {
				google_search: {},
			};
			expect(tool.google_search).toEqual({});
		});

		it("should accept NativeTool with url_context", () => {
			const tool: NativeTool = {
				url_context: {},
			};
			expect(tool.url_context).toEqual({});
		});

		it("should accept NativeTool with both google_search and url_context", () => {
			const tool: NativeTool = {
				google_search: { enabled: true },
				url_context: { maxUrls: 5 },
			};
			expect(tool.google_search).toBeDefined();
			expect(tool.url_context).toBeDefined();
		});

		it("should accept empty NativeTool", () => {
			const tool: NativeTool = {};
			expect(tool).toEqual({});
		});
	});

	describe("NativeToolsConfiguration", () => {
		it("should accept valid NativeToolsConfiguration with all fields", () => {
			const config: NativeToolsConfiguration = {
				useNativeTools: true,
				useCustomTools: false,
				nativeTools: [{ google_search: {} }],
				customTools: [],
				priority: "native",
				toolType: "search_and_url",
			};
			expect(config.useNativeTools).toBe(true);
			expect(config.priority).toBe("native");
		});

		it("should accept NativeToolsConfiguration without optional customTools", () => {
			const config: NativeToolsConfiguration = {
				useNativeTools: true,
				useCustomTools: false,
				nativeTools: [],
				priority: "custom",
				toolType: "custom_only",
			};
			expect(config.customTools).toBeUndefined();
		});

		it("should accept NativeToolsConfiguration with customTools array", () => {
			const mockTool: Tool = {
				type: "function",
				function: {
					name: "testTool",
					description: "A test tool",
					parameters: {
						type: "object",
						properties: {},
					},
				},
			};
			const config: NativeToolsConfiguration = {
				useNativeTools: false,
				useCustomTools: true,
				nativeTools: [],
				customTools: [mockTool],
				priority: "native",
				toolType: "custom_only",
			};
			expect(config.customTools?.length).toBe(1);
		});
	});

	describe("NativeToolsRequestParams", () => {
		it("should accept valid NativeToolsRequestParams with all fields", () => {
			const params: NativeToolsRequestParams = {
				enableSearch: true,
				enableUrlContext: true,
				enableNativeTools: true,
				nativeToolsPriority: "native",
			};
			expect(params.enableSearch).toBe(true);
			expect(params.nativeToolsPriority).toBe("native");
		});

		it("should accept NativeToolsRequestParams with all fields omitted", () => {
			const params: NativeToolsRequestParams = {};
			expect(params).toEqual({});
		});

		it("should accept different nativeToolsPriority values", () => {
			const paramsNative: NativeToolsRequestParams = {
				nativeToolsPriority: "native",
			};
			const paramsCustom: NativeToolsRequestParams = {
				nativeToolsPriority: "custom",
			};
			const paramsMixed: NativeToolsRequestParams = {
				nativeToolsPriority: "mixed",
			};
			expect(paramsNative.nativeToolsPriority).toBe("native");
			expect(paramsCustom.nativeToolsPriority).toBe("custom");
			expect(paramsMixed.nativeToolsPriority).toBe("mixed");
		});
	});

	describe("NativeToolsEnvSettings", () => {
		it("should accept valid NativeToolsEnvSettings with all fields", () => {
			const settings: NativeToolsEnvSettings = {
				enableNativeTools: true,
				enableGoogleSearch: true,
				enableUrlContext: true,
				priority: "native_first",
				defaultToNativeTools: true,
				allowRequestControl: true,
				enableInlineCitations: true,
				includeGroundingMetadata: true,
				includeSearchEntryPoint: true,
			};
			expect(settings.enableNativeTools).toBe(true);
			expect(settings.priority).toBe("native_first");
		});

		it("should accept different priority values", () => {
			const settingsNative: NativeToolsEnvSettings = {
				enableNativeTools: true,
				enableGoogleSearch: false,
				enableUrlContext: false,
				priority: "native_first",
				defaultToNativeTools: false,
				allowRequestControl: false,
				enableInlineCitations: false,
				includeGroundingMetadata: false,
				includeSearchEntryPoint: false,
			};
			const settingsCustom: NativeToolsEnvSettings = {
				enableNativeTools: false,
				enableGoogleSearch: false,
				enableUrlContext: false,
				priority: "custom_first",
				defaultToNativeTools: false,
				allowRequestControl: false,
				enableInlineCitations: false,
				includeGroundingMetadata: false,
				includeSearchEntryPoint: false,
			};
			const settingsUser: NativeToolsEnvSettings = {
				enableNativeTools: false,
				enableGoogleSearch: false,
				enableUrlContext: false,
				priority: "user_choice",
				defaultToNativeTools: false,
				allowRequestControl: false,
				enableInlineCitations: false,
				includeGroundingMetadata: false,
				includeSearchEntryPoint: false,
			};
			expect(settingsNative.priority).toBe("native_first");
			expect(settingsCustom.priority).toBe("custom_first");
			expect(settingsUser.priority).toBe("user_choice");
		});
	});

	describe("CitationSource", () => {
		it("should accept valid CitationSource object", () => {
			const citation: CitationSource = {
				id: 1,
				title: "Example Article",
				uri: "https://example.com/article",
			};
			expect(citation.id).toBe(1);
			expect(citation.title).toBe("Example Article");
			expect(citation.uri).toBe("https://example.com/article");
		});
	});

	describe("NativeToolResponse", () => {
		it("should accept valid NativeToolResponse with search type", () => {
			const response: NativeToolResponse = {
				type: "search",
				data: { queries: ["test"] },
				metadata: { source: "google" },
			};
			expect(response.type).toBe("search");
			expect(response.data).toBeDefined();
		});

		it("should accept valid NativeToolResponse with url_context type", () => {
			const response: NativeToolResponse = {
				type: "url_context",
				data: { urls: ["https://example.com"] },
			};
			expect(response.type).toBe("url_context");
			expect(response.metadata).toBeUndefined();
		});

		it("should accept NativeToolResponse with unknown data types", () => {
			const responseString: NativeToolResponse = {
				type: "search",
				data: "string data",
			};
			const responseNumber: NativeToolResponse = {
				type: "search",
				data: 123,
			};
			const responseObject: NativeToolResponse = {
				type: "search",
				data: { nested: { object: true } },
			};
			expect(responseString.data).toBe("string data");
			expect(responseNumber.data).toBe(123);
			expect(responseObject.data).toEqual({ nested: { object: true } });
		});
	});

	describe("Type Integration", () => {
		it("should allow creating a complete native tools configuration", () => {
			const fullConfig: {
				configuration: NativeToolsConfiguration;
				requestParams: NativeToolsRequestParams;
				envSettings: NativeToolsEnvSettings;
			} = {
				configuration: {
					useNativeTools: true,
					useCustomTools: true,
					nativeTools: [{ google_search: {} }, { url_context: {} }],
					customTools: [
						{
							type: "function",
							function: {
								name: "customTool",
								description: "Custom tool description",
								parameters: {
									param1: { type: "string" },
								},
							},
						},
					],
					priority: "native",
					toolType: "search_and_url",
				},
				requestParams: {
					enableSearch: true,
					enableUrlContext: true,
					enableNativeTools: true,
					nativeToolsPriority: "mixed",
				},
				envSettings: {
					enableNativeTools: true,
					enableGoogleSearch: true,
					enableUrlContext: true,
					priority: "user_choice",
					defaultToNativeTools: false,
					allowRequestControl: true,
					enableInlineCitations: true,
					includeGroundingMetadata: true,
					includeSearchEntryPoint: false,
				},
			};
			expect(fullConfig.configuration.nativeTools.length).toBe(2);
			expect(fullConfig.requestParams.nativeToolsPriority).toBe("mixed");
			expect(fullConfig.envSettings.priority).toBe("user_choice");
		});

		it("should allow creating grounding metadata with full citation chain", () => {
			const groundingData: {
				chunks: GroundingChunk[];
				supports: GroundingSupport[];
				metadata: GroundingMetadata;
			} = {
				chunks: [
					{
						web: {
							uri: "https://source1.com",
							title: "Source 1",
						},
					},
					{
						web: {
							uri: "https://source2.com",
							title: "Source 2",
						},
					},
				],
				supports: [
					{
						segment: {
							startIndex: 0,
							endIndex: 15,
							text: "quoted content",
						},
						groundingChunkIndices: [0, 1],
					},
				],
				metadata: {
					webSearchQueries: ["search query"],
					searchEntryPoint: {
						renderedContent: "<div>entry point</div>",
					},
					groundingChunks: [
						{
							web: {
								uri: "https://source1.com",
								title: "Source 1",
							},
						},
					],
					groundingSupports: [
						{
							segment: {
								startIndex: 0,
								endIndex: 15,
								text: "quoted content",
							},
							groundingChunkIndices: [0],
						},
					],
				},
			};
			expect(groundingData.chunks.length).toBe(2);
			expect(groundingData.supports[0].groundingChunkIndices).toEqual([0, 1]);
		});
	});
});
