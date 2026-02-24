import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { plugins } from "./plugins/index.ts";
import { brainDumpRoute } from "./routes/brain-dump.ts";
import { ragRoute } from "./routes/rag.ts";
import { consistencyRoute } from "./routes/consistency.ts";
import { suggestRoute } from "./routes/suggest.ts";
import { healthRoute } from "./routes/health.ts";
import { auth } from "./auth/index.ts";

import { env } from "./env.ts";

const PORT = env.PORT;

const app = new Elysia()
    // ── Infrastructure plugins ────────────────────────────────────────────────
    .use(plugins)

    // ── API documentation (Scalar via @elysiajs/openapi) ─────────────────────
    .use(
        openapi({
            documentation: {
                info: {
                    title: "AllKnower API",
                    version: "0.1.0",
                    description:
                        "The intelligence layer behind AllCodex — AI orchestration, RAG, and lore management for the All Reach grimoire.",
                },
                tags: [
                    { name: "Brain Dump", description: "AI-powered lore extraction pipeline" },
                    { name: "RAG", description: "Retrieval-augmented generation index management" },
                    { name: "Intelligence", description: "Consistency checking and relationship suggestions" },
                    { name: "System", description: "Health and system status" },
                    { name: "Auth", description: "Authentication" },
                ],
            },
            path: "/reference",
        })
    )

    // ── better-auth handler ───────────────────────────────────────────────────
    .all("/api/auth/*", ({ request }) => auth.handler(request), {
        parse: "none",
    })

    // ── Routes ────────────────────────────────────────────────────────────────
    .use(healthRoute)
    .use(brainDumpRoute)
    .use(ragRoute)
    .use(consistencyRoute)
    .use(suggestRoute)

    // ── Root ──────────────────────────────────────────────────────────────────
    .get("/", () => ({
        name: "AllKnower",
        version: "0.1.0",
        description: "The brain behind AllCodex — AI orchestration for All Reach",
        docs: "/reference",
        health: "/health",
    }))

    // ── Start ─────────────────────────────────────────────────────────────────
    .listen(PORT);

console.log(
    `\n🧠 AllKnower is running at http://${app.server?.hostname}:${app.server?.port}\n` +
    `   📖 API docs: http://${app.server?.hostname}:${app.server?.port}/reference\n` +
    `   ❤️  Health:   http://${app.server?.hostname}:${app.server?.port}/health\n`
);

export type App = typeof app;
