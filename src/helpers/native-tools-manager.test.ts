/// <reference types="jest" />

import { NativeToolsManager } from "./native-tools-manager";
import { Env, Tool } from "../types";
import { NativeToolsRequestParams, NativeToolsConfiguration, GroundingMetadata } from "../types/native-tools";

/**
 * Creates a mock Env object with default values
 */
function createMockEnv(overrides?: Partial<Env>): Env {
	return {
		GCP_SERVICE_ACCOUNT: "{}",
		GEMINI_CLI_KV: {} as KVNamespace,
		...overrides
	};
}

/**
 * Creates a NativeToolsManager instance with optional environment overrides
 */
function createManager(envOverrides?: Partial<Env>): NativeToolsManager {
	const env = createMockEnv(envOverrides);
	return new NativeToolsManager(env);
}

describe("NativeToolsManager", () => {
	describe("constructor", () => {
		it("should create instance with default environment settings", () => {
			const manager = createManager();
			expect(manager).toBeDefined();
		});

		it("should parse environment settings correctly", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_GOOGLE_SEARCH: "true",
				ENABLE_URL_CONTEXT: "true",
				GEMINI_TOOLS_PRIORITY: "custom_first",
				ENABLE_INLINE_CITATIONS: "true"
			});
			expect(manager).toBeDefined();
		});
	});

	describe("determineToolConfiguration", () => {
		describe("when native tools are disabled", () => {
			it("should return custom-only config when ENABLE_GEMINI_NATIVE_TOOLS is false", () => {
				const manager = createManager({
					ENABLE_GEMINI_NATIVE_TOOLS: "false"
				});

				const customTools: Tool[] = [
					{
						type: "function",
						function: {
							name: "test_tool",
							description: "A test tool"
						}
					}
				];

				const result = manager.determineToolConfiguration(customTools, {}, "gemini-2.0-flash");

				expect(result.useNativeTools).toBe(false);
				expect(result.useCustomTools).toBe(true);
				expect(result.nativeTools).toEqual([]);
				expect(result.customTools).toEqual(customTools);
				expect(result.priority).toBe("custom");
				expect(result.toolType).toBe("custom_only");
			});

			it("should return empty custom tools array when none provided and native tools disabled", () => {
				const manager = createManager({
					ENABLE_GEMINI_NATIVE_TOOLS: "false"
				});

				const result = manager.determineToolConfiguration([], {}, "gemini-2.0-flash");

				expect(result.useNativeTools).toBe(false);
				expect(result.useCustomTools).toBe(true);
				expect(result.nativeTools).toEqual([]);
				expect(result.customTools).toEqual([]);
			});
		});

		describe("when native tools are enabled", () => {
			it("should return search_and_url config when enableSearch is true", () => {
				const manager = createManager({
					ENABLE_GEMINI_NATIVE_TOOLS: "true",
					ENABLE_GOOGLE_SEARCH: "true"
				});

				const result = manager.determineToolConfiguration(
					[],
					{ enableSearch: true },
					"gemini-2.0-flash"
				);

				expect(result.useNativeTools).toBe(true);
				expect(result.useCustomTools).toBe(false);
				expect(result.toolType).toBe("search_and_url");
			});

			it("should return search_and_url config when enableUrlContext is true", () => {
				const manager = createManager({
					ENABLE_GEMINI_NATIVE_TOOLS: "true",
					ENABLE_URL_CONTEXT: "true"
				});

				const result = manager.determineToolConfiguration(
					[],
					{ enableUrlContext: true },
					"gemini-2.0-flash"
				);

				expect(result.useNativeTools).toBe(true);
				expect(result.useCustomTools).toBe(false);
				expect(result.toolType).toBe("search_and_url");
			});

			it("should respect request-level enableSearch override", () => {
				const manager = createManager({
					ENABLE_GEMINI_NATIVE_TOOLS: "true",
					ENABLE_GOOGLE_SEARCH: "true"
				});

				// Request explicitly disables search
				const result = manager.determineToolConfiguration(
					[],
					{ enableSearch: false },
					"gemini-2.0-flash"
				);

				expect(result.toolType).toBe("custom_only");
			});

			it("should respect request-level enableUrlContext override", () => {
				const manager = createManager({
					ENABLE_GEMINI_NATIVE_TOOLS: "true",
					ENABLE_URL_CONTEXT: "true"
				});

				// Request explicitly disables URL context
				const result = manager.determineToolConfiguration(
					[],
					{ enableUrlContext: false },
					"gemini-2.0-flash"
				);

				expect(result.toolType).toBe("custom_only");
			});

			it("should use environment default when request param is not specified", () => {
				const manager = createManager({
					ENABLE_GEMINI_NATIVE_TOOLS: "true",
					ENABLE_GOOGLE_SEARCH: "true"
				});

				// No enableSearch in request params - should use env default
				const result = manager.determineToolConfiguration([], {}, "gemini-2.0-flash");

				expect(result.toolType).toBe("search_and_url");
			});
		});

		describe("priority handling", () => {
			const customTools: Tool[] = [
				{
					type: "function",
					function: {
						name: "custom_tool",
						description: "Custom tool"
					}
				}
			];

			it("should use native tools when priority is native_first", () => {
				const manager = createManager({
					ENABLE_GEMINI_NATIVE_TOOLS: "true",
					ENABLE_GOOGLE_SEARCH: "true",
					GEMINI_TOOLS_PRIORITY: "native_first"
				});

				const result = manager.determineToolConfiguration(
					customTools,
					{ enableSearch: true },
					"gemini-2.0-flash"
				);

				expect(result.useNativeTools).toBe(true);
				expect(result.useCustomTools).toBe(false);
				expect(result.priority).toBe("native");
			});

			it("should use custom tools when priority is custom_first and custom tools exist", () => {
				const manager = createManager({
					ENABLE_GEMINI_NATIVE_TOOLS: "true",
					ENABLE_GOOGLE_SEARCH: "true",
					GEMINI_TOOLS_PRIORITY: "custom_first"
				});

				const result = manager.determineToolConfiguration(
					customTools,
					{ enableSearch: true },
					"gemini-2.0-flash"
				);

				expect(result.useNativeTools).toBe(false);
				expect(result.useCustomTools).toBe(true);
				expect(result.priority).toBe("custom");
			});

			it("should use native tools when priority is custom_first but no custom tools exist", () => {
				const manager = createManager({
					ENABLE_GEMINI_NATIVE_TOOLS: "true",
					ENABLE_GOOGLE_SEARCH: "true",
					GEMINI_TOOLS_PRIORITY: "custom_first"
				});

				const result = manager.determineToolConfiguration(
					[],
					{ enableSearch: true },
					"gemini-2.0-flash"
				);

				expect(result.useNativeTools).toBe(true);
				expect(result.useCustomTools).toBe(false);
			});

			it("should respect request-level nativeToolsPriority override to native", () => {
				const manager = createManager({
					ENABLE_GEMINI_NATIVE_TOOLS: "true",
					ENABLE_GOOGLE_SEARCH: "true",
					GEMINI_TOOLS_PRIORITY: "custom_first"
				});

				const result = manager.determineToolConfiguration(
					customTools,
					{ enableSearch: true, nativeToolsPriority: "native" },
					"gemini-2.0-flash"
				);

				expect(result.useNativeTools).toBe(true);
				expect(result.priority).toBe("native");
			});
		});

		describe("model compatibility", () => {
			it("should handle legacy gemini-1.5 models", () => {
				const manager = createManager({
					ENABLE_GEMINI_NATIVE_TOOLS: "true",
					ENABLE_GOOGLE_SEARCH: "true"
				});

				const result = manager.determineToolConfiguration(
					[],
					{ enableSearch: true },
					"gemini-1.5-pro"
				);

				expect(result.toolType).toBe("search_and_url");
			});
		});
	});

	describe("createNativeToolsArray", () => {
		it("should return empty array when no tools are enabled", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true"
			});

			const result = manager.createNativeToolsArray({}, "gemini-2.0-flash");

			expect(result).toEqual([]);
		});

		it("should include google_search when enableSearch is true for non-legacy model", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_GOOGLE_SEARCH: "true"
			});

			const result = manager.createNativeToolsArray(
				{ enableSearch: true },
				"gemini-2.0-flash"
			);

			expect(result).toEqual([{ google_search: {} }]);
		});

		it("should NOT include google_search for legacy gemini-1.5 models", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_GOOGLE_SEARCH: "true"
			});

			const result = manager.createNativeToolsArray(
				{ enableSearch: true },
				"gemini-1.5-pro"
			);

			expect(result).toEqual([]);
		});

		it("should include url_context when enableUrlContext is true", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_URL_CONTEXT: "true"
			});

			const result = manager.createNativeToolsArray(
				{ enableUrlContext: true },
				"gemini-2.0-flash"
			);

			expect(result).toEqual([{ url_context: {} }]);
		});

		it("should NOT include url_context when google_search is also enabled", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_GOOGLE_SEARCH: "true",
				ENABLE_URL_CONTEXT: "true"
			});

			const result = manager.createNativeToolsArray(
				{ enableSearch: true, enableUrlContext: true },
				"gemini-2.0-flash"
			);

			expect(result).toEqual([{ google_search: {} }]);
		});

		it("should respect request-level disable for google_search", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_GOOGLE_SEARCH: "true"
			});

			const result = manager.createNativeToolsArray(
				{ enableSearch: false },
				"gemini-2.0-flash"
			);

			expect(result).toEqual([]);
		});

		it("should respect request-level disable for url_context", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_URL_CONTEXT: "true"
			});

			const result = manager.createNativeToolsArray(
				{ enableUrlContext: false },
				"gemini-2.0-flash"
			);

			expect(result).toEqual([]);
		});
	});

	describe("processCitationsInText", () => {
		it("should return original text when citations are disabled", () => {
			const manager = createManager({
				ENABLE_INLINE_CITATIONS: "false"
			});

			const text = "This is a statement.";
			const result = manager.processCitationsInText(text);

			expect(result).toBe(text);
		});

		it("should return original text when no grounding metadata provided", () => {
			const manager = createManager({
				ENABLE_INLINE_CITATIONS: "true"
			});

			const text = "This is a statement.";
			const result = manager.processCitationsInText(text);

			expect(result).toBe(text);
		});

		it("should add inline citations when enabled and metadata provided", () => {
			const manager = createManager({
				ENABLE_INLINE_CITATIONS: "true"
			});

			const text = "This is a statement based on research.";
			const groundingMetadata: GroundingMetadata = {
				groundingChunks: [
					{
						web: {
							uri: "https://example.com/source1",
							title: "Example Source 1"
						}
					}
				],
				groundingSupports: [
					{
						segment: {
							startIndex: 0,
							endIndex: 25,
							text: "This is a statement"
						},
						groundingChunkIndices: [0]
					}
				]
			};

			const result = manager.processCitationsInText(text, groundingMetadata);

			// Citation should be inserted after "statement"
			expect(result).toContain("[1](https://example.com/source1)");
		});

		it("should handle multiple citations", () => {
			const manager = createManager({
				ENABLE_INLINE_CITATIONS: "true"
			});

			const text = "First claim. Second claim.";
			const groundingMetadata: GroundingMetadata = {
				groundingChunks: [
					{
						web: {
							uri: "https://example.com/source1",
							title: "Example Source 1"
						}
					},
					{
						web: {
							uri: "https://example.com/source2",
							title: "Example Source 2"
						}
					}
				],
				groundingSupports: [
					{
						segment: {
							startIndex: 0,
							endIndex: 11,
							text: "First claim"
						},
						groundingChunkIndices: [0]
					},
					{
						segment: {
							startIndex: 13,
							endIndex: 25,
							text: "Second claim"
						},
						groundingChunkIndices: [1]
					}
				]
			};

			const result = manager.processCitationsInText(text, groundingMetadata);

			expect(result).toContain("[1](https://example.com/source1)");
			expect(result).toContain("[2](https://example.com/source2)");
		});

		it("should handle empty grounding supports array", () => {
			const manager = createManager({
				ENABLE_INLINE_CITATIONS: "true"
			});

			const text = "This is a statement.";
			const groundingMetadata: GroundingMetadata = {
				groundingChunks: [],
				groundingSupports: []
			};

			const result = manager.processCitationsInText(text, groundingMetadata);

			expect(result).toBe(text);
		});

		it("should handle missing webSearchQueries in metadata", () => {
			const manager = createManager({
				ENABLE_INLINE_CITATIONS: "true"
			});

			const text = "This is a statement.";
			const groundingMetadata: GroundingMetadata = {
				groundingChunks: [
					{
						web: {
							uri: "https://example.com",
							title: "Example"
						}
					}
				],
				groundingSupports: [
					{
						segment: {
							startIndex: 0,
							endIndex: 20,
							text: "This is a statement"
						},
						groundingChunkIndices: [0]
					}
				]
			};

			const result = manager.processCitationsInText(text, groundingMetadata);

			expect(result).toContain("[1](https://example.com)");
		});
	});

	describe("shouldEnableGoogleSearch (private method via integration)", () => {
		it("should return false when params.enableSearch is explicitly false", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_GOOGLE_SEARCH: "true"
			});

			const result = manager.determineToolConfiguration(
				[],
				{ enableSearch: false },
				"gemini-2.0-flash"
			);

			expect(result.toolType).toBe("custom_only");
		});

		it("should return true when params.enableSearch is explicitly true", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true"
			});

			const result = manager.determineToolConfiguration(
				[],
				{ enableSearch: true },
				"gemini-2.0-flash"
			);

			expect(result.toolType).toBe("search_and_url");
		});

		it("should use env default when params.enableSearch is undefined", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_GOOGLE_SEARCH: "true"
			});

			const result = manager.determineToolConfiguration(
				[],
				{},
				"gemini-2.0-flash"
			);

			expect(result.toolType).toBe("search_and_url");
		});
	});

	describe("shouldEnableUrlContext (private method via integration)", () => {
		it("should return false when params.enableUrlContext is explicitly false", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_URL_CONTEXT: "true"
			});

			const result = manager.determineToolConfiguration(
				[],
				{ enableUrlContext: false },
				"gemini-2.0-flash"
			);

			expect(result.toolType).toBe("custom_only");
		});

		it("should return true when params.enableUrlContext is explicitly true", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true"
			});

			const result = manager.determineToolConfiguration(
				[],
				{ enableUrlContext: true },
				"gemini-2.0-flash"
			);

			expect(result.toolType).toBe("search_and_url");
		});

		it("should use env default when params.enableUrlContext is undefined", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_URL_CONTEXT: "true"
			});

			const result = manager.determineToolConfiguration(
				[],
				{},
				"gemini-2.0-flash"
			);

			expect(result.toolType).toBe("search_and_url");
		});
	});

	describe("isLegacyModel (private method via integration)", () => {
		it("should identify gemini-1.5 models as legacy", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_GOOGLE_SEARCH: "true"
			});

			// Legacy model should not include google_search in native tools
			const result = manager.createNativeToolsArray(
				{ enableSearch: true },
				"gemini-1.5-flash"
			);

			expect(result).toEqual([]);
		});

		it("should not identify gemini-2.0 models as legacy", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_GOOGLE_SEARCH: "true"
			});

			const result = manager.createNativeToolsArray(
				{ enableSearch: true },
				"gemini-2.0-flash"
			);

			expect(result).toEqual([{ google_search: {} }]);
		});

		it("should not identify gemini-2.5 models as legacy", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_GOOGLE_SEARCH: "true"
			});

			const result = manager.createNativeToolsArray(
				{ enableSearch: true },
				"gemini-2.5-pro"
			);

			expect(result).toEqual([{ google_search: {} }]);
		});
	});

	describe("parseEnvironmentSettings (private method via integration)", () => {
		it("should use default values when no environment variables are set", () => {
			const manager = createManager();

			// With defaults, no native tools should be enabled
			const result = manager.determineToolConfiguration([], {}, "gemini-2.0-flash");

			expect(result.toolType).toBe("custom_only");
		});

		it("should handle all environment settings", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "true",
				ENABLE_GOOGLE_SEARCH: "true",
				ENABLE_URL_CONTEXT: "true",
				GEMINI_TOOLS_PRIORITY: "native_first",
				DEFAULT_TO_NATIVE_TOOLS: "true",
				ALLOW_REQUEST_TOOL_CONTROL: "true",
				ENABLE_INLINE_CITATIONS: "true",
				INCLUDE_GROUNDING_METADATA: "true",
				INCLUDE_SEARCH_ENTRY_POINT: "true"
			});

			const result = manager.determineToolConfiguration(
				[],
				{ enableSearch: true, enableUrlContext: true },
				"gemini-2.0-flash"
			);

			expect(result.useNativeTools).toBe(true);
			expect(result.toolType).toBe("search_and_url");
		});
	});

	describe("createNativeToolsArray with various models", () => {
		const testCases = [
			{ modelId: "gemini-1.5-pro", expectedGoogleSearch: false },
			{ modelId: "gemini-1.5-flash", expectedGoogleSearch: false },
			{ modelId: "gemini-2.0-flash", expectedGoogleSearch: true },
			{ modelId: "gemini-2.0-flash-lite", expectedGoogleSearch: true },
			{ modelId: "gemini-2.5-pro", expectedGoogleSearch: true },
			{ modelId: "gemini-2.5-flash", expectedGoogleSearch: true }
		];

		testCases.forEach(({ modelId, expectedGoogleSearch }) => {
			it(`should handle ${modelId} correctly (expected google_search: ${expectedGoogleSearch})`, () => {
				const manager = createManager({
					ENABLE_GEMINI_NATIVE_TOOLS: "true",
					ENABLE_GOOGLE_SEARCH: "true"
				});

				const result = manager.createNativeToolsArray(
					{ enableSearch: true },
					modelId
				);

				if (expectedGoogleSearch) {
					expect(result).toEqual([{ google_search: {} }]);
				} else {
					expect(result).toEqual([]);
				}
			});
		});
	});

	describe("edge cases", () => {
		it("should handle empty custom tools array", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "false"
			});

			const result = manager.determineToolConfiguration([], {}, "gemini-2.0-flash");

			expect(result.useCustomTools).toBe(true);
			expect(result.customTools).toEqual([]);
		});

		it("should handle multiple custom tools", () => {
			const manager = createManager({
				ENABLE_GEMINI_NATIVE_TOOLS: "false"
			});

			const customTools: Tool[] = [
				{
					type: "function",
					function: {
						name: "tool1",
						description: "First tool"
					}
				},
				{
					type: "function",
					function: {
						name: "tool2",
						description: "Second tool"
					}
				},
				{
					type: "function",
					function: {
						name: "tool3",
						description: "Third tool"
					}
				}
			];

			const result = manager.determineToolConfiguration(customTools, {}, "gemini-2.0-flash");

			expect(result.customTools).toHaveLength(3);
			expect(result.customTools?.[0].function.name).toBe("tool1");
			expect(result.customTools?.[1].function.name).toBe("tool2");
			expect(result.customTools?.[2].function.name).toBe("tool3");
		});

		it("should handle citation with missing URI", () => {
			const manager = createManager({
				ENABLE_INLINE_CITATIONS: "true"
			});

			const text = "This is a statement.";
			const groundingMetadata: GroundingMetadata = {
				groundingChunks: [
					{
						web: {
							uri: "", // Empty URI
							title: "Example"
						}
					}
				],
				groundingSupports: [
					{
						segment: {
							startIndex: 0,
							endIndex: 20,
							text: "This is a statement"
						},
						groundingChunkIndices: [0]
					}
				]
			};

			const result = manager.processCitationsInText(text, groundingMetadata);

			// Empty URI should be filtered out
			expect(result).toBe(text);
		});

		it("should handle citation with undefined URI", () => {
			const manager = createManager({
				ENABLE_INLINE_CITATIONS: "true"
			});

			const text = "This is a statement.";
			const groundingMetadata: GroundingMetadata = {
				groundingChunks: [
					{
						web: {
							uri: undefined as unknown as string,
							title: "Example"
						}
					}
				],
				groundingSupports: [
					{
						segment: {
							startIndex: 0,
							endIndex: 20,
							text: "This is a statement"
						},
						groundingChunkIndices: [0]
					}
				]
			};

			const result = manager.processCitationsInText(text, groundingMetadata);

			// Undefined URI should be filtered out
			expect(result).toBe(text);
		});

		it("should handle citation insertion at end of text", () => {
			const manager = createManager({
				ENABLE_INLINE_CITATIONS: "true"
			});

			const text = "This is a statement";
			const groundingMetadata: GroundingMetadata = {
				groundingChunks: [
					{
						web: {
							uri: "https://example.com",
							title: "Example"
						}
					}
				],
				groundingSupports: [
					{
						segment: {
							startIndex: 0,
							endIndex: 19, // At the end of text
							text: "This is a statement"
						},
						groundingChunkIndices: [0]
					}
				]
			};

			const result = manager.processCitationsInText(text, groundingMetadata);

			expect(result).toContain("[1](https://example.com)");
		});

		it("should handle citation with negative startIndex", () => {
			const manager = createManager({
				ENABLE_INLINE_CITATIONS: "true"
			});

			const text = "This is a statement.";
			const groundingMetadata: GroundingMetadata = {
				groundingChunks: [
					{
						web: {
							uri: "https://example.com",
							title: "Example"
						}
					}
				],
				groundingSupports: [
					{
						segment: {
							startIndex: -1, // Negative index
							endIndex: 10,
							text: "This is a"
						},
						groundingChunkIndices: [0]
					}
				]
			};

			const result = manager.processCitationsInText(text, groundingMetadata);

			// Negative startIndex should be skipped
			expect(result).toBe(text);
		});

		it("should handle citation with endIndex beyond text length", () => {
			const manager = createManager({
				ENABLE_INLINE_CITATIONS: "true"
			});

			const text = "This is a statement.";
			const groundingMetadata: GroundingMetadata = {
				groundingChunks: [
					{
						web: {
							uri: "https://example.com",
							title: "Example"
						}
					}
				],
				groundingSupports: [
					{
						segment: {
							startIndex: 0,
							endIndex: 100, // Beyond text length
							text: "This is a statement."
						},
						groundingChunkIndices: [0]
					}
				]
			};

			const result = manager.processCitationsInText(text, groundingMetadata);

			// endIndex beyond text length should be skipped
			expect(result).toBe(text);
		});
	});
});
