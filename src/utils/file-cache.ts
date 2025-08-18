import fs from "fs/promises";
import path from "path";

const cacheFilePath = path.join(process.cwd(), ".cache.json");

interface Cache {
	[key: string]: unknown;
}

let memoryCache: Cache | null = null;

async function readCache(): Promise<Cache> {
	if (memoryCache) {
		return memoryCache;
	}
	try {
		const data = await fs.readFile(cacheFilePath, "utf-8");
		memoryCache = JSON.parse(data);
		return memoryCache as Cache;
	} catch (error: unknown) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT"
		) {
			return {}; // Return empty object if file doesn't exist
		}
		// Re‑throw any other error so the caller can handle it.
		throw error;
	}
}

async function writeCache(cache: Cache): Promise<void> {
	await fs.writeFile(cacheFilePath, JSON.stringify(cache, null, 2));
	memoryCache = cache;
}

export const fileCache: KVNamespace = {
	async get<T = unknown>(key: string, type?: "json"): Promise<T | null> {
		const cache = await readCache();
		const value = cache[key] ?? null;
		if (type === "json" && typeof value === "string") {
			try {
				return JSON.parse(value) as T;
			} catch {
				// Ignore if not valid JSON
				return value as T;
			}
		}
		return value as T | null;
	},

	async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
		const cache = await readCache();
		// In a real KV store, the value would be a string.
		// The AuthManager stringifies it, so we store it as is.
		cache[key] = value;
		await writeCache(cache);
		if (options?.expirationTtl) {
			// console.log(`File cache does not support TTL. Key '${key}' will not expire.`);
		}
	},

	async delete(key: string): Promise<void> {
		const cache = await readCache();
		delete cache[key];
		await writeCache(cache);
	},

	async list(): Promise<{ keys: { name: string }[] }> {
		console.warn("fileCache.list() is not implemented and will return an empty list.");
		return { keys: [] };
	},

	async getWithMetadata<T = unknown>(): Promise<{
		value: T | null;
		metadata: unknown;
	}> {
		console.warn("fileCache.getWithMetadata() is not implemented and will return null.");
		return { value: null, metadata: null };
	}
};

// --- KVNamespace Interface (for compatibility with Cloudflare Workers) ---
// This is a simplified version of the Cloudflare KVNamespace interface.
// It's used for type compatibility when running locally.
export interface KVNamespace {
	get<T = unknown>(key: string, type?: "json"): Promise<T | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
	delete(key: string): Promise<void>;
	list(): Promise<{ keys: { name: string }[] }>;
	getWithMetadata<T = unknown>(): Promise<{ value: T | null; metadata: unknown }>;
}
