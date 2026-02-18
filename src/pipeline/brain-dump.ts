import { queryLore } from "../rag/lancedb.ts";
import { buildBrainDumpPrompt, callLLM } from "./prompt.ts";
import { parseBrainDumpResponse } from "./parser.ts";
import {
    createNote,
    setNoteContent,
    updateNote,
    setNoteTemplate,
    tagNote,
    createAttribute,
} from "../etapi/client.ts";
import { indexNote } from "../rag/indexer.ts";
import prisma from "../db/client.ts";
import { env } from "../env.ts";
import { TEMPLATE_ID_MAP } from "../types/lore.ts";
import type { BrainDumpResult } from "../types/lore.ts";

// The root note ID in AllCodex where new lore entries are placed.
// This should be the "Lore" root note in the Chronicle.
// Can be overridden via AppConfig in the DB.
const DEFAULT_LORE_ROOT_NOTE_ID = "root";

/**
 * Main brain dump pipeline.
 *
 * 1. Query LanceDB for semantically similar existing lore (RAG context)
 * 2. Build Claude prompt with RAG context injected
 * 3. Call Claude via OpenRouter
 * 4. Parse structured JSON response
 * 5. Create/update notes in AllCodex via ETAPI
 * 6. Trigger background RAG reindex for new/updated notes
 * 7. Persist to BrainDumpHistory
 * 8. Return summary to user
 */
export async function runBrainDump(rawText: string): Promise<BrainDumpResult> {
    // Step 1: RAG context retrieval
    const ragContext = await queryLore(rawText, 10);

    // Step 2 & 3: Build prompt and call Claude
    const { system, user } = buildBrainDumpPrompt(rawText, ragContext);
    const { raw, tokensUsed } = await callLLM(system, user, "brain-dump");

    // Step 4: Parse response
    const { entities, summary } = parseBrainDumpResponse(raw);

    const created: BrainDumpResult["created"] = [];
    const updated: BrainDumpResult["updated"] = [];
    const skipped: BrainDumpResult["skipped"] = [];

    // Get lore root note ID from config (fallback to root)
    const loreRootConfig = await prisma.appConfig.findUnique({ where: { key: "loreRootNoteId" } });
    const loreRootNoteId = loreRootConfig?.value ?? DEFAULT_LORE_ROOT_NOTE_ID;

    // Step 5: Create/update notes in AllCodex
    for (const entity of entities) {
        try {
            if (entity.action === "update" && entity.existingNoteId) {
                // Update existing note
                await updateNote(entity.existingNoteId, { title: entity.title });
                if (entity.content) {
                    await setNoteContent(entity.existingNoteId, entity.content);
                }
                updated.push({ noteId: entity.existingNoteId, title: entity.title, type: entity.type });

                // Reindex in background (fire and forget)
                indexNote(entity.existingNoteId).catch(console.error);
            } else {
                // Create new note
                const { note } = await createNote({
                    parentNoteId: loreRootNoteId,
                    title: entity.title,
                    type: "text",
                    content: entity.content ?? "",
                });

                // Link to lore template
                const templateId = TEMPLATE_ID_MAP[entity.type];
                await setNoteTemplate(note.noteId, templateId);

                // Tag as lore entry
                await tagNote(note.noteId, "lore");
                await tagNote(note.noteId, entity.type);

                // Set promoted attributes
                if (entity.attributes && typeof entity.attributes === "object") {
                    for (const [name, value] of Object.entries(entity.attributes)) {
                        if (value !== undefined && value !== null && value !== "") {
                            const strValue = Array.isArray(value) ? value.join(", ") : String(value);
                            await createAttribute({ noteId: note.noteId, type: "label", name, value: strValue });
                        }
                    }
                }

                // Apply tags
                for (const tag of entity.tags ?? []) {
                    await tagNote(note.noteId, tag);
                }

                created.push({ noteId: note.noteId, title: entity.title, type: entity.type });

                // Reindex in background (fire and forget)
                indexNote(note.noteId).catch(console.error);
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`[brain-dump] Failed to process entity "${entity.title}":`, error);
            skipped.push({ title: entity.title, reason: msg });
        }
    }

    // Step 7: Persist to history
    await prisma.brainDumpHistory.create({
        data: {
            rawText,
            parsedJson: JSON.parse(JSON.stringify({ entities, summary })),
            notesCreated: created.map((n: { noteId: string }) => n.noteId),
            notesUpdated: updated.map((n: { noteId: string }) => n.noteId),
            model: env.BRAIN_DUMP_MODEL,
            tokensUsed,
        },
    });

    return { summary, created, updated, skipped };
}
