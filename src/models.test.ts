/// <reference types="jest" />
/// <reference types="node" />

import { geminiCliModels, DEFAULT_MODEL, getModelInfo, getAllModelIds, isValidModel } from "./models";

describe("models", () => {
	describe("geminiCliModels", () => {
		it("should contain all expected models", () => {
			const expectedModels = [
				"gemini-3-pro-preview",
				"gemini-2.5-pro",
				"gemini-2.5-flash",
				"gemini-2.5-flash-lite"
			];
			expectedModels.forEach((modelId) => {
				expect(modelId in geminiCliModels).toBe(true);
			});
		});

		it("should have correct structure for each model", () => {
			Object.values(geminiCliModels).forEach((modelInfo) => {
				expect(modelInfo).toHaveProperty("maxTokens");
				expect(modelInfo).toHaveProperty("contextWindow");
				expect(modelInfo).toHaveProperty("supportsImages");
				expect(modelInfo).toHaveProperty("supportsPromptCache");
				expect(modelInfo).toHaveProperty("inputPrice");
				expect(modelInfo).toHaveProperty("outputPrice");
				expect(modelInfo).toHaveProperty("description");
				expect(modelInfo).toHaveProperty("thinking");
			});
		});

		it("should have correct maxTokens for all models", () => {
			Object.values(geminiCliModels).forEach((modelInfo) => {
				expect(modelInfo.maxTokens).toBe(65536);
			});
		});

		it("should have correct contextWindow for all models", () => {
			Object.values(geminiCliModels).forEach((modelInfo) => {
				expect(modelInfo.contextWindow).toBe(1_048_576);
			});
		});

		it("should have supportsImages set to true for all models", () => {
			Object.values(geminiCliModels).forEach((modelInfo) => {
				expect(modelInfo.supportsImages).toBe(true);
			});
		});

		it("should have supportsPromptCache set to false for all models", () => {
			Object.values(geminiCliModels).forEach((modelInfo) => {
				expect(modelInfo.supportsPromptCache).toBe(false);
			});
		});

		it("should have inputPrice set to 0 for all models", () => {
			Object.values(geminiCliModels).forEach((modelInfo) => {
				expect(modelInfo.inputPrice).toBe(0);
			});
		});

		it("should have outputPrice set to 0 for all models", () => {
			Object.values(geminiCliModels).forEach((modelInfo) => {
				expect(modelInfo.outputPrice).toBe(0);
			});
		});

		it("should have thinking set to true for all models", () => {
			Object.values(geminiCliModels).forEach((modelInfo) => {
				expect(modelInfo.thinking).toBe(true);
			});
		});

		it("should have non-empty descriptions for all models", () => {
			Object.values(geminiCliModels).forEach((modelInfo) => {
				expect(modelInfo.description).toBeDefined();
				expect(modelInfo.description.length).toBeGreaterThan(0);
			});
		});

		it("should have gemini-3-pro-preview with correct description", () => {
			expect(geminiCliModels["gemini-3-pro-preview"].description).toContain("Gemini 3.0 Pro Preview");
		});

		it("should have gemini-2.5-pro with correct description", () => {
			expect(geminiCliModels["gemini-2.5-pro"].description).toContain("Gemini 2.5 Pro");
		});

		it("should have gemini-2.5-flash with correct description", () => {
			expect(geminiCliModels["gemini-2.5-flash"].description).toContain("Gemini 2.5 Flash");
		});

		it("should have gemini-2.5-flash-lite with correct description", () => {
			expect(geminiCliModels["gemini-2.5-flash-lite"].description).toContain("Gemini 2.5 Flash Lite");
		});
	});

	describe("DEFAULT_MODEL", () => {
		it("should be set to gemini-2.5-flash", () => {
			expect(DEFAULT_MODEL).toBe("gemini-2.5-flash");
		});

		it("should exist in geminiCliModels", () => {
			expect(DEFAULT_MODEL in geminiCliModels).toBe(true);
		});
	});

	describe("getModelInfo", () => {
		it("should return ModelInfo for valid model id", () => {
			const result = getModelInfo("gemini-2.5-flash");
			expect(result).not.toBeNull();
			expect(result).toEqual(geminiCliModels["gemini-2.5-flash"]);
		});

		it("should return null for invalid model id", () => {
			const result = getModelInfo("invalid-model");
			expect(result).toBeNull();
		});

		it("should return null for empty string", () => {
			const result = getModelInfo("");
			expect(result).toBeNull();
		});

		it("should return correct info for gemini-3-pro-preview", () => {
			const result = getModelInfo("gemini-3-pro-preview");
			expect(result).toEqual(geminiCliModels["gemini-3-pro-preview"]);
		});

		it("should return correct info for gemini-2.5-pro", () => {
			const result = getModelInfo("gemini-2.5-pro");
			expect(result).toEqual(geminiCliModels["gemini-2.5-pro"]);
		});

		it("should return correct info for gemini-2.5-flash-lite", () => {
			const result = getModelInfo("gemini-2.5-flash-lite");
			expect(result).toEqual(geminiCliModels["gemini-2.5-flash-lite"]);
		});
	});

	describe("getAllModelIds", () => {
		it("should return an array of model ids", () => {
			const result = getAllModelIds();
			expect(Array.isArray(result)).toBe(true);
		});

		it("should return all model keys from geminiCliModels", () => {
			const result = getAllModelIds();
			const expectedKeys = Object.keys(geminiCliModels);
			expect(result).toHaveLength(expectedKeys.length);
			expectedKeys.forEach((key) => {
				expect(result).toContain(key);
			});
		});

		it("should contain exactly 4 models", () => {
			const result = getAllModelIds();
			expect(result).toHaveLength(4);
		});
	});

	describe("isValidModel", () => {
		it("should return true for gemini-3-pro-preview", () => {
			expect(isValidModel("gemini-3-pro-preview")).toBe(true);
		});

		it("should return true for gemini-2.5-pro", () => {
			expect(isValidModel("gemini-2.5-pro")).toBe(true);
		});

		it("should return true for gemini-2.5-flash", () => {
			expect(isValidModel("gemini-2.5-flash")).toBe(true);
		});

		it("should return true for gemini-2.5-flash-lite", () => {
			expect(isValidModel("gemini-2.5-flash-lite")).toBe(true);
		});

		it("should return false for invalid model id", () => {
			expect(isValidModel("invalid-model")).toBe(false);
		});

		it("should return false for empty string", () => {
			expect(isValidModel("")).toBe(false);
		});

		it("should return false for partial model name", () => {
			expect(isValidModel("gemini")).toBe(false);
			expect(isValidModel("gemini-2.5")).toBe(false);
		});

		it("should return false for model name with extra characters", () => {
			expect(isValidModel("gemini-2.5-flash-extra")).toBe(false);
		});

		it("should be case sensitive", () => {
			expect(isValidModel("Gemini-2.5-Flash")).toBe(false);
			expect(isValidModel("GEMINI-2.5-FLASH")).toBe(false);
		});
	});
});
