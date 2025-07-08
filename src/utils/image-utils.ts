/**
 * Utility functions for image processing and validation
 */

export interface ImageValidationResult {
	isValid: boolean;
	error?: string;
	mimeType?: string;
	format?: string;
}

export interface DataUrlComponents {
	mimeType: string;
	data: string;
}

export interface ModelInfo {
	supportsImages?: boolean;
}

export type ModelRegistry = Record<string, ModelInfo>;

/**
 * Validates an image URL or base64 data URL
 */
export function validateImageUrl(imageUrl: string): ImageValidationResult {
	if (!imageUrl) {
		return { isValid: false, error: "Image URL is required" };
	}

	if (imageUrl.startsWith("data:image/")) {
		// Validate base64 image
		const [mimeTypePart, base64Part] = imageUrl.split(",");

		if (!base64Part) {
			return { isValid: false, error: "Invalid base64 image format" };
		}

		const mimeType = mimeTypePart.split(":")[1].split(";")[0];
		const format = mimeType.split("/")[1];

		const supportedFormats = ["jpeg", "jpg", "png", "gif", "webp"];
		if (!supportedFormats.includes(format.toLowerCase())) {
			return {
				isValid: false,
				error: `Unsupported image format: ${format}. Supported formats: ${supportedFormats.join(", ")}`
			};
		}

		// Basic base64 validation
		try {
			atob(base64Part.substring(0, 100)); // Test a small portion
		} catch {
			return { isValid: false, error: "Invalid base64 encoding" };
		}

		return { isValid: true, mimeType, format };
	}

	if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
		// Basic URL validation
		try {
			new URL(imageUrl);
			return { isValid: true, mimeType: "image/jpeg" }; // Default assumption for URLs
		} catch {
			return { isValid: false, error: "Invalid URL format" };
		}
	}

	return { isValid: false, error: "Image URL must be a base64 data URL or HTTP/HTTPS URL" };
}

/**
 * Extracts image information from a data URL
 */
export function parseDataUrl(dataUrl: string): DataUrlComponents | null {
	if (!dataUrl.startsWith("data:")) {
		return null;
	}

	const [mimeTypePart, data] = dataUrl.split(",");
	const mimeType = mimeTypePart.split(":")[1].split(";")[0];

	return { mimeType, data };
}

/**
 * Validates if a model supports image inputs
 */
export function modelSupportsImages(modelId: string, models: ModelRegistry): boolean {
	return models[modelId]?.supportsImages || false;
}

/**
 * Estimates the token count for an image (rough approximation)
 * This is a simplified estimation - actual token usage may vary
 */
export function estimateImageTokens(imageUrl: string, detail: "low" | "high" | "auto" = "auto"): number {
	if (detail === "low") {
		return 85; // Low detail images use a fixed token count
	}

	// For high detail, estimate based on image size (simplified)
	// In practice, this would require analyzing actual image dimensions
	if (imageUrl.startsWith("data:")) {
		const base64Data = imageUrl.split(",")[1];
		const sizeKB = (base64Data.length * 3) / 4 / 1024; // Rough base64 to bytes conversion

		// Rough estimation: ~170 tokens per 512x512 tile
		if (sizeKB < 100) return 170; // Small image
		if (sizeKB < 500) return 340; // Medium image
		return 680; // Large image
	}

	return 340; // Default estimate for URL images
}
