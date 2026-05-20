/// <reference types="jest" />

import {
  CODE_ASSIST_ENDPOINT,
  CODE_ASSIST_API_VERSION,
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_REFRESH_URL,
  TOKEN_BUFFER_TIME,
  KV_TOKEN_KEY,
  OPENAI_CHAT_COMPLETION_OBJECT,
  OPENAI_MODEL_OWNER,
} from "./config";

describe("config", () => {
  describe("Google Code Assist API Constants", () => {
    it("CODE_ASSIST_ENDPOINT should be the correct URL", () => {
      expect(CODE_ASSIST_ENDPOINT).toBe("https://cloudcode-pa.googleapis.com");
    });

    it("CODE_ASSIST_API_VERSION should be v1internal", () => {
      expect(CODE_ASSIST_API_VERSION).toBe("v1internal");
    });
  });

  describe("OAuth2 Configuration", () => {
    it("OAUTH_CLIENT_ID should be the correct client ID", () => {
      expect(OAUTH_CLIENT_ID).toBe(
        "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com"
      );
    });

    it("OAUTH_CLIENT_SECRET should be the correct client secret", () => {
      expect(OAUTH_CLIENT_SECRET).toBe("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");
    });

    it("OAUTH_REFRESH_URL should be the correct token URL", () => {
      expect(OAUTH_REFRESH_URL).toBe("https://oauth2.googleapis.com/token");
    });
  });

  describe("Token Management", () => {
    it("TOKEN_BUFFER_TIME should be 5 minutes in milliseconds", () => {
      expect(TOKEN_BUFFER_TIME).toBe(5 * 60 * 1000);
    });

    it("KV_TOKEN_KEY should be oauth_token_cache", () => {
      expect(KV_TOKEN_KEY).toBe("oauth_token_cache");
    });
  });

  describe("OpenAI API Constants", () => {
    it("OPENAI_CHAT_COMPLETION_OBJECT should be chat.completion.chunk", () => {
      expect(OPENAI_CHAT_COMPLETION_OBJECT).toBe("chat.completion.chunk");
    });

    it("OPENAI_MODEL_OWNER should be google-gemini-cli", () => {
      expect(OPENAI_MODEL_OWNER).toBe("google-gemini-cli");
    });
  });

  describe("Type checks", () => {
    it("CODE_ASSIST_ENDPOINT should be a string", () => {
      expect(typeof CODE_ASSIST_ENDPOINT).toBe("string");
    });

    it("CODE_ASSIST_API_VERSION should be a string", () => {
      expect(typeof CODE_ASSIST_API_VERSION).toBe("string");
    });

    it("OAUTH_CLIENT_ID should be a string", () => {
      expect(typeof OAUTH_CLIENT_ID).toBe("string");
    });

    it("OAUTH_CLIENT_SECRET should be a string", () => {
      expect(typeof OAUTH_CLIENT_SECRET).toBe("string");
    });

    it("OAUTH_REFRESH_URL should be a string", () => {
      expect(typeof OAUTH_REFRESH_URL).toBe("string");
    });

    it("TOKEN_BUFFER_TIME should be a number", () => {
      expect(typeof TOKEN_BUFFER_TIME).toBe("number");
    });

    it("KV_TOKEN_KEY should be a string", () => {
      expect(typeof KV_TOKEN_KEY).toBe("string");
    });

    it("OPENAI_CHAT_COMPLETION_OBJECT should be a string", () => {
      expect(typeof OPENAI_CHAT_COMPLETION_OBJECT).toBe("string");
    });

    it("OPENAI_MODEL_OWNER should be a string", () => {
      expect(typeof OPENAI_MODEL_OWNER).toBe("string");
    });
  });
});
