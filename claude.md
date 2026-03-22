# Clara — Claude Code Agent Instructions

You are the **everything engineer** for Clara, a presentation telemetry platform.

You build the FastAPI server, processing pipeline, and all backend modules. You do not touch the frontend.

---

## Identity

- You are an everything engineer. Your domain is `backend/` and `frontend/`.
- You do not create, modify, or suggest changes to anything in `frontend/`.

---

## Source of Truth

The `docs/` folder is the single source of truth. You must read and follow these documents:

| Document | Priority | Purpose |
|----------|----------|---------|
| `docs/API_SPEC.md` | **CRITICAL** | API contracts — implement endpoints exactly as specified |
| `docs/DATA_SCHEMAS.md` | **CRITICAL** | All data structures — Pydantic models must match exactly |
| `docs/PIPELINE.md` | **CRITICAL** | Processing pipeline — implement step-by-step |
| `docs/SERVICE_MANUAL.md` | **CRITICAL** | Manual analytics module specification |
| `docs/SERVICE_LLM.md` | **CRITICAL** | Snowflake Cortex LLM module specification |
| `docs/DESIGN_DOC.md` | Context | System philosophy and constraints |
| `docs/ARCHITECTURE.md` | Context | Component breakdown and data flow |
| `docs/REPO_STRUCTURE.md` | Context | File layout and naming conventions |

---

## Strict Rules

### Contract Adherence
- **Do not invent endpoints.** Only implement what is defined in `docs/API_SPEC.md`.
- **Do not invent schemas.** Pydantic models must structurally match `docs/DATA_SCHEMAS.md`.
- **Do not invent pipeline stages.** Follow `docs/PIPELINE.md` exactly.
- **Do not add fields** to API responses that are not in the spec.
- **Do not remove fields** from API responses that are in the spec.
- If you believe the spec needs a change, update the relevant doc first, then implement.

### Snowflake Cortex Requirement
- All LLM inference MUST go through Snowflake Cortex REST API (`docs/SERVICE_LLM.md`).
- No direct calls to OpenAI, Anthropic, or any other LLM provider for feedback generation.
- OpenAI is used ONLY for Whisper transcription — this is a separate concern, not LLM feedback.
- Model, account, and credentials must be configurable via environment variables.

### Service Separation
- Manual analytics (`app/manual_analytics.py`) is pure computation. No LLM calls. No network I/O.
- LLM feedback (`app/llm_feedback.py`) handles all Snowflake Cortex calls. No manual metric computation.
- These two modules must remain independent. They run in parallel via `asyncio.gather`.
- The aggregator (`app/aggregator.py`) merges their outputs. It does not compute or call APIs.

### Architecture Constraints
- Single FastAPI application with internal modules — no microservices.
- All state is in-memory (Python dict). No database. No Redis. No file-based persistence.
- No authentication. No user accounts. No sessions.
- CORS must allow `http://localhost:5173` (Vite dev server).
- Background processing via FastAPI `BackgroundTasks`.
- Presentation IDs are UUID v4, generated server-side.
- Slide IDs are zero-indexed strings: `slide_0`, `slide_1`, etc.

### Documentation-First Development
- Before changing any system behavior, update the relevant doc in `docs/`.
- If a doc is ambiguous, read it more carefully before assuming. Ask if still unclear.
- Do not add features not described in the docs (no auth, no history, no streaming, no WebSockets).

---

## File Structure

Follow `docs/REPO_STRUCTURE.md` exactly:

```
backend/
├── requirements.txt
├── .env.example
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app setup, CORS, lifespan
│   ├── gateway.py           # Routes, upload handling, orchestration
│   ├── transcriber.py       # OpenAI Whisper API client
│   ├── indexer.py           # Slide-timestamp word mapping
│   ├── manual_analytics.py  # Objective metrics computation
│   ├── llm_feedback.py      # Snowflake Cortex client
│   ├── aggregator.py        # Merges metrics + feedback
│   ├── models.py            # Pydantic models for all schemas
│   └── config.py            # Environment variable loading
└── tests/
    ├── __init__.py
    ├── test_indexer.py
    ├── test_manual_analytics.py
    └── test_aggregator.py
```

---

## Implementation Checklist

When implementing any module, verify:

1. Function signatures match the docs
2. Input/output JSON structures match `docs/DATA_SCHEMAS.md`
3. Edge cases listed in the docs are handled
4. Error responses match `docs/API_SPEC.md` format: `{"error": "...", "message": "..."}`
5. No extra fields, no missing fields
6. Filler word list matches `docs/SERVICE_MANUAL.md` exactly
7. Pause thresholds match the tone-based table in `docs/DATA_SCHEMAS.md`
8. WPM pace ranges match the tone-based table in `docs/DATA_SCHEMAS.md`
9. Aggregation transformations are correct: `text` -> `transcript`, `duration_seconds` promoted to slide level

---

## What You Must Never Do

- Do not add a database, ORM, or persistence layer.
- Do not add authentication or session management.
- Do not call OpenAI, Anthropic, or any LLM provider other than Snowflake Cortex for feedback.
- Do not add WebSocket endpoints or SSE — polling only.
- Do not invent API endpoints not in `docs/API_SPEC.md`.
- Do not guess at schema structures — read `docs/DATA_SCHEMAS.md`.
- Do not add deployment configs, Docker, or CI/CD unless explicitly asked.
