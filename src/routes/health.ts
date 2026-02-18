import Elysia from "elysia";
import { checkAllCodexHealth } from "../etapi/client.ts";
import { checkOllamaHealth } from "../rag/embedder.ts";
import { checkLanceDbHealth } from "../rag/lancedb.ts";
import prisma from "../db/client.ts";

export const healthRoute = new Elysia({ prefix: "/health" }).get(
    "/",
    async () => {
        const [allcodex, ollama, lancedb, db] = await Promise.allSettled([
            checkAllCodexHealth(),
            checkOllamaHealth(),
            checkLanceDbHealth(),
            prisma.$queryRaw`SELECT 1`.then(() => ({ ok: true })).catch((e: any) => ({ ok: false, error: e.message })),
        ]);

        const resolve = (result: PromiseSettledResult<any>) =>
            result.status === "fulfilled" ? result.value : { ok: false, error: result.reason?.message };

        const checks = {
            allcodex: resolve(allcodex),
            ollama: resolve(ollama),
            lancedb: resolve(lancedb),
            database: resolve(db),
        };

        const allOk = Object.values(checks).every((c) => c.ok);

        return new Response(
            JSON.stringify({ status: allOk ? "ok" : "degraded", checks }),
            {
                status: allOk ? 200 : 503,
                headers: { "Content-Type": "application/json" },
            }
        );
    },
    {
        detail: {
            summary: "Health check",
            description: "Checks AllCodex ETAPI, Ollama, LanceDB, and PostgreSQL connectivity.",
            tags: ["System"],
        },
    }
);
