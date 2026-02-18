import * as lancedb from "vectordb";
import { embed, EMBEDDING_DIMENSIONS } from "./embedder.ts";
import type { RagChunk } from "../types/lore.ts";

const DB_PATH = process.env.LANCEDB_PATH ?? "./data/lancedb";
const TABLE_NAME = "lore_embeddings";

let _db: lancedb.Connection | null = null;
let _table: lancedb.Table | null = null;

/**
 * Get (or create) the LanceDB connection and lore_embeddings table.
 * LanceDB is embedded — no separate server needed.
 */
export async function getTable(): Promise<lancedb.Table> {
    if (_table) return _table;

    _db = await lancedb.connect(DB_PATH);

    const existingTables = await _db.tableNames();

    if (existingTables.includes(TABLE_NAME)) {
        _table = await _db.openTable(TABLE_NAME);
    } else {
        // Create table with schema inferred from a seed record
        _table = await _db.createTable(TABLE_NAME, [
            {
                noteId: "__seed__",
                noteTitle: "__seed__",
                chunkIndex: 0,
                content: "__seed__",
                vector: new Array(EMBEDDING_DIMENSIONS).fill(0),
            },
        ]);
        // Remove the seed record
        await _table.delete(`noteId = '__seed__'`);
    }

    return _table;
}

/**
 * Upsert lore chunks for a note.
 * Deletes existing chunks for the noteId, then inserts new ones.
 */
export async function upsertNoteChunks(
    noteId: string,
    noteTitle: string,
    chunks: string[]
): Promise<void> {
    const table = await getTable();

    // Remove existing chunks for this note
    await table.delete(`noteId = '${noteId}'`);

    if (chunks.length === 0) return;

    // Embed all chunks
    const records = await Promise.all(
        chunks.map(async (content, chunkIndex) => ({
            noteId,
            noteTitle,
            chunkIndex,
            content,
            vector: await embed(content),
        }))
    );

    await table.add(records);
}

/**
 * Semantic similarity search — returns top-k most relevant lore chunks.
 */
export async function queryLore(
    queryText: string,
    topK: number = 10
): Promise<RagChunk[]> {
    const table = await getTable();
    const queryVector = await embed(queryText);

    const results = await table
        .search(queryVector)
        .limit(topK)
        .select(["noteId", "noteTitle", "content", "_distance"])
        .execute();

    return results.map((row: any) => ({
        noteId: row.noteId as string,
        noteTitle: row.noteTitle as string,
        content: row.content as string,
        score: 1 - (row._distance as number), // convert distance to similarity score
    }));
}

/**
 * Delete all chunks for a note (e.g. when note is deleted in AllCodex).
 */
export async function deleteNoteChunks(noteId: string): Promise<void> {
    const table = await getTable();
    await table.delete(`noteId = '${noteId}'`);
}

/**
 * Health check — verify LanceDB is accessible and table exists.
 */
export async function checkLanceDbHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
        const table = await getTable();
        const count = await table.countRows();
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

/**
 * Chunk a long text into overlapping segments for better RAG recall.
 * Simple sentence-aware chunking — good enough for lore entries.
 */
export function chunkText(text: string, chunkSize: number = 512, overlap: number = 64): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const chunks: string[] = [];
    let start = 0;

    while (start < words.length) {
        const end = Math.min(start + chunkSize, words.length);
        chunks.push(words.slice(start, end).join(" "));
        if (end === words.length) break;
        start += chunkSize - overlap;
    }

    return chunks;
}
