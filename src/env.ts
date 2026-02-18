import { t } from "elysia";

/**
 * Typesafe environment variable schema for AllKnower.
 * Validated at startup via elysia-env — the app will refuse to start
 * if any required variable is missing or malformed.
 */
export const envSchema = {
    PORT: t.Number({ default: 3001 }),
    NODE_ENV: t.Union([t.Literal("development"), t.Literal("production"), t.Literal("test")], {
        default: "development",
    }),

    // Database
    DATABASE_URL: t.String(),

    // better-auth
    BETTER_AUTH_SECRET: t.String({ minLength: 16 }),
    BETTER_AUTH_URL: t.String({ default: "http://localhost:3001" }),

    // OpenRouter
    OPENROUTER_API_KEY: t.String(),
    OPENROUTER_BASE_URL: t.String({ default: "https://openrouter.ai/api/v1" }),

    // LLM Models (routed through OpenRouter)
    BRAIN_DUMP_MODEL: t.String({ default: "x-ai/grok-4.1-fast" }),
    CONSISTENCY_MODEL: t.String({ default: "moonshotai/kimi-k2.5" }),

    // Embedding Models
    EMBEDDING_LOCAL: t.String({ default: "ollama/nomic-embed-text" }),
    EMBEDDING_CLOUD: t.String({ default: "google/gemini-embedding-001" }),

    // Ollama
    OLLAMA_BASE_URL: t.String({ default: "http://localhost:11434" }),

    // LanceDB
    LANCEDB_PATH: t.String({ default: "./data/lancedb" }),

    // AllCodex ETAPI
    ALLCODEX_URL: t.String({ default: "http://localhost:8080" }),
    ALLCODEX_ETAPI_TOKEN: t.String(),

    // Rate limiting
    BRAIN_DUMP_RATE_LIMIT_MAX: t.Number({ default: 10 }),
    BRAIN_DUMP_RATE_LIMIT_WINDOW_MS: t.Number({ default: 60000 }),
} as const;

export type Env = typeof envSchema;
