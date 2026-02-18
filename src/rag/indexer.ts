import { upsertNoteChunks, chunkText } from "./lancedb.ts";
import { getAllCodexNotes, getNoteContent } from "../etapi/client.ts";
import prisma from "../db/client.ts";
import { OLLAMA_MODEL } from "./embedder.ts";

/**
 * RAG Indexer — background task that keeps LanceDB in sync with AllCodex.
 *
 * Called via Elysia Background after brain dump creates/updates notes,
 * or triggered manually via POST /rag/reindex.
 */

/**
 * Index a single note by ID.
 * Fetches content from AllCodex ETAPI, chunks it, embeds, and upserts into LanceDB.
 */
export async function indexNote(noteId: string): Promise<void> {
    try {
        const content = await getNoteContent(noteId);
        if (!content || content.trim().length === 0) return;

        // Strip HTML tags for embedding (we embed plain text)
        const plainText = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const chunks = chunkText(plainText);

        // Get note title from ETAPI
        const notes = await getAllCodexNotes(`#noteId=${noteId}`);
        const noteTitle = notes[0]?.title ?? noteId;

        await upsertNoteChunks(noteId, noteTitle, chunks);

        // Update RAG index metadata in PostgreSQL
        await prisma.ragIndexMeta.upsert({
            where: { noteId },
            create: {
                noteId,
                noteTitle,
                chunkCount: chunks.length,
                model: OLLAMA_MODEL,
            },
            update: {
                noteTitle,
                chunkCount: chunks.length,
                embeddedAt: new Date(),
                model: OLLAMA_MODEL,
            },
        });

        console.log(`[indexer] Indexed note ${noteId} (${noteTitle}) — ${chunks.length} chunks`);
    } catch (error) {
        console.error(`[indexer] Failed to index note ${noteId}:`, error);
        throw error;
    }
}

/**
 * Full reindex — fetches all lore notes from AllCodex and indexes them.
 * This is a slow operation; run it manually or on first setup.
 * Uses the #lore label to identify lore entries.
 */
export async function fullReindex(): Promise<{ indexed: number; failed: number }> {
    console.log("[indexer] Starting full RAG reindex...");

    // Search for all notes tagged as lore entries
    const loreNotes = await getAllCodexNotes("#lore");

    let indexed = 0;
    let failed = 0;

    for (const note of loreNotes) {
        try {
            await indexNote(note.noteId);
            indexed++;
        } catch {
            failed++;
        }
    }

    console.log(`[indexer] Full reindex complete — ${indexed} indexed, ${failed} failed`);
    return { indexed, failed };
}
