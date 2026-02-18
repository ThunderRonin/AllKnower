import Elysia from "elysia";
import { z } from "@elysiajs/zod";
import { getAllCodexNotes, getNoteContent } from "../etapi/client.ts";
import { callLLM } from "../pipeline/prompt.ts";
import { ConsistencyCheckBodySchema } from "../types/lore.ts";

export const consistencyRoute = new Elysia({ prefix: "/consistency" }).post(
    "/check",
    async ({ body }) => {
        const search = body.noteIds?.length
            ? body.noteIds.map((id) => `#noteId=${id}`).join(" OR ")
            : "#lore";

        const notes = await getAllCodexNotes(search);

        if (notes.length === 0) {
            return { issues: [], summary: "No lore notes found to check." };
        }

        const loreSummaries = await Promise.all(
            notes.slice(0, 30).map(async (note) => {
                const content = await getNoteContent(note.noteId).catch(() => "");
                const plain = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
                return `## ${note.title} (${note.noteId})\n${plain}`;
            })
        );

        const system = `You are a consistency checker for a fantasy worldbuilding grimoire called All Reach.
Analyze the provided lore entries and identify:
1. Factual contradictions (e.g. a character is alive in one entry, dead in another)
2. Timeline conflicts (events that can't coexist chronologically)
3. Orphaned references (mentions of entities that don't exist as entries)
4. Naming inconsistencies (same entity referred to by different names)

Return JSON: { "issues": [{ "type": "contradiction"|"timeline"|"orphan"|"naming", "severity": "high"|"medium"|"low", "description": "...", "affectedNoteIds": ["..."] }], "summary": "..." }`;

        const user = `Check these lore entries for consistency issues:\n\n${loreSummaries.join("\n\n")}`;

        const { raw } = await callLLM(system, user, "consistency");

        let result: unknown;
        try {
            result = JSON.parse(raw);
        } catch {
            result = { issues: [], summary: "Failed to parse consistency check response." };
        }

        return result;
    },
    {
        body: z.object({
            noteIds: ConsistencyCheckBodySchema.shape.noteIds.describe(
                "Specific note IDs to check. Omit to check all lore."
            ),
        }),
        detail: {
            summary: "Run consistency check",
            description:
                "Scans lore entries for contradictions, timeline conflicts, orphaned references, and naming inconsistencies.",
            tags: ["Intelligence"],
        },
    }
);
