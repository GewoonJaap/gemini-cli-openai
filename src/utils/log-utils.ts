import { Env } from "../types";

export async function logErrorToKV(env: Env, error: unknown, context: string): Promise<void> {
	if (!env.GEMINI_CLI_KV) {
		console.error("GEMINI_CLI_KV is not configured. Cannot log error to KV.");
		return;
	}

	const timestamp = new Date().toISOString();
	const errorMessage = error instanceof Error ? error.message : String(error);
	const errorStack = error instanceof Error ? error.stack : "N/A";

	const logEntry = {
		timestamp,
		context,
		message: errorMessage,
		stack: errorStack,
		type: "error"
	};

	try {
		await env.GEMINI_CLI_KV.put(`error-${timestamp}-${crypto.randomUUID()}`, JSON.stringify(logEntry));
		console.log(`Logged error to KV: ${context} - ${errorMessage}`);
	} catch (kvError) {
		console.error("Failed to write error log to KV:", kvError);
	}
}