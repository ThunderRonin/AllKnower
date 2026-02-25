/**
 * AllCodex ETAPI Client
 *
 * HTTP client for communicating with AllCodex (Trilium) via its REST API.
 * Auth: Raw ETAPI token in Authorization header.
 *
 * ETAPI reference: apps/server/etapi.openapi.yaml in AllCodex repo
 */

import { env } from "../env.ts";

const BASE_URL = env.ALLCODEX_URL;
const TOKEN = env.ALLCODEX_ETAPI_TOKEN;

const AUTH_HEADER = TOKEN;

const DEFAULT_HEADERS = {
    Authorization: AUTH_HEADER,
    "Content-Type": "application/json",
};

async function etapiFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${BASE_URL}/etapi${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            ...DEFAULT_HEADERS,
            ...(options.headers ?? {}),
        },
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`ETAPI ${options.method ?? "GET"} ${path} → ${res.status}: ${body}`);
    }

    return res;
}

// ── Note Operations ───────────────────────────────────────────────────────────

export interface EtapiNote {
    noteId: string;
    title: string;
    type: string;
    mime: string;
    isProtected: boolean;
    dateCreated: string;
    dateModified: string;
    utcDateCreated: string;
    utcDateModified: string;
    parentNoteIds: string[];
    childNoteIds: string[];
    attributes: EtapiAttribute[];
}

export interface EtapiAttribute {
    attributeId: string;
    noteId: string;
    type: "label" | "relation";
    name: string;
    value: string;
    isInheritable: boolean;
}

export interface CreateNoteParams {
    parentNoteId: string;
    title: string;
    type: "text" | "code" | "file" | "image" | "search" | "book" | "noteMap" | "webView";
    mime?: string;
    content?: string;
    notePosition?: number;
    prefix?: string;
    isExpanded?: boolean;
    noteId?: string;
}

/** Search for notes using Trilium's search syntax */
export async function getAllCodexNotes(search: string): Promise<EtapiNote[]> {
    const res = await etapiFetch(`/notes?search=${encodeURIComponent(search)}`);
    const data = await res.json() as { results: EtapiNote[] };
    return data.results;
}

/** Get a single note by ID */
export async function getNote(noteId: string): Promise<EtapiNote> {
    const res = await etapiFetch(`/notes/${noteId}`);
    return res.json() as Promise<EtapiNote>;
}

/** Get raw note content (HTML or plain text) */
export async function getNoteContent(noteId: string): Promise<string> {
    const res = await etapiFetch(`/notes/${noteId}/content`);
    return res.text();
}

/** Create a new note in AllCodex */
export async function createNote(params: CreateNoteParams): Promise<{ note: EtapiNote; branch: any }> {
    const res = await etapiFetch("/create-note", {
        method: "POST",
        body: JSON.stringify(params),
    });
    return res.json() as Promise<{ note: EtapiNote; branch: any }>;
}

/** Update note metadata (title, type) */
export async function updateNote(
    noteId: string,
    patch: Partial<Pick<EtapiNote, "title" | "type" | "mime">>
): Promise<EtapiNote> {
    const res = await etapiFetch(`/notes/${noteId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
    });
    return res.json() as Promise<EtapiNote>;
}

/** Set note content (HTML or plain text) */
export async function setNoteContent(noteId: string, content: string): Promise<void> {
    await etapiFetch(`/notes/${noteId}/content`, {
        method: "PUT",
        headers: { "Content-Type": "text/html" },
        body: content,
    });
}

// ── Attribute Operations ──────────────────────────────────────────────────────

export interface CreateAttributeParams {
    noteId: string;
    type: "label" | "relation";
    name: string;
    value?: string;
    isInheritable?: boolean;
}

/** Create an attribute (label or relation) on a note */
export async function createAttribute(params: CreateAttributeParams): Promise<EtapiAttribute> {
    const res = await etapiFetch("/attributes", {
        method: "POST",
        body: JSON.stringify(params),
    });
    return res.json() as Promise<EtapiAttribute>;
}

/** Set a template relation on a note (links it to a lore template) */
export async function setNoteTemplate(noteId: string, templateNoteId: string): Promise<void> {
    await createAttribute({
        noteId,
        type: "relation",
        name: "template",
        value: templateNoteId,
    });
}

/** Tag a note with a label */
export async function tagNote(noteId: string, labelName: string, value: string = ""): Promise<void> {
    await createAttribute({ noteId, type: "label", name: labelName, value });
}

// ── Health Check ──────────────────────────────────────────────────────────────

/** Verify AllCodex is reachable via ETAPI */
export async function checkAllCodexHealth(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
        const res = await etapiFetch("/app-info");
        const info = await res.json() as { appVersion: string };
        return { ok: true, version: info.appVersion };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}
