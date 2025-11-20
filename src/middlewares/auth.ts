import { MiddlewareHandler } from "hono";
import { Env } from "../types";
import {
	KV_TOKEN_KEY
} from "../config";
/**
 * Middleware to enforce OpenAI-style API key authentication if OPENAI_API_KEY is set in the environment.
 * Checks for 'Authorization: Bearer <key>' header on protected routes.
 */
export const openAIApiKeyAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	// Skip authentication for public endpoints
	const publicEndpoints = ["/", "/health"];
	if (publicEndpoints.some((endpoint) => c.req.path === endpoint)) {
		await next();
		return;
	}

	// If OPENAI_API_KEY is set in environment, require authentication
	if (c.env.OPENAI_API_KEY) {
		const authHeader = c.req.header("Authorization");

		if (!authHeader) {
			return c.json(
				{
					error: {
						message: "Missing Authorization header",
						type: "authentication_error",
						code: "missing_authorization"
					}
				},
				401
			);
		}

		// Check for Bearer token format
		const match = authHeader.match(/^Bearer\s+(.+)$/);
		if (!match) {
			return c.json(
				{
					error: {
						message: "Invalid Authorization header format. Expected: Bearer <token>",
						type: "authentication_error",
						code: "invalid_authorization_format"
					}
				},
				401
			);
		}

		const providedKey = match[1];
		//console.log(`providedKe:${providedKey},  c.env.GEMINI_PROJECT_MAP: ${c.env.GEMINI_PROJECT_MAP}`)
		// const AUTH_MAP = JSON.parse(c.env.GEMINI_PROJECT_MAP || "{}"); 
		// GEMINI_PROJECT_MAP may excceds cloudflare secret limit
		// read from KV storage
		var AUTH_MAP = await c.env.GEMINI_CLI_KV.get("GEMINI_PROJECT_MAP","json");
		if (! AUTH_MAP ){
			AUTH_MAP = JSON.parse(c.env.GEMINI_PROJECT_MAP || "{}");
			try {
				await c.env.GEMINI_CLI_KV.put("GEMINI_PROJECT_MAP", JSON.stringify(AUTH_MAP));
				console.log("Saved GEMINI_PROJECT_MAP to KV storage");
			} catch (kvError) {	
				console.log(`Failed to save GEMINI_PROJECT_MAP to KV storage: ${kvError}`);
			
			}
		}
		//console.log(`AUTH_MAP:${AUTH_MAP}`, AUTH_MAP);
		if (providedKey == c.env.OPENAI_API_KEY){
	        return next();
		}

		if (AUTH_MAP.hasOwnProperty(providedKey)){

			const provider  = AUTH_MAP[providedKey];
			if(provider.hasOwnProperty("GCP_SERVICE_ACCOUNT"))
				c.env.GCP_SERVICE_ACCOUNT = JSON.stringify(provider["GCP_SERVICE_ACCOUNT"]);
			if(provider.hasOwnProperty("GEMINI_PROJECT_ID"))
				c.env.GEMINI_PROJECT_ID = provider["GEMINI_PROJECT_ID"] ;

			if (providedKey !== c.env.OPENAI_API_KEY){
				try {
					await c.env.GEMINI_CLI_KV.delete(KV_TOKEN_KEY);
					console.log("Cleared cached token from KV storage");
				} catch (kvError) {
					console.log("Error clearing KV cache:", kvError);
				}
			}

			c.env.OPENAI_API_KEY = providedKey;
		}else {
			return c.json(
				{
					error: {
						message: "Invalid API key",
						type: "authentication_error",
						code: "invalid_api_key"
					}
				},
				401
			);
		}

		// Optionally log successful authentication
		// console.log('API key authentication successful');
	}

	await next();
};
