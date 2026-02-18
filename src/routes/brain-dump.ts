import Elysia, { t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { runBrainDump } from "../pipeline/brain-dump.ts";
import { env } from "../env.ts";
import { requireAuth } from "../plugins/auth-guard.ts";

export const brainDumpRoute = new Elysia({ prefix: "/brain-dump" })
    .use(requireAuth)
    .use(
        rateLimit({
            max: env.BRAIN_DUMP_RATE_LIMIT_MAX,
            duration: env.BRAIN_DUMP_RATE_LIMIT_WINDOW_MS,
            errorResponse: new Response(
                JSON.stringify({ error: "Rate limit exceeded. Brain dump is limited to 10 requests per minute." }),
                { status: 429, headers: { "Content-Type": "application/json" } }
            ),
        })
    )
    .post(
        "/",
        async ({ body }) => {
            const result = await runBrainDump(body.rawText);
            return result;
        },
        {
            body: t.Object({
                rawText: t.String({
                    minLength: 10,
                    maxLength: 50000,
                    description: "Raw worldbuilding brain dump text to process",
                }),
            }),
            detail: {
                summary: "Process a brain dump",
                description:
                    "Accepts raw worldbuilding text, runs it through the RAG + LLM pipeline, and creates/updates lore entries in AllCodex.",
                tags: ["Brain Dump"],
            },
        }
    )
    .get(
        "/history",
        async () => {
            const { default: prisma } = await import("../db/client.ts");
            const history = await prisma.brainDumpHistory.findMany({
                orderBy: { createdAt: "desc" },
                take: 20,
                select: {
                    id: true,
                    rawText: true,
                    notesCreated: true,
                    notesUpdated: true,
                    model: true,
                    tokensUsed: true,
                    createdAt: true,
                },
            });
            return history;
        },
        {
            detail: {
                summary: "Get brain dump history",
                description: "Returns the last 20 brain dump operations.",
                tags: ["Brain Dump"],
            },
        }
    );
