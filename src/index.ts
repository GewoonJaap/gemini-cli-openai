import { Hono } from "hono";
import { Env } from "./types";
import { OpenAIRoute } from "./routes/openai";
import { DebugRoute } from "./routes/debug";
import { openAIApiKeyAuth } from "./middlewares/auth";
import { loggingMiddleware } from "./middlewares/logging";

/**
 * Gemini CLI OpenAI Worker
 *
 * A Cloudflare Worker that provides OpenAI-compatible API endpoints
 * for Google's Gemini models via the Gemini CLI OAuth flow.
 *
 * Features:
 * - OpenAI-compatible chat completions and model listing
 * - OAuth2 authentication with token caching via Cloudflare KV
 * - Support for multiple Gemini models (2.5 Pro, 2.0 Flash, 1.5 Pro, etc.)
 * - Streaming responses compatible with OpenAI SDK
 * - Debug and testing endpoints for troubleshooting
 */

// Create the main Hono app
const app = new Hono<{ Bindings: Env }>();

// Add logging middleware
app.use("*", loggingMiddleware);

// Add CORS headers for all requests
app.use("*", async (c, next) => {
	// Set CORS headers
	c.header("Access-Control-Allow-Origin", "*");
	c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

	// Handle preflight requests
	if (c.req.method === "OPTIONS") {
		return new Response(null, { status: 204 });
	}

	await next();
});

// Apply OpenAI API key authentication middleware to all /v1 routes
app.use("/v1/*", openAIApiKeyAuth);

// Setup route handlers
app.route("/v1", OpenAIRoute);
app.route("/v1/debug", DebugRoute);

// Add individual debug routes to main app for backward compatibility
app.route("/v1", DebugRoute);

// Root endpoint - basic info about the service
app.get("/", (c) => {
	const requiresAuth = !!c.env.OPENAI_API_KEY;

	return c.json({
		name: "Gemini CLI OpenAI Worker",
		description: "OpenAI-compatible API for Google Gemini models via OAuth",
		version: "1.0.0",
		authentication: {
			required: requiresAuth,
			type: requiresAuth ? "Bearer token in Authorization header" : "None"
		},
		endpoints: {
			chat_completions: "/v1/chat/completions",
			models: "/v1/models",
			debug: {
				cache: "/v1/debug/cache",
				token_test: "/v1/token-test",
				full_test: "/v1/test"
			}
		},
		documentation: "https://github.com/gewoonjaap/gemini-cli-openai"
	});
});

// Health check endpoint
app.get("/health", (c) => {
	return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;
