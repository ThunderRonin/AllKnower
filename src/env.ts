import { z } from "zod";

/**
 * Typesafe environment variable schema for AllKnower.
 * Validated at startup via Zod.
 */
export const envSchema = z.object({
    PORT: z
        .string()
        .transform(Number)
        .default("3001")
        .pipe(z.number().positive()),
    NODE_ENV: z
        .union([z.literal("development"), z.literal("production"), z.literal("test")])
        .default("development"),

    // Database
    DATABASE_URL: z.string().min(1),

    // better-auth
    BETTER_AUTH_SECRET: z.string().min(16),
    BETTER_AUTH_URL: z.string().default("http://localhost:3001"),

    // OpenRouter
    OPENROUTER_API_KEY: z.string().min(1),
    OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),

    // LLM Models (routed through OpenRouter)
    BRAIN_DUMP_MODEL: z.string().default("x-ai/grok-4.1-fast"),
    CONSISTENCY_MODEL: z.string().default("moonshotai/kimi-k2.5"),

    // Embedding Models
    EMBEDDING_LOCAL: z.string().default("ollama/nomic-embed-text"),
    EMBEDDING_CLOUD: z.string().default("google/gemini-embedding-001"),

    // Ollama
    OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),

    // LanceDB
    LANCEDB_PATH: z.string().default("./data/lancedb"),

    // AllCodex ETAPI
    ALLCODEX_URL: z.string().default("http://localhost:8080"),
    ALLCODEX_ETAPI_TOKEN: z.string().min(1),

    // Rate limiting
    BRAIN_DUMP_RATE_LIMIT_MAX: z
        .string()
        .transform(Number)
        .default("10")
        .pipe(z.number().positive()),
    BRAIN_DUMP_RATE_LIMIT_WINDOW_MS: z
        .string()
        .transform(Number)
        .default("60000")
        .pipe(z.number().positive()),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(): Env {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        console.error("❌ Invalid environment variables:", JSON.stringify(result.error.format(), null, 2));
        process.exit(1);
    }
    return result.data;
}

export const env = parseEnv();
