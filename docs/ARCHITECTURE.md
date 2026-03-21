# Clara — Architecture

## System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND                            │
│              React + Vite + TypeScript                  │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────┐ │
│  │ Landing  │─►│  Setup   │─►│ Recording │─►│Results│ │
│  │  Page    │  │  Page    │  │   Page    │  │ Page  │ │
│  └──────────┘  └──────────┘  └───────────┘  └───────┘ │
│                                    │            ▲       │
│                     POST /api/presentations     │       │
│                                    │    GET .../results  │
└────────────────────────────────────┼────────────┼───────┘
                                     │            │
                                     ▼            │
┌────────────────────────────────────────────────────────┐
│                   FASTAPI SERVER                       │
│                                                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │                   GATEWAY                       │   │
│  │  • Receives multipart upload                    │   │
│  │  • Generates presentation UUID                  │   │
│  │  • Orchestrates pipeline                        │   │
│  │  • Serves results via polling endpoints         │   │
│  └─────────────┬───────────────────────────────────┘   │
│                │                                       │
│                ▼                                       │
│  ┌─────────────────────────┐                           │
│  │      TRANSCRIBER        │◄──── OpenAI Whisper API   │
│  │  • Sends audio to API   │      (external)           │
│  │  • Returns word-level   │                           │
│  │    timestamped transcript│                           │
│  └─────────────┬───────────┘                           │
│                │                                       │
│                ▼                                       │
│  ┌─────────────────────────┐                           │
│  │     SLIDE INDEXER       │                           │
│  │  • Takes slide-switch   │                           │
│  │    timestamps           │                           │
│  │  • Maps each word to    │                           │
│  │    its slide             │                           │
│  │  • Produces slide-keyed │                           │
│  │    transcript            │                           │
│  └─────────────┬───────────┘                           │
│                │                                       │
│       ┌────────┴────────┐                              │
│       ▼                 ▼                              │
│  ┌──────────┐    ┌──────────────┐                      │
│  │ MANUAL   │    │  SNOWFLAKE   │◄── Snowflake Cortex  │
│  │ANALYTICS │    │  LLM MODULE  │    REST API           │
│  │          │    │              │    (external)         │
│  │• WPM     │    │• Per-slide   │                      │
│  │• Fillers │    │  prompting   │                      │
│  │• Pauses  │    │• Structured  │                      │
│  │• Repeats │    │  feedback    │                      │
│  └────┬─────┘    └──────┬───────┘                      │
│       │                 │                              │
│       └────────┬────────┘                              │
│                ▼                                       │
│  ┌─────────────────────────┐                           │
│  │      AGGREGATOR         │                           │
│  │  • Merges manual stats  │                           │
│  │    + LLM feedback       │                           │
│  │  • Produces final       │                           │
│  │    slide-indexed JSON   │                           │
│  └─────────────────────────┘                           │
└────────────────────────────────────────────────────────┘
```

## Component Breakdown

### Frontend (React + Vite + TypeScript)

| Component | Purpose |
|-----------|---------|
| Landing Page | Title, instructions, navigation to setup |
| Setup Page | PDF upload, presentation expectations form |
| Recording Page | Slide display (react-pdf), audio recording, slide navigation |
| Results Page | Slide carousel + metrics/feedback side panel |

**Key libraries:**
- `react-pdf` — render uploaded PDF as slides
- `MediaRecorder API` — browser audio capture
- Standard fetch — API communication

### FastAPI Server (Python)

#### Gateway (`app/gateway.py`)
- Receives `POST /api/presentations` with multipart form data
- Generates UUID for presentation
- Stores processing state in-memory (dict)
- Orchestrates the full pipeline in a background task
- Serves `GET /api/presentations/{id}/status` and `GET /api/presentations/{id}/results`

#### Transcriber (`app/transcriber.py`)
- Accepts audio file bytes
- Calls OpenAI Whisper API with `response_format="verbose_json"` and `timestamp_granularities=["word", "segment"]`
- Returns raw Whisper response (word-level timestamps)

#### Slide Indexer (`app/indexer.py`)
- Accepts: Whisper word list + slide-switch timestamps
- For each word, determines which slide it belongs to by comparing `word.start` against slide boundaries
- Produces: `Dict[str, SlideTranscript]` keyed by slide ID (`slide_0`, `slide_1`, ...)

#### Manual Analytics (`app/manual_analytics.py`)
- Accepts: slide-indexed transcript + presentation expectations (tone is needed for pace benchmarks and pause thresholds)
- Computes per-slide: WPM, filler word count, filler word list, pause count, pause durations, word count, duration, repetition phrases
- Returns: `Dict[str, SlideMetrics]`

#### Snowflake LLM Module (`app/llm_feedback.py`)
- Accepts: slide-indexed transcript + presentation expectations + full transcript text (from Whisper `text` field)
- For each slide: constructs prompt with full-presentation context, asks Cortex to focus on that slide
- Calls Snowflake Cortex REST API
- Parses structured response into feedback items
- Returns: `Dict[str, SlideFeedback]`

#### Aggregator (`app/aggregator.py`)
- Accepts: slide-indexed transcript + manual metrics dict + LLM feedback dict + presentation expectations + Whisper duration
- Merges by slide ID, renames `text` → `transcript`, promotes `duration_seconds` from metrics to slide top level
- Computes overall metrics (total word count, average WPM, filler/pause totals, duration deviation)
- Returns: final `PresentationResults` JSON

## Service Interaction Flow

```
1. Frontend ──POST──► Gateway
2. Gateway ──audio──► Transcriber ──HTTP──► OpenAI Whisper API
3. Transcriber ──transcript──► Gateway
4. Gateway ──transcript + timestamps──► Indexer
5. Indexer ──slide-indexed transcript──► Gateway
6. Gateway ──slide transcript + expectations──► Manual Analytics
7. Gateway ──slide transcript + expectations + full text──► LLM Module ──HTTP──► Snowflake Cortex
8. Gateway ──both outputs──► Aggregator
9. Gateway stores results in-memory
10. Frontend ──GET──► Gateway ──results──► Frontend
```

## Data Movement

| Stage | Input | Output | External Call |
|-------|-------|--------|--------------|
| Upload | Audio blob + JSON metadata | Presentation UUID | None |
| Transcription | Audio bytes | Whisper response JSON | OpenAI Whisper API |
| Indexing | Word list + slide timestamps | Slide-keyed transcript | None |
| Manual Analysis | Slide-keyed transcript + expectations | Slide-keyed metrics | None |
| LLM Analysis | Slide-keyed transcript + expectations + full transcript text | Slide-keyed feedback | Snowflake Cortex API |
| Aggregation | Slide-keyed transcript + metrics + feedback + expectations + Whisper duration | Combined results | None |
| Results | Presentation ID | Full results JSON | None |
