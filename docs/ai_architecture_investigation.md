# AllKnower AI Architecture — Improvement Investigation

Thorough audit of every AI-touching file in the codebase. Items are grouped by layer and ranked by **impact** (🔴 high / 🟡 medium / 🟢 nice-to-have) and **effort** (S/M/L).

---

## 1. Embedding & RAG Pipeline

### 🔴 1.1 — Sequential Embedding = Slow Reindex  
**Current**: [embedder.ts](file:///home/allmaker/projects/allknower/AllKnower/src/rag/embedder.ts#L40-L47) embeds one chunk at a time in a `for` loop. A 20-note reindex does 20+ sequential HTTP calls.  
**Fix**: Use the OpenRouter SDK's `embeddings.generate()` with batch input (most embedding APIs accept `input: string[]`). Fall back to `Promise.all` with concurrency limit (e.g., `p-limit`).  
**Impact**: 5–10× faster indexing. **Effort**: S

### 🔴 1.2 — Naïve Word-Count Chunking
**Current**: [lancedb.ts:chunkText](file:///home/allmaker/projects/allknower/AllKnower/src/rag/lancedb.ts#L122-L137) splits on whitespace with a fixed 512-word window. Cuts mid-sentence, ignores lore structure.  
**Fix**: Use semantic chunking — split on paragraph/section boundaries first, then window. Consider token-based chunking (tiktoken) instead of word-based so chunk size aligns with model context.  
**Impact**: Better retrieval recall, fewer mangled context windows. **Effort**: M

### 🟡 1.3 — No Chunk Deduplication Across Queries
**Current**: [queryLore()](file:///home/allmaker/projects/allknower/AllKnower/src/rag/lancedb.ts#73-96) can return overlapping chunks from the same note. The consumer has no dedup logic.  
**Fix**: After LanceDB query, group by `noteId` and merge overlapping/adjacent chunks into coherent passages.  
**Impact**: Less token waste in the prompt, more diverse context. **Effort**: S

### 🟡 1.4 — Embedder Uses Separate OpenAI Client
**Current**: [embedder.ts](file:///home/allmaker/projects/allknower/AllKnower/src/rag/embedder.ts#L14-L21) creates its own `new OpenAI()` client for embeddings. The chat pipeline now uses `@openrouter/sdk`.  
**Fix**: The SDK has `openrouter.embeddings.generate()`. Consolidate to one client for all OpenRouter calls — less config surface, shared retry/auth logic.  
**Impact**: Cleaner code, single auth path. **Effort**: S

### 🟡 1.5 — No Relevance Threshold / Reranking
**Current**: [queryLore()](file:///home/allmaker/projects/allknower/AllKnower/src/rag/lancedb.ts#73-96) returns top-K results regardless of distance. Low-relevance chunks pollute the context.  
**Fix**: 1) Add a minimum similarity threshold (e.g., `score > 0.5`). 2) Consider a lightweight cross-encoder reranker (Cohere rerank or an OpenRouter model fine-tuned for reranking) for higher-quality context selection.  
**Impact**: Sharper LLM context → better output quality. **Effort**: S (threshold) / L (reranker)

### 🟢 1.6 — No Index Staleness Detection
**Current**: No mechanism to detect when a note was edited in AllCodex but not re-embedded. The `RagIndexMeta.embeddedAt` exists but is never compared to the note's `dateModified`.  
**Fix**: Periodic job or webhook listener that compares `embeddedAt` vs note's `utcDateModified` and queues stale notes for re-embedding.  
**Impact**: RAG stays fresh automatically. **Effort**: M

---

## 2. Prompt Engineering

### 🔴 2.1 — Only brain-dump Uses the Cache-Friendly Prompt Structure
**Current**: [consistency.ts](file:///home/allmaker/projects/allknower/AllKnower/src/routes/consistency.ts#L29-L38) and [suggest.ts](file:///home/allmaker/projects/allknower/AllKnower/src/routes/suggest.ts#L23-L35) build system prompts inline and pass dynamic data in the same message. No separation of static/dynamic content.  
**Fix**: Extract static system prompts to constants (like `BRAIN_DUMP_SYSTEM` in prompt.ts). Pass dynamic RAG context and user input as separate messages using the same 3-part pattern.  
**Impact**: Cache hits for all tasks, not just brain dump. **Effort**: S

### 🟡 2.2 — No Structured Output / JSON Schema Enforcement
**Current**: We request JSON in the system prompt ("Return JSON: {...}") but rely on hope. Only [parser.ts](file:///home/allmaker/projects/allknower/AllKnower/src/pipeline/parser.ts) validates the brain-dump response with Zod.  
**Fix**: Use OpenRouter's `response_format: { type: "json_schema", json_schema: {...} }` for structured output. The SDK supports `responseFormat` with `ResponseFormatJSONSchema`. This forces the model to emit valid JSON matching your schema.  
**Impact**: Eliminates JSON parse failures, removes need for manual validation. **Effort**: M

### 🟡 2.3 — No Response Validation on suggest/consistency/gap-detect
**Current**: [suggest.ts](file:///home/allmaker/projects/allknower/AllKnower/src/routes/suggest.ts#L37-L42), [consistency.ts](file:///home/allmaker/projects/allknower/AllKnower/src/routes/consistency.ts#L42-L47), and gaps all do a bare `JSON.parse(raw)` with no schema validation. If the LLM returns malformed output, we silently return garbage.  
**Fix**: Define Zod schemas for each response type and validate like brain-dump does. Return typed errors when validation fails.  
**Impact**: Client reliability, better debugging. **Effort**: S

### 🟡 2.4 — Consistency Check Truncates Notes to 500 Chars
**Current**: [consistency.ts:L24](file:///home/allmaker/projects/allknower/AllKnower/src/routes/consistency.ts#L24) — `.slice(0, 500)` per note with a hard cap of 30 notes. For large lore bases, this is insufficient.  
**Fix**: Use RAG retrieval + embedding-based clustering to find the most semantically dense subset to check, rather than truncating everything.  
**Impact**: Better consistency detection on large lore bases. **Effort**: M

---

## 3. Model Routing & SDK Usage

### 🟡 3.1 — No Token/Cost Tracking Per Task
**Current**: Only brain-dump records `tokensUsed` in the database. Other tasks (suggest, consistency, gap-detect) discard the model/token info.  
**Fix**: Create a `LLMCallLog` Prisma model. Log every LLM call with task, model, tokens, latency, and cost (calculable from OpenRouter's pricing API).  
**Impact**: Cost visibility, task-level analytics, budget alerts. **Effort**: M

### 🟡 3.2 — No Request Timeout
**Current**: [callWithFallback](file:///home/allmaker/projects/allknower/AllKnower/src/pipeline/model-router.ts#87-141) in model-router.ts has no timeout. If OpenRouter hangs, the request hangs forever.  
**Fix**: Use the SDK's `RequestOptions.timeoutMs` or implement an `AbortController` wrapper.  
**Impact**: Prevents hung requests from blocking workers. **Effort**: S

### 🟢 3.3 — No Provider Preferences
**Current**: We send `model` + `models` but don't set any `provider` preferences (e.g., `sort: "latency"`, `zdr: true`, `allowFallbacks`).  
**Fix**: Add env-configurable provider preferences. For sensitive lore data, enable Zero Data Retention (`zdr: true`). For high-throughput tasks like autocomplete, sort by latency.  
**Impact**: Better privacy, lower latency where it matters. **Effort**: S

### 🟢 3.4 — No `route: "fallback"` Specification
**Current**: The `models` array is passed but we don't explicitly set the routing strategy to `"fallback"`.  
**Fix**: Confirm OpenRouter defaults to fallback routing when `models` is set. If not, the SDK may support a `route` parameter — check and set it explicitly.  
**Impact**: Correctness guarantee. **Effort**: S

---

## 4. Observability & Error Handling

### 🔴 4.1 — console.log-Only Observability
**Current**: All logging is `console.log/warn/error`. No structured logging, no correlation IDs, no way to trace a brain dump through RAG → LLM → ETAPI.  
**Fix**: Adopt a structured logger (e.g., `pino`). Assign a `requestId` at the route level and thread it through the pipeline. Use OpenRouter's `trace` / `sessionId` fields to correlate LLM calls in their dashboard.  
**Impact**: Debuggability goes from "grep logs" to "trace a request end-to-end". **Effort**: M

### 🟡 4.2 — Silent ETAPI Failures in Brain Dump
**Current**: [brain-dump.ts:L104-L108](file:///home/allmaker/projects/allknower/AllKnower/src/pipeline/brain-dump.ts#L104-L108) catches entity-level ETAPI errors and puts them in `skipped`, but the caller doesn't get detailed error info about *why* the skip happened.  
**Fix**: Include error category (auth, network, ETAPI validation) in skipped entries. Consider retrying transient ETAPI failures.  
**Impact**: Better user feedback, fewer silent data losses. **Effort**: S

### 🟡 4.3 — No LLM Response Streaming
**Current**: Every LLM call ([callWithFallback](file:///home/allmaker/projects/allknower/AllKnower/src/pipeline/model-router.ts#87-141)) waits for the full response. For large brain dumps, this can be 15–30+ seconds of user silence.  
**Fix**: The SDK supports `stream: true`. Stream the response in chunks and send partial updates via SSE to the frontend.  
**Impact**: Dramatically better perceived latency for users. **Effort**: L

---

## 5. Architectural Improvements

### 🔴 5.1 — SQL Injection in LanceDB Delete  
**Current**: [lancedb.ts:L55](file:///home/allmaker/projects/allknower/AllKnower/src/rag/lancedb.ts#L55) — `table.delete(\`noteId = '${noteId}'\`)` — string interpolation in a filter expression.  
**Fix**: Use parameterized filters if LanceDB supports them, or at minimum sanitize the noteId (strip quotes, validate format).  
**Impact**: Security. **Effort**: S

### 🟡 5.2 — Embedder Has Hardcoded Dimension Count
**Current**: [embedder.ts:L26](file:///home/allmaker/projects/allknower/AllKnower/src/rag/embedder.ts#L26) — `EMBEDDING_DIMENSIONS = 3072` is hardcoded. Switching models requires a code change + full reindex.  
**Fix**: Derive dimension from the first embedding response, or look it up from an env var / model config table. Store dimension in `AppConfig` so reindex can auto-detect mismatches.  
**Impact**: Model flexibility. **Effort**: S

### 🟡 5.3 — No Idempotency on Brain Dump
**Current**: If the same raw text is submitted twice (e.g., user double-clicks), you get duplicate lore entries.  
**Fix**: Hash the raw text, check `BrainDumpHistory` for a recent entry with the same hash, and return the cached result. Add a `rawTextHash` column.  
**Impact**: Data integrity. **Effort**: S

### 🟢 5.4 — Background Task Error Swallowing
**Current**: [brain-dump.ts route:L30](file:///home/allmaker/projects/allknower/AllKnower/src/routes/brain-dump.ts#L30) — `backgroundTasks.addTask(indexNote, noteId)` — if indexing fails silently, the user never knows their lore isn't searchable.  
**Fix**: Add error tracking for background tasks. Write failures to a `FailedTask` table or a dead-letter queue. Surface on the health endpoint.  
**Impact**: Reliability awareness. **Effort**: M

---

## 6. New Capabilities

### 🟡 6.1 — Autocomplete LLM Fallback (Planned, Not Wired)
**Current**: Autocomplete env vars exist (`AUTOCOMPLETE_MODEL` etc.) but the `/suggest/autocomplete` endpoint never calls the LLM — it only does SQL prefix match + LanceDB semantic search.  
**Fix**: Add an LLM-powered "creative completion" phase for when both prefix and semantic come up empty. Useful for fuzzy/conceptual queries like "the dark lord's weapon".  
**Impact**: Smarter autocomplete. **Effort**: M

### 🟡 6.2 — OpenRouter Plugins (Web Search, Auto-Router)
**Current**: Not using any OpenRouter plugins.  
**Fix**: The SDK supports `plugins` array — e.g., `{ id: "auto-router", enabled: true }` for intelligent model selection per-request, or `{ id: "response-healing" }` to auto-fix malformed JSON responses.  
**Impact**: `response-healing` alone could eliminate many JSON parse failures for free. **Effort**: S

### 🟢 6.3 — Multi-Turn Conversations for Lore Refinement
**Current**: All LLM calls are single-turn (system + user). No memory of previous interactions.  
**Fix**: For iterative workflows (e.g., "refine this character"), support multi-turn by passing previous messages. Store conversation state in the session or DB.  
**Impact**: Richer creative workflows. **Effort**: L

### 🟢 6.4 — Diff-Based Updates Instead of Full Overwrites
**Current**: Brain dump's `action: "update"` replaces the entire note content via [setNoteContent](file:///home/allmaker/projects/allknower/AllKnower/src/etapi/client.ts#118-126). No merging with existing content.  
**Fix**: Fetch existing content, diff it with LLM-generated content, and merge intelligently. Show the user what changed.  
**Impact**: Preserves manual edits the user made directly in AllCodex. **Effort**: L

---

## Priority Matrix

| # | Item | Impact | Effort | Quick Win? |
|---|---|---|---|---|
| 1.1 | Batch embeddings | 🔴 | S | ✅ |
| 2.1 | Cache-friendly prompts for all tasks | 🔴 | S | ✅ |
| 5.1 | LanceDB injection fix | 🔴 | S | ✅ |
| 4.1 | Structured logging + trace IDs | 🔴 | M | |
| 1.2 | Semantic chunking | 🔴 | M | |
| 2.2 | JSON schema enforcement | 🟡 | M | |
| 2.3 | Response validation on all routes | 🟡 | S | ✅ |
| 1.4 | Consolidate to OpenRouter SDK for embeddings | 🟡 | S | ✅ |
| 1.5 | Relevance threshold | 🟡 | S | ✅ |
| 3.2 | Request timeouts | 🟡 | S | ✅ |
| 5.3 | Brain dump idempotency | 🟡 | S | ✅ |
| 6.2 | Enable response-healing plugin | 🟡 | S | ✅ |
| 3.1 | Token/cost tracking | 🟡 | M | |
| 2.4 | RAG-based consistency check | 🟡 | M | |
| 3.3 | Provider preferences | 🟢 | S | ✅ |
| 1.3 | Chunk deduplication | 🟡 | S | ✅ |
| 5.2 | Dynamic embedding dimensions | 🟡 | S | ✅ |
| 1.6 | Staleness detection | 🟢 | M | |
| 4.3 | LLM response streaming | 🟡 | L | |
| 6.1 | Autocomplete LLM phase | 🟡 | M | |
| 6.3 | Multi-turn conversations | 🟢 | L | |
| 6.4 | Diff-based updates | 🟢 | L | |
