import Elysia from "elysia";
import { z } from "@elysiajs/zod";
import { queryLore } from "../rag/lancedb.ts";
import { indexNote, fullReindex } from "../rag/indexer.ts";
import prisma from "../db/client.ts";
import { RagQueryBodySchema, RagReindexParamsSchema } from "../types/lore.ts";

export const ragRoute = new Elysia({ prefix: "/rag" })
    .post(
        "/query",
        async ({ body }) => {
            const chunks = await queryLore(body.text, body.topK);
            return { results: chunks };
        },
        {
            body: z.object({
                text: RagQueryBodySchema.shape.text.describe(
                    "Text to find semantically similar lore for"
                ),
                topK: RagQueryBodySchema.shape.topK.describe(
                    "Number of results to return (1–50, default 10)"
                ),
            }),
            detail: {
                summary: "Query the RAG index",
                description: "Returns the top-k most semantically similar lore chunks for the given text.",
                tags: ["RAG"],
            },
        }
    )
    .post(
        "/reindex/:noteId",
        async ({ params }) => {
            const { noteId } = RagReindexParamsSchema.parse(params);
            await indexNote(noteId);
            return { ok: true, noteId };
        },
        {
            params: z.object({
                noteId: RagReindexParamsSchema.shape.noteId.describe("AllCodex note ID to reindex"),
            }),
            detail: {
                summary: "Reindex a single note",
                description: "Fetches the note from AllCodex and updates its embedding in LanceDB.",
                tags: ["RAG"],
            },
        }
    )
    .post(
        "/reindex",
        async () => {
            const result = await fullReindex();
            return result;
        },
        {
            detail: {
                summary: "Full RAG reindex",
                description: "Reindexes all lore notes from AllCodex. Slow — use sparingly.",
                tags: ["RAG"],
            },
        }
    )
    .get(
        "/status",
        async () => {
            const count = await prisma.ragIndexMeta.count();
            const latest = await prisma.ragIndexMeta.findFirst({
                orderBy: { embeddedAt: "desc" },
                select: { embeddedAt: true, model: true },
            });
            return { indexedNotes: count, lastIndexed: latest?.embeddedAt, model: latest?.model };
        },
        {
            detail: {
                summary: "RAG index status",
                description: "Returns the number of indexed notes and last index time.",
                tags: ["RAG"],
            },
        }
    );
