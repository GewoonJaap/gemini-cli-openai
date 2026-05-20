/// <reference types="jest" />

import {
	REASONING_MESSAGES,
	REASONING_CHUNK_DELAY,
	THINKING_CONTENT_CHUNK_SIZE,
	DEFAULT_THINKING_BUDGET,
	DISABLED_THINKING_BUDGET,
	DEFAULT_TEMPERATURE,
	AUTO_SWITCH_MODEL_MAP,
	RATE_LIMIT_STATUS_CODES,
	REASONING_EFFORT_BUDGETS,
	GEMINI_SAFETY_CATEGORIES,
	NATIVE_TOOLS_DEFAULTS
} from "./constants";

describe("constants", () => {
	describe("REASONING_MESSAGES", () => {
		it("should be an array", () => {
			expect(Array.isArray(REASONING_MESSAGES)).toBe(true);
		});

		it("should contain 5 messages", () => {
			expect(REASONING_MESSAGES).toHaveLength(5);
		});

		it("should contain messages with emojis", () => {
			expect(REASONING_MESSAGES[0]).toContain("🔍");
			expect(REASONING_MESSAGES[1]).toContain("🤔");
			expect(REASONING_MESSAGES[2]).toContain("💭");
			expect(REASONING_MESSAGES[3]).toContain("🎯");
			expect(REASONING_MESSAGES[4]).toContain("✨");
		});

		it("should contain string messages", () => {
			REASONING_MESSAGES.forEach((msg) => {
				expect(typeof msg).toBe("string");
			});
		});
	});

	describe("REASONING_CHUNK_DELAY", () => {
		it("should be 100", () => {
			expect(REASONING_CHUNK_DELAY).toBe(100);
		});

		it("should be a number", () => {
			expect(typeof REASONING_CHUNK_DELAY).toBe("number");
		});
	});

	describe("THINKING_CONTENT_CHUNK_SIZE", () => {
		it("should be 15", () => {
			expect(THINKING_CONTENT_CHUNK_SIZE).toBe(15);
		});

		it("should be a number", () => {
			expect(typeof THINKING_CONTENT_CHUNK_SIZE).toBe("number");
		});
	});

	describe("DEFAULT_THINKING_BUDGET", () => {
		it("should be -1", () => {
			expect(DEFAULT_THINKING_BUDGET).toBe(-1);
		});

		it("should be a number", () => {
			expect(typeof DEFAULT_THINKING_BUDGET).toBe("number");
		});
	});

	describe("DISABLED_THINKING_BUDGET", () => {
		it("should be 0", () => {
			expect(DISABLED_THINKING_BUDGET).toBe(0);
		});

		it("should be a number", () => {
			expect(typeof DISABLED_THINKING_BUDGET).toBe("number");
		});
	});

	describe("DEFAULT_TEMPERATURE", () => {
		it("should be 0.7", () => {
			expect(DEFAULT_TEMPERATURE).toBe(0.7);
		});

		it("should be a number", () => {
			expect(typeof DEFAULT_TEMPERATURE).toBe("number");
		});
	});

	describe("AUTO_SWITCH_MODEL_MAP", () => {
		it("should be an object", () => {
			expect(typeof AUTO_SWITCH_MODEL_MAP).toBe("object");
		});

		it("should have gemini-2.5-pro key", () => {
			expect("gemini-2.5-pro" in AUTO_SWITCH_MODEL_MAP).toBe(true);
		});

		it("should map gemini-2.5-pro to gemini-2.5-flash", () => {
			expect(AUTO_SWITCH_MODEL_MAP["gemini-2.5-pro"]).toBe("gemini-2.5-flash");
		});
	});

	describe("RATE_LIMIT_STATUS_CODES", () => {
		it("should be an array", () => {
			expect(Array.isArray(RATE_LIMIT_STATUS_CODES)).toBe(true);
		});

		it("should contain 429 and 503", () => {
			expect(RATE_LIMIT_STATUS_CODES).toEqual([429, 503]);
		});

		it("should have length of 2", () => {
			expect(RATE_LIMIT_STATUS_CODES).toHaveLength(2);
		});
	});

	describe("REASONING_EFFORT_BUDGETS", () => {
		it("should be an object", () => {
			expect(typeof REASONING_EFFORT_BUDGETS).toBe("object");
		});

		it("should have none, low, medium, high keys", () => {
			expect(REASONING_EFFORT_BUDGETS).toHaveProperty("none");
			expect(REASONING_EFFORT_BUDGETS).toHaveProperty("low");
			expect(REASONING_EFFORT_BUDGETS).toHaveProperty("medium");
			expect(REASONING_EFFORT_BUDGETS).toHaveProperty("high");
		});

		it("should have none value of 0", () => {
			expect(REASONING_EFFORT_BUDGETS.none).toBe(0);
		});

		it("should have low value of 1024", () => {
			expect(REASONING_EFFORT_BUDGETS.low).toBe(1024);
		});

		it("should have medium with flash and default keys", () => {
			expect(REASONING_EFFORT_BUDGETS.medium).toHaveProperty("flash");
			expect(REASONING_EFFORT_BUDGETS.medium).toHaveProperty("default");
		});

		it("should have medium.flash value of 12288", () => {
			expect(REASONING_EFFORT_BUDGETS.medium.flash).toBe(12288);
		});

		it("should have medium.default value of 16384", () => {
			expect(REASONING_EFFORT_BUDGETS.medium.default).toBe(16384);
		});

		it("should have high with flash and default keys", () => {
			expect(REASONING_EFFORT_BUDGETS.high).toHaveProperty("flash");
			expect(REASONING_EFFORT_BUDGETS.high).toHaveProperty("default");
		});

		it("should have high.flash value of 24576", () => {
			expect(REASONING_EFFORT_BUDGETS.high.flash).toBe(24576);
		});

		it("should have high.default value of 32768", () => {
			expect(REASONING_EFFORT_BUDGETS.high.default).toBe(32768);
		});
	});

	describe("GEMINI_SAFETY_CATEGORIES", () => {
		it("should be an object", () => {
			expect(typeof GEMINI_SAFETY_CATEGORIES).toBe("object");
		});

		it("should have HARASSMENT, HATE_SPEECH, SEXUALLY_EXPLICIT, DANGEROUS_CONTENT keys", () => {
			expect(GEMINI_SAFETY_CATEGORIES).toHaveProperty("HARASSMENT");
			expect(GEMINI_SAFETY_CATEGORIES).toHaveProperty("HATE_SPEECH");
			expect(GEMINI_SAFETY_CATEGORIES).toHaveProperty("SEXUALLY_EXPLICIT");
			expect(GEMINI_SAFETY_CATEGORIES).toHaveProperty("DANGEROUS_CONTENT");
		});

		it("should have correct HARASSMENT value", () => {
			expect(GEMINI_SAFETY_CATEGORIES.HARASSMENT).toBe("HARM_CATEGORY_HARASSMENT");
		});

		it("should have correct HATE_SPEECH value", () => {
			expect(GEMINI_SAFETY_CATEGORIES.HATE_SPEECH).toBe("HARM_CATEGORY_HATE_SPEECH");
		});

		it("should have correct SEXUALLY_EXPLICIT value", () => {
			expect(GEMINI_SAFETY_CATEGORIES.SEXUALLY_EXPLICIT).toBe("HARM_CATEGORY_SEXUALLY_EXPLICIT");
		});

		it("should have correct DANGEROUS_CONTENT value", () => {
			expect(GEMINI_SAFETY_CATEGORIES.DANGEROUS_CONTENT).toBe("HARM_CATEGORY_DANGEROUS_CONTENT");
		});
	});

	describe("NATIVE_TOOLS_DEFAULTS", () => {
		it("should be an object", () => {
			expect(typeof NATIVE_TOOLS_DEFAULTS).toBe("object");
		});

		it("should have all expected keys", () => {
			expect(NATIVE_TOOLS_DEFAULTS).toHaveProperty("ENABLE_GEMINI_NATIVE_TOOLS");
			expect(NATIVE_TOOLS_DEFAULTS).toHaveProperty("ENABLE_GOOGLE_SEARCH");
			expect(NATIVE_TOOLS_DEFAULTS).toHaveProperty("ENABLE_URL_CONTEXT");
			expect(NATIVE_TOOLS_DEFAULTS).toHaveProperty("GEMINI_TOOLS_PRIORITY");
			expect(NATIVE_TOOLS_DEFAULTS).toHaveProperty("DEFAULT_TO_NATIVE_TOOLS");
			expect(NATIVE_TOOLS_DEFAULTS).toHaveProperty("ALLOW_REQUEST_TOOL_CONTROL");
			expect(NATIVE_TOOLS_DEFAULTS).toHaveProperty("ENABLE_INLINE_CITATIONS");
			expect(NATIVE_TOOLS_DEFAULTS).toHaveProperty("INCLUDE_GROUNDING_METADATA");
			expect(NATIVE_TOOLS_DEFAULTS).toHaveProperty("INCLUDE_SEARCH_ENTRY_POINT");
		});

		it("should have ENABLE_GEMINI_NATIVE_TOOLS as false", () => {
			expect(NATIVE_TOOLS_DEFAULTS.ENABLE_GEMINI_NATIVE_TOOLS).toBe(false);
		});

		it("should have ENABLE_GOOGLE_SEARCH as false", () => {
			expect(NATIVE_TOOLS_DEFAULTS.ENABLE_GOOGLE_SEARCH).toBe(false);
		});

		it("should have ENABLE_URL_CONTEXT as false", () => {
			expect(NATIVE_TOOLS_DEFAULTS.ENABLE_URL_CONTEXT).toBe(false);
		});

		it("should have GEMINI_TOOLS_PRIORITY as 'native_first'", () => {
			expect(NATIVE_TOOLS_DEFAULTS.GEMINI_TOOLS_PRIORITY).toBe("native_first");
		});

		it("should have DEFAULT_TO_NATIVE_TOOLS as true", () => {
			expect(NATIVE_TOOLS_DEFAULTS.DEFAULT_TO_NATIVE_TOOLS).toBe(true);
		});

		it("should have ALLOW_REQUEST_TOOL_CONTROL as true", () => {
			expect(NATIVE_TOOLS_DEFAULTS.ALLOW_REQUEST_TOOL_CONTROL).toBe(true);
		});

		it("should have ENABLE_INLINE_CITATIONS as false", () => {
			expect(NATIVE_TOOLS_DEFAULTS.ENABLE_INLINE_CITATIONS).toBe(false);
		});

		it("should have INCLUDE_GROUNDING_METADATA as true", () => {
			expect(NATIVE_TOOLS_DEFAULTS.INCLUDE_GROUNDING_METADATA).toBe(true);
		});

		it("should have INCLUDE_SEARCH_ENTRY_POINT as false", () => {
			expect(NATIVE_TOOLS_DEFAULTS.INCLUDE_SEARCH_ENTRY_POINT).toBe(false);
		});
	});
});
