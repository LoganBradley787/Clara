# Clara — Design Document

## Project Overview

Clara is a presentation telemetry platform that records a user giving a talk over their slides and produces a per-slide diagnostic breakdown of observable speaking behaviors. The system emphasizes objective, measurable metrics over subjective quality judgments.

Built for HooHacks 2026. Targets the Education track and the Snowflake API sponsor prize.

## Goals

- Record a presentation (audio + slide navigation) and transcribe it
- Compute objective speaking metrics per slide: WPM, filler words, pauses, repetition
- Generate structured, specific LLM feedback per slide using Snowflake Cortex
- Display slide-by-slide telemetry in a clean, information-dense UI
- Support async development between a frontend agent (Cursor) and backend agent (Claude Code)
- Use Snowflake API as the LLM provider (sponsor requirement)

## Non-Goals

- No webcam/video tracking
- No chatbot or conversational AI interface
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
Frontend (React + Vite + TS)
    │
    │ POST /api/presentations (multipart: audio + metadata)
    │
    ▼
FastAPI Server
    ├── Gateway (receives upload, orchestrates pipeline)
    ├── OpenAI Whisper API (transcription)
    ├── Slide Indexer (maps transcript to slides)
    ├── Manual Analytics Module (objective metrics)
    ├── Snowflake Cortex Module (LLM feedback)
    └── Aggregator (combines outputs)
    │
    │ GET /api/presentations/{id}/results
    │
    ▼
Frontend Results View (slide carousel + side panel)
```

## Service Separation

All processing runs within a single FastAPI application, organized as internal modules:

| Module | Responsibility |
|--------|---------------|
| `gateway` | Receives upload, assigns presentation ID, orchestrates pipeline |
| `transcriber` | Calls OpenAI Whisper API, returns raw transcript |
| `indexer` | Maps Whisper word-level timestamps to slide boundaries |
| `manual_analytics` | Computes WPM, fillers, pauses, repetition per slide |
| `llm_feedback` | Calls Snowflake Cortex REST API for per-slide feedback |
| `aggregator` | Merges manual metrics + LLM feedback into final output |

## Processing Pipeline

1. Frontend records audio via MediaRecorder API
2. User completes presentation, frontend sends audio blob + slide timestamps + expectations
3. Backend receives upload, generates presentation UUID
4. Audio sent to OpenAI Whisper API → word-level transcript
5. Indexer maps words to slides using slide-switch timestamps
6. Manual analytics processes each slide's words independently
7. Snowflake Cortex processes each slide with full-presentation context
8. Aggregator merges both outputs into slide-indexed JSON
9. Frontend polls for results, then renders slide-by-slide telemetry

## Constraints

- **Snowflake API required**: All LLM processing must go through Snowflake Cortex REST API
- **No database**: All state is in-memory; results exist only until server restart
- **No auth**: Single-user, no sessions
- **Single audio file**: Complete recording uploaded after presentation ends
- **Poll-based processing**: Frontend polls for completion; backend runs pipeline stages sequentially, except manual analytics and LLM feedback which run in parallel
- **Slide IDs are zero-indexed integers**: `slide_0`, `slide_1`, etc.
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
                              ┌───────┴───────┐
                              ▼               ▼
                     Manual Analytics    Snowflake Cortex
                     (metrics JSON)      (feedback JSON)
                              └───────┬───────┘
                                      ▼
                              Aggregated Results
                                      │
                                      ▼
                              Frontend Display
```

## Component Responsibilities

### Frontend
- PDF slide rendering (react-pdf)
- Audio recording (MediaRecorder API)
- Slide navigation tracking (timestamp capture on click)
- Presentation expectations form
- Upload orchestration
- Polling for results
- Slide-by-slide results display (carousel + side panel)

### Backend
- Audio receipt and Whisper transcription
- Transcript-to-slide mapping
- Algorithmic metric computation
- LLM prompt construction and Snowflake API calls
- Result aggregation and serving
