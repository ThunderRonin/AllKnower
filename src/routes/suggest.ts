import Elysia, { t } from "elysia";
import { queryLore } from "../rag/lancedb.ts";
import { getAllCodexNotes } from "../etapi/client.ts";
import { callLLM } from "../pipeline/prompt.ts";

export const suggestRoute = new Elysia({ prefix: "/suggest" })
    /**
     * Relationship suggester — given a note, find semantically similar lore
     * and ask the LLM to suggest meaningful connections.
     */
    .post(
        "/relationships",
        async ({ body }) => {
            const similar = await queryLore(body.text, 15);

            if (similar.length === 0) {
                return { suggestions: [] };
            }

            const system = `You are a worldbuilding assistant for All Reach. Given a new lore entry and a list of existing entries, suggest meaningful narrative relationships between them.

Return JSON: { "suggestions": [{ "targetNoteId": "...", "targetTitle": "...", "relationshipType": "ally|enemy|family|location|event|faction|other", "description": "One sentence explaining the suggested connection." }] }

Only suggest relationships that are genuinely plausible based on the content. Do not invent connections.`;

            const contextBlock = similar
                .map((c) => `- ${c.noteTitle} (${c.noteId}): ${c.content.slice(0, 200)}`)
                .join("\n");

            const user = `New entry:\n${body.text}\n\nExisting lore:\n${contextBlock}`;

            const { raw } = await callLLM(system, user, "brain-dump");

            let result: unknown;
            try {
                result = JSON.parse(raw);
            } catch {
                result = { suggestions: [] };
            }

            return result;
        },
        {
            body: t.Object({
                text: t.String({ description: "Text of the new or existing lore entry to find relationships for" }),
            }),
            detail: {
                summary: "Suggest relationships",
                description:
                    "Finds semantically similar lore and suggests meaningful narrative connections.",
                tags: ["Intelligence"],
            },
        }
    )
    /**
     * Gap detector — analyze the lore corpus and identify underdeveloped areas.
     */
    .get(
        "/gaps",
        async () => {
            const notes = await getAllCodexNotes("#lore");

            const typeCounts: Record<string, number> = {};
            for (const note of notes) {
                const typeAttr = note.attributes?.find((a: { name: string }) => a.name === "loreType");
                const type = typeAttr?.value ?? "unknown";
                typeCounts[type] = (typeCounts[type] ?? 0) + 1;
            }

            const system = `You are a worldbuilding advisor for All Reach. Given a breakdown of lore entry counts by type, identify gaps and underdeveloped areas.

Return JSON: { "gaps": [{ "area": "...", "severity": "high"|"medium"|"low", "description": "...", "suggestion": "..." }], "summary": "..." }`;

            const user = `Lore entry counts by type:\n${JSON.stringify(typeCounts, null, 2)}\n\nTotal entries: ${notes.length}`;

            const { raw } = await callLLM(system, user, "brain-dump");

            let result: unknown;
            try {
                result = JSON.parse(raw);
            } catch {
                result = { gaps: [], summary: "Failed to parse gap analysis." };
            }

            return { ...(result as object), typeCounts, totalNotes: notes.length };
        },
        {
            detail: {
                summary: "Detect lore gaps",
                description:
                    "Analyzes the lore corpus and identifies underdeveloped areas.",
                tags: ["Intelligence"],
            },
        }
    );
