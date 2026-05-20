/// <reference types="jest" />

import {
	validateImageUrl,
	parseDataUrl,
	modelSupportsImages,
	estimateImageTokens,
	type ImageValidationResult,
	type DataUrlComponents,
	type ModelRegistry
} from "./image-utils";

describe("image-utils", () => {
	describe("validateImageUrl", () => {
		it("should return error when imageUrl is empty", () => {
			const result = validateImageUrl("");
			expect(result).toEqual({ isValid: false, error: "Image URL is required" });
		});

		it("should return error when imageUrl is null/undefined", () => {
			expect(validateImageUrl(null as unknown as string)).toEqual({
				isValid: false,
				error: "Image URL is required"
			});
			expect(validateImageUrl(undefined as unknown as string)).toEqual({
				isValid: false,
				error: "Image URL is required"
			});
		});

		it("should validate a valid base64 jpeg image", () => {
			const base64Jpeg = "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
			const result = validateImageUrl(base64Jpeg);
			expect(result.isValid).toBe(true);
			expect(result.mimeType).toBe("image/jpeg");
			expect(result.format).toBe("jpeg");
		});

		it("should validate a valid base64 png image", () => {
			const base64Png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
			const result = validateImageUrl(base64Png);
			expect(result.isValid).toBe(true);
			expect(result.mimeType).toBe("image/png");
			expect(result.format).toBe("png");
		});

		it("should validate a valid base64 gif image", () => {
			const base64Gif = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
			const result = validateImageUrl(base64Gif);
			expect(result.isValid).toBe(true);
			expect(result.mimeType).toBe("image/gif");
			expect(result.format).toBe("gif");
		});

		it("should validate a valid base64 webp image", () => {
			const base64Webp = "data:image/webp;base64,UklGRlIAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAREYiI/gcA";
			const result = validateImageUrl(base64Webp);
			expect(result.isValid).toBe(true);
			expect(result.mimeType).toBe("image/webp");
			expect(result.format).toBe("webp");
		});

		it("should reject unsupported image format", () => {
			const base64Bmp = "data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABAAAAAAAYAAAAAA";
			const result = validateImageUrl(base64Bmp);
			expect(result.isValid).toBe(false);
			expect(result.error).toContain("Unsupported image format: bmp");
		});

		it("should reject invalid base64 encoding", () => {
			const invalidBase64 = "data:image/png;base64,!!!invalid!!!";
			const result = validateImageUrl(invalidBase64);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe("Invalid base64 encoding");
		});

		it("should reject missing base64 data", () => {
			const missingData = "data:image/png;base64,";
			const result = validateImageUrl(missingData);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe("Invalid base64 image format");
		});

		it("should validate a valid http URL", () => {
			const httpUrl = "http://example.com/image.jpg";
			const result = validateImageUrl(httpUrl);
			expect(result.isValid).toBe(true);
			expect(result.mimeType).toBe("image/jpeg");
		});

		it("should validate a valid https URL", () => {
			const httpsUrl = "https://example.com/image.png";
			const result = validateImageUrl(httpsUrl);
			expect(result.isValid).toBe(true);
			expect(result.mimeType).toBe("image/jpeg");
		});

		it("should reject invalid URL format", () => {
			const invalidUrl = "not-a-valid-url";
			const result = validateImageUrl(invalidUrl);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe("Image URL must be a base64 data URL or HTTP/HTTPS URL");
		});

		it("should reject malformed http URL", () => {
			const malformedUrl = "http://";
			const result = validateImageUrl(malformedUrl);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe("Invalid URL format");
		});
	});

	describe("parseDataUrl", () => {
		it("should parse a valid data URL", () => {
			const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
			const result = parseDataUrl(dataUrl);
			expect(result).toEqual({
				mimeType: "image/png",
				data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
			});
		});

		it("should parse a data URL with jpeg format", () => {
			const dataUrl = "data:image/jpeg;base64,ABC123";
			const result = parseDataUrl(dataUrl);
			expect(result).toEqual({
				mimeType: "image/jpeg",
				data: "ABC123"
			});
		});

		it("should return null for non-data URL", () => {
			const notDataUrl = "https://example.com/image.png";
			const result = parseDataUrl(notDataUrl);
			expect(result).toBeNull();
		});

		it("should return null for empty string", () => {
			const result = parseDataUrl("");
			expect(result).toBeNull();
		});

		it("should return null for string not starting with data:", () => {
			const result = parseDataUrl("image/png;base64,ABC123");
			expect(result).toBeNull();
		});
	});

	describe("modelSupportsImages", () => {
		const mockModels: ModelRegistry = {
			"model-with-images": { supportsImages: true },
			"model-without-images": { supportsImages: false },
			"model-no-info": {}
		};

		it("should return true when model supports images", () => {
			const result = modelSupportsImages("model-with-images", mockModels);
			expect(result).toBe(true);
		});

		it("should return false when model does not support images", () => {
			const result = modelSupportsImages("model-without-images", mockModels);
			expect(result).toBe(false);
		});

		it("should return false when model has no info", () => {
			const result = modelSupportsImages("model-no-info", mockModels);
			expect(result).toBe(false);
		});

		it("should return false when model does not exist", () => {
			const result = modelSupportsImages("non-existent-model", mockModels);
			expect(result).toBe(false);
		});

		it("should return false when models registry is empty", () => {
			const result = modelSupportsImages("any-model", {});
			expect(result).toBe(false);
		});
	});

	describe("estimateImageTokens", () => {
		it("should return 85 tokens for low detail", () => {
			const result = estimateImageTokens("data:image/png;base64,ABC", "low");
			expect(result).toBe(85);
		});

		it("should estimate tokens for small base64 image (high detail)", () => {
			const smallImage = "data:image/png;base64,ABC";
			const result = estimateImageTokens(smallImage, "high");
			expect(result).toBe(170);
		});

		it("should estimate tokens for medium base64 image (high detail)", () => {
			// Create a base64 string that results in size between 100KB and 500KB
			const mediumSize = 150 * 1024 * 4 / 3; // ~150KB in base64 length
			const base64Data = "A".repeat(mediumSize);
			const mediumImage = `data:image/png;base64,${base64Data}`;
			const result = estimateImageTokens(mediumImage, "high");
			expect(result).toBe(340);
		});

		it("should estimate tokens for large base64 image (high detail)", () => {
			// Create a base64 string that results in size > 500KB
			const largeSize = 600 * 1024 * 4 / 3; // ~600KB in base64 length
			const base64Data = "A".repeat(largeSize);
			const largeImage = `data:image/png;base64,${base64Data}`;
			const result = estimateImageTokens(largeImage, "high");
			expect(result).toBe(680);
		});

		it("should use auto detail (defaults to high detail estimation)", () => {
			const smallImage = "data:image/png;base64,ABC";
			const result = estimateImageTokens(smallImage, "auto");
			expect(result).toBe(170);
		});

		it("should return default estimate for URL images", () => {
			const urlImage = "https://example.com/image.png";
			const result = estimateImageTokens(urlImage, "high");
			expect(result).toBe(340);
		});

		it("should return default estimate for URL images with auto detail", () => {
			const urlImage = "https://example.com/image.png";
			const result = estimateImageTokens(urlImage, "auto");
			expect(result).toBe(340);
		});

		it("should return default estimate for URL images with low detail", () => {
			const urlImage = "https://example.com/image.png";
			const result = estimateImageTokens(urlImage, "low");
			expect(result).toBe(85);
		});
	});
});
