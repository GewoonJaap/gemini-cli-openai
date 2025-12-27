import { geminiCliModels, getAllModelIds } from "../models";
import { ModelInfo, MessageContent } from "../types";
import { validateImageUrl } from "./image-utils";
import { validatePdfBase64 } from "./pdf-utils";

/**
 * Checks if a given model supports a specific media type.
 *
 * @param modelId The ID of the model to check.
 * @param supportKey The key representing the media type support in ModelInfo.
 * @returns True if the model supports the media type, false otherwise.
 */
export function isMediaTypeSupported(modelId: string, supportKey: keyof ModelInfo): boolean {
	return !!geminiCliModels[modelId]?.[supportKey];
}

/**
 * Validates if a model exists.
 *
 * @param modelId The ID of the model to check.
 * @returns An object with an `isValid` boolean and an optional `error` message.
 */
export function validateModel(modelId: string): { isValid: boolean; error?: string } {
	if (!(modelId in geminiCliModels)) {
		return {
			isValid: false,
			error: `Model '${modelId}' not found. Available models: ${getAllModelIds().join(", ")}`
		};
	}
	return { isValid: true };
}

/**
 * Validates the content of a given media type.
 *
 * @param type The type of the content to validate.
 * @param content The message content object to validate.
 * @returns An object with an `isValid` boolean and an optional `error` message.
 */
export function validateContent(
	type: string,
	content: MessageContent
): { isValid: boolean; error?: string; mimeType?: string } {
	switch (type) {
		case "image_url":
			// Extract URL from content object
			const imageUrl = content.image_url?.url;
			if (!imageUrl) {
				return { isValid: false, error: "Missing image URL." };
			}
			const validation = validateImageUrl(imageUrl);
			if (!validation.isValid) {
				return { isValid: false, error: "Invalid image URL or format." };
			}
			return { isValid: true, mimeType: validation.mimeType };

		case "input_pdf":
			// Extract PDF data from content object
			const pdfData = content.input_pdf?.data;
			if (!pdfData) {
				return { isValid: false, error: "Missing PDF data." };
			}
			if (!validatePdfBase64(pdfData)) {
				return { isValid: false, error: "Invalid PDF data. Please ensure the content is a valid base64 encoded PDF." };
			}
			return { isValid: true };

		default:
			return { isValid: true }; // No specific validation for this type
	}
}
