# Clara — Design Document

## Project Overview

Clara is a presentation telemetry platform that records a user giving a talk over their slides and produces a per-slide diagnostic breakdown of observable speaking behaviors. The system emphasizes objective, measurable metrics over subjective quality judgments.

Originally built for HooHacks 2026 (Education track, Snowflake sponsor prize). Now a personal project — Snowflake Cortex has been replaced with OpenAI Chat Completions.

## Goals

- Record a presentation (audio + slide navigation) and transcribe it
- Compute objective speaking metrics per slide: WPM, filler words, pauses, repetition
- Generate structured, specific LLM feedback per slide using OpenAI Chat Completions
- Display slide-by-slide telemetry in a clean, information-dense UI
- Provide post-recording coaching: a 3-tip debrief and an "Ask Clara" chat side drawer grounded in the user's own data
- Let users compare practice attempts side-by-side

## Non-Goals

- No webcam/video tracking
- No user authentication or accounts
- No presentation history or persistence
- No real-time streaming transcription
- No subjective quality scores ("you were great!")

## System Philosophy

**Telemetry-first**: Clara is game film review for presentations. Every output must be traceable to an observable behavior in the recording. Metrics are computed algorithmically where possible. LLM feedback must reference specific, concrete observations — not generic advice.

**Contract-driven development**: The API spec is the single source of truth. Frontend and backend teams develop independently against shared contracts. No deviation allowed.

**Hackathon-feasible**: Single FastAPI server, no database, no auth, no deployment orchestration. Everything runs locally.

## Architecture Overview

```
Frontend (React 19 + Vite + TS)
    │
    │ POST /api/presentations (multipart: audio + metadata + optional PDF)
    │
    ▼
FastAPI Server
    ├── Gateway (receives upload, orchestrates pipeline, owns chat history)
    ├── OpenAI Whisper API (transcription)
    ├── Slide Indexer (maps transcript to slides)
    ├── PyMuPDF extractor (optional, pulls per-slide text from uploaded PDF)
    ├── Manual Analytics Module (objective metrics)
    ├── OpenAI Chat Completions (per-slide LLM feedback + observations)
    ├── Aggregator (combines outputs)
    └── OpenAI Chat Completions (post: coaching summary + chat replies)
    │
    │ GET /api/presentations/{id}/results, /audio
    │ POST /api/presentations/{id}/chat
    │
    ▼
Frontend Results / Compare views (carousel + audio timeline + chat + debrief)
```

## Service Separation

All processing runs within a single FastAPI application, organized as internal modules:

| Module | Responsibility |
|--------|---------------|
| `gateway` | Receives upload, assigns presentation ID, orchestrates pipeline, extracts PDF text, serves results / audio / chat |
| `transcriber` | Calls OpenAI Whisper API, returns raw transcript |
| `indexer` | Maps Whisper word-level timestamps to slide boundaries |
| `manual_analytics` | Computes WPM, fillers, pauses, repetition per slide |
| `llm_feedback` | Calls OpenAI Chat Completions for per-slide feedback + observations, coaching summary, and chat replies |
| `aggregator` | Merges manual metrics + LLM feedback + observations into final output |

## Processing Pipeline

1. Frontend records audio via MediaRecorder API
2. User completes presentation, frontend sends audio blob + slide timestamps + expectations + optional PDF
3. Backend receives upload, generates presentation UUID
4. Audio sent to OpenAI Whisper API → word-level transcript
5. Indexer maps words to slides using slide-switch timestamps
6. If PDF provided, PyMuPDF extracts per-slide text for SLIDE_READING + CONTENT_COVERAGE grounding
7. Manual analytics + OpenAI per-slide feedback run in parallel via `asyncio.gather`
8. Aggregator merges all three outputs into slide-indexed JSON
9. Post-aggregation: OpenAI generates 3 coaching tips, attached to results (best-effort)
10. Frontend polls for results, then renders slide-by-slide telemetry; user can ask follow-ups via `/chat`

## Constraints

- **OpenAI required**: All LLM inference (feedback, coaching, chat) goes through OpenAI Chat Completions. Default model `gpt-5.4-mini`, configurable via `OPENAI_MODEL`.
- **No database**: All state is in-memory; results exist only until server restart
- **No auth**: Single-user, no sessions
- **Single audio file**: Complete recording uploaded after presentation ends
- **Poll-based processing**: Frontend polls for completion every 2s; backend runs pipeline stages sequentially, except manual analytics and LLM feedback which run in parallel
- **Slide IDs are zero-indexed strings**: `slide_0`, `slide_1`, etc.
- **Presentation IDs are UUIDs**: Generated server-side

## Telemetry-First Philosophy

Every metric and feedback item must satisfy one of:
1. **Directly computable** from transcript data (WPM, word count, pause duration, filler count)
2. **Observable in the transcript** and cited by the LLM (repetition across slides, unclear phrasing with quoted text)

Rejected outputs:
- "Good job on this slide" (no observable basis)
- "Try to be more engaging" (subjective, not measurable)
- Numerical scores for abstract qualities (confidence: 7/10)

## High-Level Data Flow

```
Audio Blob ──► Whisper API ──► Raw Transcript (word-level timestamps)
                                      │
Slide Timestamps ─────────────────────┤
                                      ▼
                              Slide-Indexed Transcript
                  PDF (opt.) ──► PyMuPDF ──► Slide Texts
                              ┌───────┴───────────────┐
                              ▼                       ▼
                     Manual Analytics       OpenAI per-slide
                     (metrics JSON)         (feedback + observations)
                              └───────┬───────────────┘
                                      ▼
                              Aggregated Results
                                      │
                                      ▼
                         OpenAI Coaching Summary (post)
                                      │
                                      ▼
                              Frontend Display
                                      │
                                      ▼
                         OpenAI Chat Replies (on demand)
```

## Component Responsibilities

### Frontend
- PDF slide rendering (react-pdf)
- Audio recording (MediaRecorder API)
- Slide navigation tracking (timestamp capture on click)
- Presentation expectations form
- Upload orchestration
- Polling for results
- Slide-by-slide results display (carousel + audio timeline + transcript + feedback)
- Coaching summary panel, content-coverage checklist, and "Ask Clara" chat drawer
- Comparison view for two practice attempts side by side

### Backend
- Audio receipt and Whisper transcription
- Optional PDF slide-text extraction (PyMuPDF)
- Transcript-to-slide mapping
- Algorithmic metric computation
- LLM prompt construction and OpenAI Chat Completions calls (feedback, coaching, chat)
- Result aggregation and serving (results, audio, chat)
