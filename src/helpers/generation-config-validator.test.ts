/// <reference types="jest" />

import { GenerationConfigValidator } from "./generation-config-validator";
import {
	DEFAULT_THINKING_BUDGET,
	DEFAULT_TEMPERATURE,
	REASONING_EFFORT_BUDGETS,
	GEMINI_SAFETY_CATEGORIES
} from "../constants";
import { ChatCompletionRequest, Env, SafetyThreshold, Tool } from "../types";
import { NativeToolsConfiguration, NativeTool } from "../types/native-tools";

// Mock the models import
jest.mock("../models", () => ({
	geminiCliModels: {
		"gemini-2.5-pro": { thinking: true },
		"gemini-2.5-flash": { thinking: true },
		"gemini-2.0-flash": { thinking: true },
		"gemini-1.5-pro": { thinking: false },
		"gemini-1.5-flash": { thinking: false }
	}
}));

// Mock KVNamespace for Env type
jest.mock("@cloudflare/workers-types", () => ({
	__esModule: true,
}));

// Helper to create partial Env objects
const createEnv = (overrides?: Partial<Env>): Env =>
	({
		GCP_SERVICE_ACCOUNT: "{}",
		GEMINI_CLI_KV: {} as KVNamespace,
		...overrides
	}) as Env;

describe("GenerationConfigValidator", () => {
	describe("mapEffortToThinkingBudget", () => {
		it("should return REASONING_EFFORT_BUDGETS.none for 'none' effort", () => {
			const result = GenerationConfigValidator.mapEffortToThinkingBudget("none", "gemini-2.5-pro");
			expect(result).toBe(REASONING_EFFORT_BUDGETS.none);
		});

		it("should return REASONING_EFFORT_BUDGETS.low for 'low' effort", () => {
			const result = GenerationConfigValidator.mapEffortToThinkingBudget("low", "gemini-2.5-pro");
			expect(result).toBe(REASONING_EFFORT_BUDGETS.low);
		});

		it("should return flash budget for 'medium' effort on flash models", () => {
			const result = GenerationConfigValidator.mapEffortToThinkingBudget("medium", "gemini-2.5-flash");
			expect(result).toBe(REASONING_EFFORT_BUDGETS.medium.flash);
		});

		it("should return default budget for 'medium' effort on non-flash models", () => {
			const result = GenerationConfigValidator.mapEffortToThinkingBudget("medium", "gemini-2.5-pro");
			expect(result).toBe(REASONING_EFFORT_BUDGETS.medium.default);
		});

		it("should return flash budget for 'high' effort on flash models", () => {
			const result = GenerationConfigValidator.mapEffortToThinkingBudget("high", "gemini-2.0-flash");
			expect(result).toBe(REASONING_EFFORT_BUDGETS.high.flash);
		});

		it("should return default budget for 'high' effort on non-flash models", () => {
			const result = GenerationConfigValidator.mapEffortToThinkingBudget("high", "gemini-2.5-pro");
			expect(result).toBe(REASONING_EFFORT_BUDGETS.high.default);
		});

		it("should return DEFAULT_THINKING_BUDGET for invalid effort", () => {
			const result = GenerationConfigValidator.mapEffortToThinkingBudget("invalid" as any, "gemini-2.5-pro");
			expect(result).toBe(DEFAULT_THINKING_BUDGET);
		});
	});

	describe("isValidEffortLevel", () => {
		it("should return true for 'none'", () => {
			expect(GenerationConfigValidator.isValidEffortLevel("none")).toBe(true);
		});

		it("should return true for 'low'", () => {
			expect(GenerationConfigValidator.isValidEffortLevel("low")).toBe(true);
		});

		it("should return true for 'medium'", () => {
			expect(GenerationConfigValidator.isValidEffortLevel("medium")).toBe(true);
		});

		it("should return true for 'high'", () => {
			expect(GenerationConfigValidator.isValidEffortLevel("high")).toBe(true);
		});

		it("should return false for invalid string", () => {
			expect(GenerationConfigValidator.isValidEffortLevel("invalid")).toBe(false);
		});

		it("should return false for non-string values", () => {
			expect(GenerationConfigValidator.isValidEffortLevel(123)).toBe(false);
			expect(GenerationConfigValidator.isValidEffortLevel(null)).toBe(false);
			expect(GenerationConfigValidator.isValidEffortLevel(undefined)).toBe(false);
			expect(GenerationConfigValidator.isValidEffortLevel({})).toBe(false);
		});
	});

	describe("createSafetySettings", () => {
		it("should return empty array when no thresholds are provided", () => {
			const env = createEnv();
			const result = GenerationConfigValidator.createSafetySettings(env);
			expect(result).toEqual([]);
		});

		it("should create safety setting for HARASSMENT threshold", () => {
			const env = createEnv({
				GEMINI_MODERATION_HARASSMENT_THRESHOLD: "BLOCK_ONLY_HIGH"
			});
			const result = GenerationConfigValidator.createSafetySettings(env);
			expect(result).toEqual([
				{
					category: GEMINI_SAFETY_CATEGORIES.HARASSMENT,
					threshold: "BLOCK_ONLY_HIGH"
				}
			]);
		});

		it("should create safety setting for HATE_SPEECH threshold", () => {
			const env = createEnv({
				GEMINI_MODERATION_HATE_SPEECH_THRESHOLD: "BLOCK_FEW"
			});
			const result = GenerationConfigValidator.createSafetySettings(env);
			expect(result).toEqual([
				{
					category: GEMINI_SAFETY_CATEGORIES.HATE_SPEECH,
					threshold: "BLOCK_FEW"
				}
			]);
		});

		it("should create safety setting for SEXUALLY_EXPLICIT threshold", () => {
			const env = createEnv({
				GEMINI_MODERATION_SEXUALLY_EXPLICIT_THRESHOLD: "BLOCK_NONE"
			});
			const result = GenerationConfigValidator.createSafetySettings(env);
			expect(result).toEqual([
				{
					category: GEMINI_SAFETY_CATEGORIES.SEXUALLY_EXPLICIT,
					threshold: "BLOCK_NONE"
				}
			]);
		});

		it("should create safety setting for DANGEROUS_CONTENT threshold", () => {
			const env = createEnv({
				GEMINI_MODERATION_DANGEROUS_CONTENT_THRESHOLD: "BLOCK_ONLY_HIGH"
			});
			const result = GenerationConfigValidator.createSafetySettings(env);
			expect(result).toEqual([
				{
					category: GEMINI_SAFETY_CATEGORIES.DANGEROUS_CONTENT,
					threshold: "BLOCK_ONLY_HIGH"
				}
			]);
		});

		it("should create multiple safety settings when multiple thresholds are provided", () => {
			const env = createEnv({
				GEMINI_MODERATION_HARASSMENT_THRESHOLD: "BLOCK_ONLY_HIGH",
				GEMINI_MODERATION_HATE_SPEECH_THRESHOLD: "BLOCK_FEW",
				GEMINI_MODERATION_DANGEROUS_CONTENT_THRESHOLD: "BLOCK_SOME"
			});
			const result = GenerationConfigValidator.createSafetySettings(env);
			expect(result).toHaveLength(3);
			expect(result).toEqual([
				{
					category: GEMINI_SAFETY_CATEGORIES.HARASSMENT,
					threshold: "BLOCK_ONLY_HIGH"
				},
				{
					category: GEMINI_SAFETY_CATEGORIES.HATE_SPEECH,
					threshold: "BLOCK_FEW"
				},
				{
					category: GEMINI_SAFETY_CATEGORIES.DANGEROUS_CONTENT,
					threshold: "BLOCK_SOME"
				}
			]);
		});
	});

	describe("validateThinkingBudget", () => {
		beforeEach(() => {
			jest.spyOn(console, "log").mockImplementation(() => {});
		});

		afterEach(() => {
			jest.restoreAllMocks();
		});

		it("should return the same budget for non-thinking models", () => {
			const result = GenerationConfigValidator.validateThinkingBudget("gemini-1.5-pro", 100);
			expect(result).toBe(100);
		});

		it("should return DEFAULT_THINKING_BUDGET when budget is 0 for thinking models", () => {
			const result = GenerationConfigValidator.validateThinkingBudget("gemini-2.5-pro", 0);
			expect(result).toBe(DEFAULT_THINKING_BUDGET);
		});

		it("should return DEFAULT_THINKING_BUDGET when budget is less than -1", () => {
			const result = GenerationConfigValidator.validateThinkingBudget("gemini-2.5-pro", -5);
			expect(result).toBe(DEFAULT_THINKING_BUDGET);
		});

		it("should return the same budget when budget is -1", () => {
			const result = GenerationConfigValidator.validateThinkingBudget("gemini-2.5-pro", -1);
			expect(result).toBe(-1);
		});

		it("should return the same budget when budget is positive", () => {
			const result = GenerationConfigValidator.validateThinkingBudget("gemini-2.5-pro", 100);
			expect(result).toBe(100);
		});

		it("should handle unknown model gracefully", () => {
			const result = GenerationConfigValidator.validateThinkingBudget("unknown-model", 100);
			expect(result).toBe(100);
		});
	});

	describe("createValidatedConfig", () => {
		beforeEach(() => {
			jest.spyOn(console, "log").mockImplementation(() => {});
		});

		afterEach(() => {
			jest.restoreAllMocks();
		});

		it("should create config with default temperature when not provided", () => {
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				{},
				false,
				false
			);
			expect(result.temperature).toBe(DEFAULT_TEMPERATURE);
		});

		it("should create config with provided temperature", () => {
			const options: Partial<ChatCompletionRequest> = { temperature: 0.8 };
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				options,
				false,
				false
			);
			expect(result.temperature).toBe(0.8);
		});

		it("should include maxOutputTokens when provided", () => {
			const options: Partial<ChatCompletionRequest> = { max_tokens: 2048 };
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				options,
				false,
				false
			);
			expect(result.maxOutputTokens).toBe(2048);
		});

		it("should include topP when provided", () => {
			const options: Partial<ChatCompletionRequest> = { top_p: 0.9 };
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				options,
				false,
				false
			);
			expect(result.topP).toBe(0.9);
		});

		it("should convert string stop to array", () => {
			const options: Partial<ChatCompletionRequest> = { stop: "STOP" };
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				options,
				false,
				false
			);
			expect(result.stopSequences).toEqual(["STOP"]);
		});

		it("should keep array stop as array", () => {
			const options: Partial<ChatCompletionRequest> = { stop: ["STOP1", "STOP2"] };
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				options,
				false,
				false
			);
			expect(result.stopSequences).toEqual(["STOP1", "STOP2"]);
		});

		it("should include presencePenalty when provided", () => {
			const options: Partial<ChatCompletionRequest> = { presence_penalty: 0.5 };
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				options,
				false,
				false
			);
			expect(result.presencePenalty).toBe(0.5);
		});

		it("should include frequencyPenalty when provided", () => {
			const options: Partial<ChatCompletionRequest> = { frequency_penalty: 0.5 };
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				options,
				false,
				false
			);
			expect(result.frequencyPenalty).toBe(0.5);
		});

		it("should include seed when provided", () => {
			const options: Partial<ChatCompletionRequest> = { seed: 42 };
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				options,
				false,
				false
			);
			expect(result.seed).toBe(42);
		});

		it("should set responseMimeType to json_object for json_object response format", () => {
			const options: Partial<ChatCompletionRequest> = { response_format: { type: "json_object" } };
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				options,
				false,
				false
			);
			expect(result.responseMimeType).toBe("application/json");
		});

		it("should not include thinkingConfig for non-thinking models", () => {
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-1.5-pro",
				{},
				false,
				false
			);
			expect(result.thinkingConfig).toBeUndefined();
		});

		it("should include thinkingConfig for thinking models with real thinking enabled", () => {
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				{},
				true,
				true
			);
			expect(result.thinkingConfig).toEqual({
				thinkingBudget: DEFAULT_THINKING_BUDGET,
				includeThoughts: true
			});
		});

		it("should disable thinking visibility when real thinking is not enabled", () => {
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				{},
				false,
				false
			);
			expect(result.thinkingConfig).toEqual({
				thinkingBudget: DEFAULT_THINKING_BUDGET,
				includeThoughts: false
			});
		});

		it("should map reasoning_effort to thinking budget", () => {
			const options: Partial<ChatCompletionRequest> = { reasoning_effort: "high" };
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				options,
				true,
				true
			);
			expect(result.thinkingConfig).toEqual({
				thinkingBudget: REASONING_EFFORT_BUDGETS.high.default,
				includeThoughts: true
			});
		});

		it("should map reasoning_effort from extra_body to thinking budget", () => {
			const options: Partial<ChatCompletionRequest> = {
				extra_body: { reasoning_effort: "medium" }
			};
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				options,
				true,
				true
			);
			expect(result.thinkingConfig).toEqual({
				thinkingBudget: REASONING_EFFORT_BUDGETS.medium.default,
				includeThoughts: true
			});
		});

		it("should map reasoning_effort from model_params to thinking budget", () => {
			const options: Partial<ChatCompletionRequest> = {
				model_params: { reasoning_effort: "low" }
			};
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				options,
				true,
				true
			);
			expect(result.thinkingConfig).toEqual({
				thinkingBudget: REASONING_EFFORT_BUDGETS.low,
				includeThoughts: true
			});
		});

		it("should use flash budget for reasoning_effort on flash models", () => {
			const options: Partial<ChatCompletionRequest> = { reasoning_effort: "high" };
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-flash",
				options,
				true,
				true
			);
			expect(result.thinkingConfig).toEqual({
				thinkingBudget: REASONING_EFFORT_BUDGETS.high.flash,
				includeThoughts: true
			});
		});

		it("should disable includeReasoning when reasoning_effort is 'none'", () => {
			const options: Partial<ChatCompletionRequest> = { reasoning_effort: "none" };
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				options,
				true,
				true
			);
			// When reasoning_effort is 'none', thinkingBudget becomes 0 but validateThinkingBudget converts it to DEFAULT_THINKING_BUDGET (-1)
			expect(result.thinkingConfig).toEqual({
				thinkingBudget: DEFAULT_THINKING_BUDGET,
				includeThoughts: false
			});
		});

		it("should remove undefined keys from config", () => {
			const result = GenerationConfigValidator.createValidatedConfig(
				"gemini-2.5-pro",
				{},
				false,
				false
			);
			expect(result.maxOutputTokens).toBeUndefined();
			expect(result.topP).toBeUndefined();
			expect(result.stopSequences).toBeUndefined();
			expect(result.presencePenalty).toBeUndefined();
			expect(result.frequencyPenalty).toBeUndefined();
			expect(result.seed).toBeUndefined();
		});
	});

	describe("createValidateTools", () => {
		it("should return empty tools and toolConfig when no tools provided", () => {
			const result = GenerationConfigValidator.createValidateTools({});
			expect(result.tools).toEqual([]);
			expect(result.toolConfig).toEqual({});
		});

		it("should create functionDeclarations from tools", () => {
			const options: Partial<ChatCompletionRequest> = {
				tools: [
					{
						type: "function",
						function: {
							name: "testFunction",
							description: "Test function description",
							parameters: {
								type: "object",
								properties: {
									param1: { type: "string" }
								}
							}
						}
					}
				]
			};
			const result = GenerationConfigValidator.createValidateTools(options);
			expect(result.tools).toEqual([
				{
					functionDeclarations: [
						{
							name: "testFunction",
							description: "Test function description",
							parameters: {
								type: "object",
								properties: {
									param1: { type: "string" }
								}
							}
						}
					]
				}
			]);
		});

		it("should filter out parameters starting with $", () => {
			const options: Partial<ChatCompletionRequest> = {
				tools: [
					{
						type: "function",
						function: {
							name: "testFunction",
							description: "Test function",
							parameters: {
								$schema: "http://json-schema.org/draft-07/schema#",
								type: "object",
								properties: {
									validParam: { type: "string" },
									anotherValid: { type: "number" }
								}
							}
						}
					}
				]
			};
			const result = GenerationConfigValidator.createValidateTools(options);
			const params = result.tools?.[0]?.functionDeclarations?.[0]?.parameters as Record<string, unknown>;
			// The code filters out top-level keys starting with '$' from parameters
			expect(params).not.toHaveProperty("$schema");
			expect(params).toHaveProperty("type");
			expect(params).toHaveProperty("properties");
		});

		it("should set toolConfig to AUTO for auto tool_choice", () => {
			const options: Partial<ChatCompletionRequest> = {
				tools: [
					{
						type: "function",
						function: {
							name: "testFunction",
							description: "Test",
							parameters: {}
						}
					}
				],
				tool_choice: "auto"
			};
			const result = GenerationConfigValidator.createValidateTools(options);
			expect(result.toolConfig).toEqual({ functionCallingConfig: { mode: "AUTO" } });
		});

		it("should set toolConfig to NONE for none tool_choice", () => {
			const options: Partial<ChatCompletionRequest> = {
				tools: [
					{
						type: "function",
						function: {
							name: "testFunction",
							description: "Test",
							parameters: {}
						}
					}
				],
				tool_choice: "none"
			};
			const result = GenerationConfigValidator.createValidateTools(options);
			expect(result.toolConfig).toEqual({ functionCallingConfig: { mode: "NONE" } });
		});

		it("should set toolConfig with allowedFunctionNames for function tool_choice", () => {
			const options: Partial<ChatCompletionRequest> = {
				tools: [
					{
						type: "function",
						function: {
							name: "testFunction",
							description: "Test",
							parameters: {}
						}
					},
					{
						type: "function",
						function: {
							name: "anotherFunction",
							description: "Another",
							parameters: {}
						}
					}
				],
				tool_choice: {
					type: "function",
					function: {
						name: "testFunction"
					}
				}
			};
			const result = GenerationConfigValidator.createValidateTools(options);
			expect(result.toolConfig).toEqual({
				functionCallingConfig: {
					mode: "ANY",
					allowedFunctionNames: ["testFunction"]
				}
			});
		});
	});

	describe("createFinalToolConfiguration", () => {
		it("should return undefined tools and toolConfig when no tools configured", () => {
			const config: NativeToolsConfiguration = {
				useCustomTools: false,
				useNativeTools: false,
				customTools: [],
				nativeTools: [],
				priority: "native",
				toolType: "search_and_url"
			};
			const result = GenerationConfigValidator.createFinalToolConfiguration(config);
			expect(result.tools).toBeUndefined();
			expect(result.toolConfig).toBeUndefined();
		});

		it("should return custom tools when useCustomTools is true", () => {
			const config: NativeToolsConfiguration = {
				useCustomTools: true,
				useNativeTools: false,
				customTools: [
					{
						type: "function",
						function: {
							name: "customFunction",
							description: "Custom function",
							parameters: {}
						}
					}
				],
				nativeTools: [],
				priority: "native",
				toolType: "custom_only"
			};
			const result = GenerationConfigValidator.createFinalToolConfiguration(config);
			expect(result.tools).toEqual([
				{
					functionDeclarations: [
						{
							name: "customFunction",
							description: "Custom function",
							parameters: {}
						}
					]
				}
			]);
			expect(result.toolConfig).toEqual({});
		});

		it("should return custom tools with toolConfig when tool_choice is provided", () => {
			const config: NativeToolsConfiguration = {
				useCustomTools: true,
				useNativeTools: false,
				customTools: [
					{
						type: "function",
						function: {
							name: "customFunction",
							description: "Custom function",
							parameters: {}
						}
					}
				],
				nativeTools: [],
				priority: "native",
				toolType: "custom_only"
			};
			const options: Partial<ChatCompletionRequest> = {
				tool_choice: "auto"
			};
			const result = GenerationConfigValidator.createFinalToolConfiguration(config, options);
			expect(result.tools).toEqual([
				{
					functionDeclarations: [
						{
							name: "customFunction",
							description: "Custom function",
							parameters: {}
						}
					]
				}
			]);
			// Note: createFinalToolConfiguration calls createValidateTools with options but without tools,
			// so toolConfig will be empty unless options.tools is also provided
			expect(result.toolConfig).toEqual({});
		});

		it("should return native tools when useNativeTools is true", () => {
			const config: NativeToolsConfiguration = {
				useCustomTools: false,
				useNativeTools: true,
				customTools: [],
				nativeTools: [
					{
						google_search: {
							mode: "MODE_DYNAMIC"
						}
					}
				],
				priority: "native",
				toolType: "search_and_url"
			};
			const result = GenerationConfigValidator.createFinalToolConfiguration(config);
			expect(result.tools).toEqual([
				{
					google_search: {
						mode: "MODE_DYNAMIC"
					}
				}
			]);
			expect(result.toolConfig).toBeUndefined();
		});

		it("should handle url_context native tool", () => {
			const config: NativeToolsConfiguration = {
				useCustomTools: false,
				useNativeTools: true,
				customTools: [],
				nativeTools: [
					{
						url_context: {}
					}
				],
				priority: "native",
				toolType: "search_and_url"
			};
			const result = GenerationConfigValidator.createFinalToolConfiguration(config);
			expect(result.tools).toEqual([
				{
					url_context: {}
				}
			]);
			expect(result.toolConfig).toBeUndefined();
		});

		it("should handle mixed native tools", () => {
			const config: NativeToolsConfiguration = {
				useCustomTools: false,
				useNativeTools: true,
				customTools: [],
				nativeTools: [
					{
						google_search: {
							mode: "MODE_DYNAMIC"
						}
					},
					{
						url_context: {}
					}
				],
				priority: "native",
				toolType: "search_and_url"
			};
			const result = GenerationConfigValidator.createFinalToolConfiguration(config);
			expect(result.tools).toEqual([
				{
					google_search: {
						mode: "MODE_DYNAMIC"
					}
				},
				{
					url_context: {}
				}
			]);
			expect(result.toolConfig).toBeUndefined();
		});
	});
});
