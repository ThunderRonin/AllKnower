# AllKnower

The intelligence layer behind [AllCodex](https://github.com/ThunderRonin/AllCodex) — an AI orchestration service for managing the **All Reach** fantasy world grimoire.

Built with **Elysia** on **Bun**.

---

## What it does

AllKnower sits behind AllCodex and provides:

| Feature | Description |
|---|---|
| **Brain Dump** | Paste raw worldbuilding notes → LLM extracts structured lore entities → creates/updates notes in AllCodex via ETAPI |
| **Local RAG** | All lore is embedded (Ollama) and stored in LanceDB. Semantically similar lore is injected as context on every brain dump to prevent contradictions |
| **Consistency Checker** | On-demand scan for contradictions, timeline conflicts, orphaned references, and naming inconsistencies |
| **Relationship Suggester** | After creating an entity, suggests connections to existing lore via semantic similarity |
| **Lore Gap Detector** | Identifies underdeveloped areas ("12 characters, only 2 locations") |

---

## Stack

| Layer | Tech |
|---|---|
| Runtime | Bun |
| Framework | Elysia |
| Database | PostgreSQL + Prisma |
| Auth | better-auth |
| Vector DB | LanceDB (embedded, no separate server) |
| Embeddings | Ollama `nomic-embed-text` (local) · Google `gemini-embedding-001` (fallback) |
| LLM — Brain Dump | `x-ai/grok-4.1-fast` via OpenRouter |
| LLM — Consistency | `moonshotai/kimi-k2.5` via OpenRouter |
| API Docs | Scalar at `/reference` |
| Type Safety | Zod (schemas → types, route validation, LLM output parsing) |

---

## Getting started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.2
- PostgreSQL
- [Ollama](https://ollama.ai) with `nomic-embed-text` pulled
- A running AllCodex instance with an ETAPI token
- An [OpenRouter](https://openrouter.ai) API key

### Setup

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# Fill in DATABASE_URL, OPENROUTER_API_KEY, ALLCODEX_ETAPI_TOKEN, BETTER_AUTH_SECRET

# 3. Run database migrations
bun db:migrate

# 4. Start the server
bun dev
```

Server starts at `http://localhost:3001`.
API docs at `http://localhost:3001/reference`.

---

## Environment variables

See [`.env.example`](.env.example) for the full list. Required vars:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `ALLCODEX_ETAPI_TOKEN` | AllCodex ETAPI token (from AllCodex settings) |
| `BETTER_AUTH_SECRET` | Random secret ≥ 16 chars for session signing |

---

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/brain-dump` | Process raw worldbuilding text |
| `GET` | `/brain-dump/history` | Last 20 brain dump operations |
| `POST` | `/rag/query` | Semantic search over lore index |
| `POST` | `/rag/reindex/:noteId` | Reindex a single note |
| `POST` | `/rag/reindex` | Full corpus reindex |
| `GET` | `/rag/status` | Index stats |
| `POST` | `/consistency/check` | Run consistency scan |
| `POST` | `/suggest/relationships` | Suggest lore connections |
| `GET` | `/suggest/gaps` | Detect lore gaps |
| `GET` | `/health` | Service health (AllCodex, Ollama, LanceDB, Postgres) |
| `GET` | `/reference` | Scalar API docs |

---

## Project structure

```
src/
├── index.ts              # App entry point
├── env.ts                # Typesafe env schema
├── auth/                 # better-auth setup
├── db/                   # Prisma client
├── etapi/                # AllCodex ETAPI client
├── pipeline/
│   ├── brain-dump.ts     # Main orchestrator
│   ├── prompt.ts         # LLM calls (callLLM with per-task model selection)
│   └── parser.ts         # Zod-powered LLM response parser
├── plugins/              # Elysia infrastructure plugins
├── rag/
│   ├── embedder.ts       # Ollama + OpenRouter embeddings
│   ├── lancedb.ts        # Vector store
│   └── indexer.ts        # Index management
├── routes/               # API route handlers
└── types/
    └── lore.ts           # Zod schemas (single source of truth for all types)
```

---

## License

MIT
