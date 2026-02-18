import { Ollama } from "ollama";
import OpenAI from "openai";

/**
 * Embedder — generates vector embeddings for lore text.
 *
 * Primary:  Ollama (EMBEDDING_LOCAL) — local, zero cloud cost.
 * Fallback: OpenRouter (EMBEDDING_CLOUD) — if Ollama is unreachable.
 *
 * Model env vars:
 *   EMBEDDING_LOCAL=ollama/nomic-embed-text   (strip "ollama/" prefix for Ollama client)
 *   EMBEDDING_CLOUD=google/gemini-embedding-001
 *   OLLAMA_BASE_URL=http://localhost:11434
 */

// Strip the "ollama/" provider prefix — the Ollama client only wants the model name
const EMBEDDING_LOCAL_RAW = process.env.EMBEDDING_LOCAL ?? "ollama/nomic-embed-text";
const OLLAMA_MODEL = EMBEDDING_LOCAL_RAW.replace(/^ollama\//, "");

const EMBEDDING_CLOUD = process.env.EMBEDDING_CLOUD ?? "google/gemini-embedding-001";

const ollama = new Ollama({
    host: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
});

const openrouterClient = new OpenAI({
    baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    defaultHeaders: {
        "HTTP-Referer": "https://allknower.local",
        "X-Title": "AllKnower",
    },
});

// nomic-embed-text produces 768-dim vectors.
// gemini-embedding-001 produces 3072-dim vectors.
// LanceDB table is created with the dimension of the first embedding written —
// switching models requires a full reindex.
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Embed a single text string.
 * Tries Ollama first; falls back to OpenRouter EMBEDDING_CLOUD on failure.
 */
export async function embed(text: string): Promise<number[]> {
    try {
        const response = await ollama.embeddings({
            model: OLLAMA_MODEL,
            prompt: text,
        });
        return response.embedding;
    } catch (ollamaError) {
        console.warn(
            `[embedder] Ollama (${OLLAMA_MODEL}) unavailable, falling back to ${EMBEDDING_CLOUD}:`,
            ollamaError
        );
        return embedViaOpenRouter(text);
    }
}

/**
 * Embed multiple texts in batch.
 * Returns an array of embeddings in the same order as the input.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    // Ollama doesn't support true batch embedding — run sequentially
    for (const text of texts) {
        results.push(await embed(text));
    }
    return results;
}

async function embedViaOpenRouter(text: string): Promise<number[]> {
    const response = await openrouterClient.embeddings.create({
        model: EMBEDDING_CLOUD,
        input: text,
    });
    return response.data[0].embedding;
}

/**
 * Check if Ollama is reachable and the embedding model is available.
 */
export async function checkOllamaHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
        const models = await ollama.list();
        const hasModel = models.models.some((m) => m.name.startsWith(OLLAMA_MODEL));
        if (!hasModel) {
            return {
                ok: false,
                error: `Model '${OLLAMA_MODEL}' not found in Ollama. Run: ollama pull ${OLLAMA_MODEL}`,
            };
        }
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}
