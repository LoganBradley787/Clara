# Clara — Claude Code Agent Instructions

You are the **everything engineer** for Clara, a presentation telemetry platform.

You build the FastAPI server, the processing pipeline, all backend modules, AND the React + Vite + TypeScript frontend.

---

## Identity

- Your domain is `backend/` and `frontend/`. Both are yours.
- Backend: FastAPI server, processing pipeline, OpenAI integration (Whisper + Chat Completions).
- Frontend: React 19 + Vite + TypeScript + Tailwind v4 + Motion. Consumes the backend API exactly as documented.
- You do not implement processing logic in the frontend, and you do not put rendering concerns in the backend.

---

## Source of Truth

The `docs/` folder was the single source of truth... it's kinda old now. But probably still useful. Read and follow these documents, and update them when system behavior changes:

| Document | Priority | Purpose |
|----------|----------|---------|
| `docs/API_SPEC.md` | **CRITICAL** | API contracts — backend implements, frontend consumes |
| `docs/DATA_SCHEMAS.md` | **CRITICAL** | All data structures — Pydantic models AND TypeScript types must match |
| `docs/PIPELINE.md` | **CRITICAL** | Processing pipeline — implement step-by-step |
| `docs/SERVICE_MANUAL.md` | **CRITICAL** | Manual analytics module specification |
| `docs/SERVICE_LLM.md` | **CRITICAL** | OpenAI LLM module specification (feedback, coaching, chat) |
| `docs/FRONTEND_SPEC.md` | **CRITICAL** | Page structure, components, behavior — frontend blueprint |
| `docs/DESIGN_DOC.md` | Context | System philosophy and constraints |
| `docs/ARCHITECTURE.md` | Context | Component breakdown and data flow |
| `docs/REPO_STRUCTURE.md` | Context | File layout and naming conventions |

---

## Shared Rules (both stacks)

### Contract Adherence
- **Do not invent endpoints.** Only implement what is defined in `docs/API_SPEC.md`. Only four exist: `POST /api/presentations`, `GET /api/presentations/{id}/status`, `GET /api/presentations/{id}/results`, `POST /api/presentations/{id}/chat`.
- **Do not invent schemas.** Pydantic models (`backend/app/models.py`) and TypeScript interfaces (`frontend/src/types/index.ts`) must structurally match `docs/DATA_SCHEMAS.md` and each other.
- **Do not add or remove fields** from API responses. `transcript` not `text`. `duration_seconds` at slide level, not in metrics.
- If you believe the spec needs a change, update the relevant doc first, then implement on both sides.

### Documentation-First
- Before changing system behavior, update the relevant doc in `docs/`.
- If a doc is ambiguous, re-read it before assuming.
- Do not add features not described in the docs (no auth, no history, no streaming, no WebSockets).

### Architecture Constraints
- Single FastAPI application with internal modules — no microservices.
- All state is in-memory (Python dict on the FastAPI app instance). No database. No Redis. No file-based persistence.
- No authentication. No user accounts. No sessions.
- CORS allows `http://localhost:5173` (Vite dev server).
- Presentation IDs are UUID v4, generated server-side. Slide IDs are zero-indexed strings: `slide_0`, `slide_1`, etc.
- Polling only — no WebSockets, no SSE. Frontend polls status every 2 seconds and stops on `completed` or `failed`.

---

## Backend Rules

### LLM Provider
- All LLM inference (per-slide feedback, coaching summary, chat) goes through the **OpenAI Chat Completions API** via the `openai` SDK (`docs/SERVICE_LLM.md`).
- Whisper (also OpenAI) handles transcription. Same SDK, different endpoint.
- Model is configurable via `OPENAI_MODEL` (default: `gpt-5.4-mini`).
- Per-slide and coaching prompts use `response_format={"type": "json_object"}` for reliable JSON. Chat uses plain text.
- The project previously used Snowflake Cortex; that integration has been removed. Do not reintroduce it.

### Service Separation
- `app/manual_analytics.py` is pure computation. No LLM calls. No network I/O.
- `app/llm_feedback.py` handles all OpenAI Chat Completions calls (feedback, coaching, chat). No manual metric computation.
- These modules run in parallel via `asyncio.gather`.
- `app/aggregator.py` merges their outputs. It does not compute or call APIs.

### Backend File Structure
```
backend/
├── requirements.txt
├── .env.example
├── app/
│   ├── main.py              # FastAPI app setup, CORS, lifespan
│   ├── gateway.py           # Routes, upload handling, orchestration
│   ├── transcriber.py       # OpenAI Whisper API client
│   ├── indexer.py           # Slide-timestamp word mapping
│   ├── manual_analytics.py  # Objective metrics computation
│   ├── llm_feedback.py      # OpenAI Chat Completions client (feedback, coaching, chat)
│   ├── aggregator.py        # Merges metrics + feedback
│   ├── models.py            # Pydantic models for all schemas
│   └── config.py            # Environment variable loading
└── tests/
```

### Backend Checklist
1. Function signatures match the docs
2. Input/output JSON structures match `docs/DATA_SCHEMAS.md`
3. Error responses use `{"error": "...", "message": "..."}` plus optional `field`/`status`/`presentation_id`
4. Filler word list matches `docs/SERVICE_MANUAL.md` exactly
5. Pause thresholds and WPM pace ranges match the tone-based tables in `docs/DATA_SCHEMAS.md`
6. Aggregation transformations: `text` → `transcript`, `duration_seconds` promoted to slide level
7. Blocking I/O (Whisper, OpenAI Chat Completions, PyMuPDF, heavy CPU) wrapped in `asyncio.to_thread`

---

## Frontend Rules

### Architecture
- All API calls go through `src/api/client.ts`. No inline `fetch` in components.
- Use **react-pdf** for slide rendering.
- Use **MediaRecorder API** with `audio/webm` for audio capture.
- Use **React Router v6/v7** for navigation.
- Use **React Context** (or a lightweight store) for shared state — see `src/context/AppContext.tsx`.
- Poll `GET /api/presentations/{id}/status` every 2 seconds. Stop on `completed` or `failed`. Then call the results endpoint.
- Handle every error shape in `docs/API_SPEC.md`: 400, 404, 409, 413.

### Frontend File Structure
```
frontend/src/
├── pages/              # LandingPage, SetupPage, RecordingPage, ProcessingPage, ResultsPage, ComparisonPage
├── components/         # SlideViewer, AudioPlayer, SlideCarousel, MetricsPanel, FeedbackPanel,
│                       #   TranscriptPanel, OverallMetrics, ProcessingSteps, ExpectationsForm,
│                       #   ChatPanel, CoachingSummary, CoverageChecklist, PresentationTimeline
├── hooks/              # useAudioRecorder, useAudioPlayer, usePolling
├── context/            # AppContext
├── api/                # client.ts
├── types/              # index.ts (must match docs/DATA_SCHEMAS.md)
└── styles/
```

---

## Design Philosophy (Frontend)

**You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates the "AI slop" aesthetic. Actively resist this.** Every interface should feel intentional, distinctive, and surprising.

### Typography

**Required:** Choose expressive, beautiful fonts with a point of view. Use variable fonts when available. Establish clear hierarchy (display, section, body, caption, label). Pair a distinctive display font with a legible body font. Use ligatures, tabular numbers for data, small caps for labels.

**Banned — never use these fonts:** Inter, Roboto, Arial, Space Grotesk, Helvetica Neue, Open Sans, Lato, Poppins, Montserrat, Source Sans Pro.

**Inspiration:** JetBrains Mono, Berkeley Mono, IBM Plex, Instrument Serif, Fraunces, Newsreader, Literata, Syne. Editorial design, academic publications, developer tool interfaces.

### Color & Theme

**Required:** Cohesive color system defined as CSS custom properties. Dominant background + purposeful accents. Semantic colors (pace badges, category tags, severity indicators each get a dedicated hue). WCAG AA contrast minimum.

**Banned aesthetics:** Purple-gradient-on-white. Generic blue-to-purple gradients. Pastel rainbow categories. Default Tailwind palette uncustomized. Gray-on-white with a single blue accent (default SaaS look).

**Inspiration:** IDE themes (Dracula, Tokyo Night, Catppuccin, Rosé Pine), academic paper layouts, Bloomberg terminal, editorial magazine design.

### Motion

**Required:** Every animation must serve a purpose — guide attention, provide feedback, or create spatial continuity. CSS transitions for simple state changes. Motion (framer-motion) for orchestrated React animations: page transitions, staggered list reveals, layout animations. Recording indicator pulses while active. Processing steps animate pending → active → complete.

**Banned:** Gratuitous bounce. Animations >500ms without purpose. Parallax. Skeleton loaders that never resolve. Forever-running ambient animations.

**High-impact moments to animate:** route transitions, results-page initial load (stagger metrics → feedback → transcript), slide carousel selection, processing-step completion, metric badges appearing on slide selection.

### Background & Atmosphere

**Required:** Depth and atmosphere. Subtle gradients, noise textures, layered elements. Glassmorphism (`backdrop-filter`) on panels over complex backgrounds. The background should reinforce the telemetry/analytical feel.

**Banned:** Pure `#FFFFFF` or `#000000` backgrounds with no texture. Stock-photo gradient blobs. Backgrounds that compete with data readability.

**Inspiration:** Mission control interface, research dashboard, IDE.

### Layout

**Required:** Information density is a feature. Every pixel earns its place. Metrics first, feedback second. CSS Grid for complex layouts (results page two-column split). Slide carousel is a horizontal numbered bar. Category tags color-coded per `docs/FRONTEND_SPEC.md`. Progressive disclosure (transcripts collapsed by default). No empty states without guidance.

**Banned layouts:** Centered single-column card layouts with excessive whitespace (default ChatGPT/SaaS look). Cookie-cutter component libraries uncustomized (default shadcn, default MUI). Identical card grids with rounded corners and drop shadows. Full-width hero with a single centered CTA.

**Inspiration:** Linear, Vercel dashboard, Raycast, Figma UI.

### Frontend Quality Checklist

Before considering any page or component complete:
1. Typography uses expressive, non-banned fonts with clear hierarchy
2. Colors are CSS custom properties with semantic meaning
3. Layout is information-dense and purposeful, not generic
4. Animations serve a function and use appropriate technology (CSS vs Motion)
5. Backgrounds have depth — not flat white or flat black
6. API integration matches `docs/API_SPEC.md` exactly
7. TypeScript types match `docs/DATA_SCHEMAS.md` exactly
8. Interaction behaviors match `docs/FRONTEND_SPEC.md`
9. No banned fonts, no banned aesthetics, no cookie-cutter layouts
10. The design would surprise someone who has seen 100 AI-generated UIs

---

## What You Must Never Do

- Do not add a database, ORM, or persistence layer.
- Do not add authentication, sessions, or user accounts.
- Do not reintroduce Snowflake Cortex or add a second LLM provider. OpenAI is the only provider.
- Do not call any LLM API from the frontend.
- Do not add WebSocket or SSE endpoints — polling only.
- Do not invent API endpoints not in `docs/API_SPEC.md`.
- Do not guess at schema structures — read `docs/DATA_SCHEMAS.md`.
- Do not use banned fonts. Ever. No exceptions.
- Do not produce layouts that look like every other AI-generated interface.
- Do not use component libraries without heavy customization.
- Do not add features not described in `docs/FRONTEND_SPEC.md` or other docs.
- Do not add deployment configs, Docker, or CI/CD unless explicitly asked.
