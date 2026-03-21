# Clara — Repository Structure

This defines the full directory layout and how each agent should interact with the documentation.

---

## Directory Layout

```
clara/
├── docs/
│   ├── DESIGN_DOC.md          # Master system overview
│   ├── ARCHITECTURE.md        # System diagram and component breakdown
│   ├── API_SPEC.md            # API contracts (shared source of truth)
│   ├── DATA_SCHEMAS.md        # All data structures and JSON schemas
│   ├── PIPELINE.md            # Step-by-step processing flow
│   ├── FRONTEND_SPEC.md       # Frontend implementation guide
│   ├── SERVICE_MANUAL.md      # Manual analytics module spec
│   ├── SERVICE_LLM.md         # Snowflake LLM module spec
│   └── REPO_STRUCTURE.md      # This file
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── router.tsx           # React Router configuration
│       ├── context/
│       │   └── AppContext.tsx    # Shared state (PDF, expectations, results)
│       ├── pages/
│       │   ├── LandingPage.tsx
│       │   ├── SetupPage.tsx
│       │   ├── RecordingPage.tsx
│       │   ├── ProcessingPage.tsx
│       │   └── ResultsPage.tsx
│       ├── components/
│       │   ├── SlideViewer.tsx       # react-pdf slide display
│       │   ├── AudioRecorder.tsx     # MediaRecorder wrapper
│       │   ├── SlideCarousel.tsx     # Results slide navigation
│       │   ├── MetricsPanel.tsx      # Per-slide metrics display
│       │   ├── FeedbackPanel.tsx     # Per-slide feedback display
│       │   ├── TranscriptPanel.tsx   # Collapsible transcript view
│       │   ├── OverallMetrics.tsx    # Top-bar summary metrics
│       │   ├── ProcessingSteps.tsx   # Pipeline progress display
│       │   └── ExpectationsForm.tsx  # Tone/duration/context form
│       ├── hooks/
│       │   ├── useAudioRecorder.ts   # MediaRecorder hook
│       │   └── usePolling.ts         # Status polling hook
│       ├── api/
│       │   └── client.ts            # API call functions
│       ├── types/
│       │   └── index.ts             # TypeScript interfaces matching API schemas
│       └── styles/
│           └── ...                   # CSS Modules or Tailwind config
│
├── backend/
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app setup, CORS, lifespan
│   │   ├── gateway.py           # Routes, upload handling, orchestration
│   │   ├── transcriber.py       # OpenAI Whisper API client
│   │   ├── indexer.py           # Slide-timestamp word mapping
│   │   ├── manual_analytics.py  # Objective metrics computation
│   │   ├── llm_feedback.py      # Snowflake Cortex client
│   │   ├── aggregator.py        # Merges metrics + feedback
│   │   ├── models.py            # Pydantic models for all schemas
│   │   └── config.py            # Environment variable loading
│   └── tests/
│       ├── __init__.py
│       ├── test_indexer.py
│       ├── test_manual_analytics.py
│       └── test_aggregator.py
│
├── claude.md                    # Instructions for Claude Code agent
├── .gitignore
└── README.md
```

---

## Frontend Folder (`frontend/`)

**Owner:** Cursor agent

**Key files:**
- `src/pages/` — one file per route, matches FRONTEND_SPEC.md page structure
- `src/components/` — reusable UI components
- `src/api/client.ts` — all API calls centralized here, must match API_SPEC.md exactly
- `src/types/index.ts` — TypeScript interfaces matching DATA_SCHEMAS.md

**Dependencies:**
```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^6",
    "react-pdf": "^7"
  },
  "devDependencies": {
    "typescript": "^5",
    "vite": "^5",
    "@types/react": "^18"
  }
}
```

---

## Backend Folder (`backend/`)

**Owner:** Claude Code agent

**Key files:**
- `app/main.py` — FastAPI app initialization, CORS middleware, route inclusion
- `app/gateway.py` — API routes and pipeline orchestration
- `app/models.py` — Pydantic models for all request/response schemas (derived from DATA_SCHEMAS.md)
- `app/config.py` — loads env vars for OpenAI and Snowflake

**Dependencies (`requirements.txt`):**
```
fastapi>=0.104
uvicorn>=0.24
python-multipart>=0.0.6
openai>=1.0
snowflake-connector-python>=3.0
requests>=2.31
pydantic>=2.0
python-dotenv>=1.0
```

**Environment variables (`.env.example`):**
```
OPENAI_API_KEY=sk-...
SNOWFLAKE_ACCOUNT=...
SNOWFLAKE_USER=...
SNOWFLAKE_PASSWORD=...
SNOWFLAKE_ROLE=...
SNOWFLAKE_WAREHOUSE=...
CORTEX_MODEL=mistral-large2
```

---

## Docs Folder (`docs/`)

The single source of truth for all design decisions, contracts, and specifications.

**Read matrix — which agent reads which docs:**

| Document | Cursor (Frontend) | Claude Code (Backend) |
|----------|-------------------|----------------------|
| DESIGN_DOC.md | Read for context | Read for context |
| ARCHITECTURE.md | Read for context | Read for context |
| API_SPEC.md | **Critical** — implement client | **Critical** — implement server |
| DATA_SCHEMAS.md | Read for TypeScript types | **Critical** — implement Pydantic models |
| PIPELINE.md | Read for understanding | **Critical** — implement pipeline |
| FRONTEND_SPEC.md | **Critical** — implement UI | Skip |
| SERVICE_MANUAL.md | Skip | **Critical** — implement module |
| SERVICE_LLM.md | Skip | **Critical** — implement module |
| REPO_STRUCTURE.md | Read for file layout | Read for file layout |

---

## .cursor Rules

Create `.cursor/rules` or `.cursorrules` file in the frontend directory:

```
You are building the frontend for Clara, a presentation telemetry platform.

Key references:
- docs/FRONTEND_SPEC.md — your primary implementation guide
- docs/API_SPEC.md — all API contracts (do not deviate)
- docs/DATA_SCHEMAS.md — data structures for TypeScript types

Rules:
- All API calls go through src/api/client.ts
- TypeScript interfaces must match DATA_SCHEMAS.md exactly
- Use react-pdf for slide rendering
- Use MediaRecorder API for audio capture
- Follow the page structure defined in FRONTEND_SPEC.md
- Do not add authentication, user accounts, or history features
- Do not call any LLM APIs from the frontend
```

---

## CLAUDE.md Usage

The `claude.md` file in the repo root should contain:

```
You are building the backend for Clara, a presentation telemetry platform.

Key references:
- docs/SERVICE_MANUAL.md — manual analytics module spec
- docs/SERVICE_LLM.md — Snowflake LLM module spec
- docs/API_SPEC.md — all API contracts (do not deviate)
- docs/DATA_SCHEMAS.md — data structures for Pydantic models
- docs/PIPELINE.md — processing pipeline implementation guide

Rules:
- Single FastAPI application with internal modules
- Pydantic models must match DATA_SCHEMAS.md exactly
- API endpoints must match API_SPEC.md exactly
- Use OpenAI Whisper API for transcription (not local whisper)
- Use Snowflake Cortex REST API for LLM feedback
- All state is in-memory (dict), no database
- No authentication
- CORS must allow frontend origin (http://localhost:5173)
```

---

## How Agents Should Work With Docs

### Cursor Agent (Frontend)

1. Read `FRONTEND_SPEC.md` first — this is your implementation blueprint
2. Read `API_SPEC.md` — implement the client exactly as specified
3. Read `DATA_SCHEMAS.md` — create TypeScript interfaces from these schemas
4. Follow `REPO_STRUCTURE.md` for file placement
5. Do not modify any docs files
6. Do not implement backend logic

### Claude Code Agent (Backend)

1. Read `PIPELINE.md` first — this defines the processing flow
2. Read `SERVICE_MANUAL.md` — implement the manual analytics module
3. Read `SERVICE_LLM.md` — implement the Snowflake LLM module
4. Read `API_SPEC.md` — implement endpoints exactly as specified
5. Read `DATA_SCHEMAS.md` — create Pydantic models from these schemas
6. Follow `REPO_STRUCTURE.md` for file placement
7. Do not modify any docs files
8. Do not implement frontend logic

### Contract Enforcement

- `API_SPEC.md` is the contract. Both agents must implement to this spec.
- If either agent needs a schema change, it must be discussed and reflected in the docs before implementation.
- TypeScript interfaces (frontend) and Pydantic models (backend) must be structurally identical.
