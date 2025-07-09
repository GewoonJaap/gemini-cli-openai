import { Context, Next } from "hono";
import { Env } from "../types";

/**
 * Logging middleware for request/response tracking
 *
 * Logs:
 * - Request start with method, path, and body (for POST/PUT/PATCH)
 * - Request completion with status code and duration
 * - Masks sensitive data in request bodies
 */
export const loggingMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
	const method = c.req.method;
	const path = c.req.path;
	const startTime = Date.now();
	const timestamp = new Date().toISOString();

	// Log request body for POST/PUT/PATCH requests
	let bodyLog = "";
	if (["POST", "PUT", "PATCH"].includes(method)) {
		try {
			// Clone the request to read the body without consuming it
			const clonedReq = c.req.raw.clone();
			const body = await clonedReq.text();

			// Truncate very long bodies and mask sensitive data
			const truncatedBody = body.length > 500 ? body.substring(0, 500) + "..." : body;
			// Mask potential API keys or tokens
			const maskedBody = truncatedBody.replace(/"(api_?key|token|authorization)":\s*"[^"]*"/gi, '"$1": "***"');
			bodyLog = ` - Body: ${maskedBody}`;
		} catch {
			bodyLog = " - Body: [unable to parse]";
		}
	}

	const logEntry = `[${timestamp}] ${method} ${path}${bodyLog} - Request started`;
	console.log(logEntry);
	if (c.env.GEMINI_CLI_KV) {
		c.env.GEMINI_CLI_KV.put(`log-${timestamp}-${crypto.randomUUID()}`, logEntry).catch((err) =>
			console.error("Failed to write log to KV:", err)
		);
	}

	await next();

	const duration = Date.now() - startTime;
	const status = c.res.status;
	const endTimestamp = new Date().toISOString();

	const completionLogEntry = `[${endTimestamp}] ${method} ${path} - Completed with status ${status} (${duration}ms)`;
	console.log(completionLogEntry);
	if (c.env.GEMINI_CLI_KV) {
		c.env.GEMINI_CLI_KV.put(`log-${endTimestamp}-${crypto.randomUUID()}`, completionLogEntry).catch((err) =>
			console.error("Failed to write log to KV:", err)
		);
	}
};
