import { geminiCliModels } from "../models";
import { DEFAULT_THINKING_BUDGET } from "../constants";
import { ChatCompletionRequest } from "../types";

/**
 * Helper class to validate and correct generation configurations for different Gemini models.
 * Handles model-specific limitations and provides sensible defaults.
 */
export class GenerationConfigValidator {
	/**
	 * Validates and corrects the thinking budget for a specific model.
	 * @param modelId - The Gemini model ID
	 * @param thinkingBudget - The requested thinking budget
	 * @returns The corrected thinking budget
	 */
	static validateThinkingBudget(modelId: string, thinkingBudget: number): number {
		const modelInfo = geminiCliModels[modelId];

		// For thinking models, validate the budget
		if (modelInfo?.thinking) {
			// Gemini 2.5 Pro and Flash don't support thinking_budget: 0
			// They require -1 (dynamic allocation) or positive numbers
			if (thinkingBudget === 0) {
				console.log(`[GenerationConfig] Model '${modelId}' doesn't support thinking_budget: 0, using -1 instead`);
				return DEFAULT_THINKING_BUDGET; // -1
			}

			// Validate positive budget values (optional: add upper limits if needed)
			if (thinkingBudget < -1) {
				console.log(
					`[GenerationConfig] Invalid thinking_budget: ${thinkingBudget} for model '${modelId}', using -1 instead`
				);
				return DEFAULT_THINKING_BUDGET; // -1
			}
		}

		return thinkingBudget;
	}

	/**
	 * Creates a validated generation config for a specific model.
	 * @param modelId - The Gemini model ID
	 * @param options - Generation options including thinking budget
	 * @param isRealThinkingEnabled - Whether real thinking is enabled
	 * @param includeReasoning - Whether to include reasoning in response
	 * @returns Validated generation configuration
	 */
	static createValidatedConfig(
		modelId: string,
		options: Partial<ChatCompletionRequest> = {},
		isRealThinkingEnabled: boolean,
		includeReasoning: boolean
	): Record<string, unknown> {
		const generationConfig: Record<string, unknown> = {
			temperature: options.temperature,
			maxOutputTokens: options.max_tokens,
			topP: options.top_p,
			stopSequences: typeof options.stop === "string" ? [options.stop] : options.stop,
			presencePenalty: options.presence_penalty,
			frequencyPenalty: options.frequency_penalty,
			seed: options.seed
		};

		if (options.response_format?.type === "json_object") {
			generationConfig.responseMimeType = "application/json";
		}

		const modelInfo = geminiCliModels[modelId];
		const isThinkingModel = modelInfo?.thinking || false;

		if (isThinkingModel) {
			const requestedBudget = options.thinkingBudget ?? DEFAULT_THINKING_BUDGET;
			const validatedBudget = this.validateThinkingBudget(modelId, requestedBudget);

			if (isRealThinkingEnabled && includeReasoning) {
				// Enable thinking with validated budget
				generationConfig.thinkingConfig = {
					thinkingBudget: validatedBudget,
					includeThoughts: true // Critical: This enables thinking content in response
				};
				console.log(`[GenerationConfig] Real thinking enabled for '${modelId}' with budget: ${validatedBudget}`);
			} else {
				// For thinking models, always use validated budget (can't use 0)
				// Control thinking visibility with includeThoughts instead
				generationConfig.thinkingConfig = {
					thinkingBudget: this.validateThinkingBudget(modelId, DEFAULT_THINKING_BUDGET),
					includeThoughts: false // Disable thinking visibility in response
				};
			}
		}

		// Remove undefined keys
		Object.keys(generationConfig).forEach((key) => generationConfig[key] === undefined && delete generationConfig[key]);

		return generationConfig;
	}
}
