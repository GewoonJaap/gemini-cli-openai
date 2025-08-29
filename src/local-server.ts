import { serve } from "@hono/node-server";
import { config } from "dotenv";
import { createApp } from "./app";
import { Env } from "./types";
import { fileCache } from "./utils/file-cache";

// Load environment variables from .env file
config();

const localEnv: Partial<Env> = {
	GEMINI_CLI_KV: fileCache, // Use file cache as KV store
	GCP_SERVICE_ACCOUNT: process.env.GCP_SERVICE_ACCOUNT,
	OPENAI_API_KEY: process.env.OPENAI_API_KEY,
	ENABLE_FAKE_THINKING: process.env.ENABLE_FAKE_THINKING,
	ENABLE_REAL_THINKING: process.env.ENABLE_REAL_THINKING
	// Add other environment variables from process.env as needed
};

const app = createApp(localEnv);

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

serve(
	{
		fetch: app.fetch,
		port: port
	},
	() => {
		console.log(`Server is running on http://localhost:${port}`);
	}
);
