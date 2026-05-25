# Clara — Architecture

## System Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                │
│      React 19 + Vite 8 + TypeScript 5.9 + Tailwind v4 + motion 12    │
│                                                                      │
│  ┌─────────┐ ┌───────┐ ┌──────────┐ ┌──────────┐ ┌────────┐         │
│  │ Landing │►│ Setup │►│Recording │►│Processing│►│Results │         │
│  │   (/)   │ │/setup │ │ /present │ │/processing│ │/results│        │
│  └─────────┘ └───────┘ └──────────┘ └──────────┘ └───┬────┘         │
│                                                       │              │
│                                              ┌────────▼──────────┐   │
│                                              │   Comparison       │  │
│                                              │ /compare/:id1/:id2 │  │
│                                              └────────────────────┘  │
│                                                                      │
│  POST /api/presentations          GET /api/.../results               │
│  GET  /api/.../status             GET /api/.../audio                 │
│  POST /api/.../chat                                                  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          FASTAPI SERVER                              │
│                    FastAPI + Pydantic 2 + Python                     │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                          GATEWAY                                │  │
│  │  • Receives multipart upload (audio + metadata + optional PDF) │  │
│  │  • Generates presentation UUID                                  │  │
│  │  • Orchestrates pipeline via BackgroundTasks                    │  │
│  │  • Serves status / results / audio / chat endpoints             │  │
│  │  • Stores per-presentation chat_history in app.presentations    │  │
│  └────────────────┬───────────────────────────────────────────────┘  │
│                   │                                                  │
│                   ▼                                                  │
│  ┌─────────────────────────┐                                         │
│  │       TRANSCRIBER       │◄──── OpenAI Whisper API (external)      │
│  │  • Sends audio to API   │                                         │
│  │  • Returns word-level   │                                         │
│  │    timestamped transcript│                                        │
│  └────────────┬────────────┘                                         │
│               │                                                      │
│               ▼                                                      │
│  ┌─────────────────────────┐                                         │
│  │     SLIDE INDEXER       │                                         │
│  │  • Takes slide-switch   │                                         │
│  │    timestamps           │                                         │
│  │  • Maps each word to    │                                         │
│  │    its slide            │                                         │
│  └────────────┬────────────┘                                         │
│               │                                                      │
│               │      ┌────────────────────────┐                      │
│               │      │  PDF TEXT EXTRACTION   │◄── PyMuPDF (fitz)    │
│               │      │  (optional, if slides  │    (in-process)      │
│               │      │   PDF was uploaded)    │                      │
│               │      └───────────┬────────────┘                      │
│               │                  │                                   │
│       ┌───────┴────────┐         │                                   │
│       ▼                ▼         ▼                                   │
│  ┌──────────┐   ┌─────────────────────────────┐                      │
│  │ MANUAL   │   │      LLM FEEDBACK MODULE    │◄── OpenAI Chat       │
│  │ANALYTICS │   │  • Per-slide flag + observ. │    Completions       │
│  │          │   │    prompts (uses PDF text + │    (external)        │
│  │• WPM     │   │    similarity if available) │                      │
│  │• Fillers │   │  • generate_llm_feedback    │                      │
│  │• Pauses  │   │    returns (feedback,       │                      │
│  │• Repeats │   │              observations)  │                      │
│  └─────┬────┘   └──────────────┬──────────────┘                      │
│        │                       │                                     │
│        └───────────┬───────────┘                                     │
│                    ▼                                                 │
│  ┌─────────────────────────────┐                                     │
│  │         AGGREGATOR          │                                     │
│  │  • Merges metrics +         │                                     │
│  │    feedback + observations  │                                     │
│  │  • Produces slide-indexed   │                                     │
│  │    PresentationResults      │                                     │
│  └──────────────┬──────────────┘                                     │
│                 │                                                    │
│                 ▼                                                    │
│  ┌─────────────────────────────┐                                     │
│  │   COACHING SUMMARY (LLM)    │◄──── OpenAI Chat Completions        │
│  │  • generate_coaching_summary│      (external)                     │
│  │  • Returns 3 prioritized    │                                     │
│  │    tips; gateway assigns to │                                     │
│  │    results.coaching_summary │                                     │
│  └─────────────────────────────┘                                     │
│                                                                      │
│  ┌─────────────────────────────┐                                     │
│  │      CHAT (post-results)    │◄──── OpenAI Chat Completions        │
│  │  • POST /chat per ID        │      (external)                     │
│  │  • generate_chat_response   │                                     │
│  │  • chat_history kept in     │                                     │
│  │    app.presentations[id]    │                                     │
│  └─────────────────────────────┘                                     │
│                                                                      │
│  ┌─────────────────────────────┐                                     │
│  │      AUDIO (post-results)   │                                     │
│  │  • GET /audio per ID        │                                     │
│  │  • Streams the cached       │                                     │
│  │    audio_bytes back to UI   │                                     │
│  └─────────────────────────────┘                                     │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### Frontend (React 19 + Vite 8 + TypeScript 5.9)

| Component | Route | Purpose |
|-----------|-------|---------|
| Landing Page | `/` | Title, instructions, navigation to setup |
| Setup Page | `/setup` | PDF upload, presentation expectations form |
| Recording Page | `/present` | Slide display (react-pdf), audio recording, slide navigation |
| Processing Page | `/processing` | Polls `/status` and renders pipeline stage progress |
| Results Page | `/results/:id` | Slide carousel, metrics/feedback panel, coaching summary, chat, audio playback |
| Comparison Page | `/compare/:id1/:id2` | Frontend-only diff: fetches two completed presentations via `/results` and compares metrics/feedback side-by-side |

**Key libraries:**
- `react` 19, `react-dom` 19
- `react-router-dom` 7 — client-side routing
- `react-pdf` 10 — renders uploaded PDF as slides
- `tailwindcss` v4 — utility-first styling
- `motion` 12 — animations / transitions
- `vite` 8 + `typescript` 5.9 — build + types
- `MediaRecorder` API — browser audio capture
- `fetch` — API communication (polling, no WebSockets/SSE)

### FastAPI Server (Python + Pydantic 2)

#### Gateway (`app/gateway.py`)
- Receives `POST /api/presentations` with multipart form data (audio + JSON metadata + optional slides PDF)
- Generates UUID for presentation
- Stores processing state, results, audio bytes, and chat history in-memory (`app.presentations` dict)
- Drives `_run_pipeline` in a background task; updates `stage` between each step
- Serves `GET /api/presentations/{id}/status`, `GET /api/presentations/{id}/results`, `GET /api/presentations/{id}/audio`
- Serves `POST /api/presentations/{id}/chat` for follow-up Q&A about completed results
- After aggregation, invokes the coaching summary LLM call and assigns the result to `results.coaching_summary`

#### Transcriber (`app/transcriber.py`)
- Accepts audio file path
- Calls OpenAI Whisper API with `response_format="verbose_json"` and `timestamp_granularities=["word", "segment"]`
- Returns Whisper response (word-level timestamps + full text + duration)

#### Slide Indexer (`app/indexer.py`)
- Accepts: Whisper word list + slide-switch timestamps + total slides + recording duration
- For each word, determines which slide it belongs to by comparing `word.start` against slide boundaries
- Produces: `Dict[str, SlideTranscript]` keyed by slide ID (`slide_0`, `slide_1`, ...)

#### PDF Text Extraction (in `app/gateway.py`, via PyMuPDF)
- Only runs when the user uploaded a slides PDF alongside the audio
- `_extract_slide_texts(pdf_bytes, total_slides)` opens the PDF with `fitz`, pulls per-page text, and returns a `Dict[str, str]` keyed by slide ID
- Runs in a thread (`asyncio.to_thread`) before the analyze stage; the result is fed into the LLM feedback module for `SLIDE_READING` and `CONTENT_COVERAGE` evaluation

#### Manual Analytics (`app/manual_analytics.py`)
- Accepts: slide-indexed transcript + presentation expectations (tone drives pace benchmarks and pause thresholds)
- Computes per-slide: WPM, filler word count, filler word list, pause count, pause durations, word count, duration, repetition phrases
- Returns: `Dict[str, SlideMetrics]`
- Pure computation — no network I/O

#### LLM Feedback Module (`app/llm_feedback.py`)
All LLM calls go through OpenAI Chat Completions using the model configured by `OPENAI_MODEL` (default `gpt-5.4-mini`). Three exported functions:

- **`generate_llm_feedback(slide_transcript, expectations, full_text, slide_texts) -> Tuple[Dict[str, SlideFeedback], Dict[str, SlideObservations]]`**
  - Pre-computes cross-slide repeated n-grams and per-slide PDF↔transcript similarity scores
  - For each slide, builds an evidence-grounded prompt and calls OpenAI for `flags` + `observations`
  - Post-validates output (quote verification, banned-phrase filter, type/threshold checks) and returns both dicts
- **`generate_coaching_summary(results) -> List[CoachingTip]`**
  - Called by the gateway after aggregation
  - Sends the full per-slide breakdown + transcript to OpenAI; returns up to 3 prioritized tips
- **`generate_chat_response(results, chat_history, user_message) -> str`**
  - Backs `POST /chat`; injects the same presentation context into the system prompt and replays the per-presentation chat history before the new user message

#### Aggregator (`app/aggregator.py`)
- Accepts: slide-indexed transcript + manual metrics + LLM feedback + expectations + Whisper duration + `observations` dict + `presentation_id`
- Merges by slide ID, renames `text` → `transcript`, promotes `duration_seconds` from metrics to the slide top level
- Attaches per-slide `observations` from the LLM observations dict
- Computes overall metrics (total word count, average WPM, filler/pause totals, duration deviation)
- Returns: `PresentationResults` with `coaching_summary` left as the default (the gateway populates it after a separate `generate_coaching_summary` call)

## External Systems

| System | Purpose | Where |
|--------|---------|-------|
| OpenAI Whisper API | Audio → word-level transcript | `app/transcriber.py` |
| OpenAI Chat Completions | LLM feedback, coaching summary, chat | `app/llm_feedback.py` |
| PyMuPDF (`fitz`) | Per-page PDF text extraction | `app/gateway.py` (in-process library, not a network call) |

## Service Interaction Flow

```
 1. Frontend ──POST──► Gateway (audio + metadata + optional PDF)
 2. Gateway ──audio──► Transcriber ──HTTP──► OpenAI Whisper API
 3. Transcriber ──transcript──► Gateway
 4. Gateway ──words + slide timestamps──► Indexer
 5. Indexer ──slide-indexed transcript──► Gateway
 6. (optional) Gateway ──pdf bytes──► PDF text extraction (PyMuPDF) ──slide_texts──► Gateway
 7. Gateway runs in parallel (asyncio.gather):
       a. Manual Analytics ──► slide metrics
       b. LLM Feedback ──HTTP──► OpenAI Chat Completions ──► (feedback, observations)
 8. Gateway ──metrics + feedback + observations + expectations──► Aggregator ──► PresentationResults
 9. Gateway ──results──► generate_coaching_summary ──HTTP──► OpenAI Chat Completions
       Gateway assigns the returned tips to results.coaching_summary
10. Gateway stores results in app.presentations[id]; status = completed
11. Frontend ──GET /status──► Gateway (polled during steps 1-10)
12. Frontend ──GET /results──► Gateway ──results──► Frontend
13. Frontend ──GET /audio──► Gateway ──cached audio bytes──► Frontend (playback)
14. Frontend ──POST /chat──► Gateway ──HTTP──► OpenAI Chat Completions
       chat_history (per presentation) lives in app.presentations[id]["chat_history"]
15. Frontend (ComparisonPage) ──GET /results twice──► diffs two presentations client-side
```

## Data Movement

| Stage | Input | Output | External Call |
|-------|-------|--------|--------------|
| Upload | Audio blob + JSON metadata + optional PDF | Presentation UUID | None |
| Transcription | Audio bytes | Whisper response (words, text, duration) | OpenAI Whisper API |
| Indexing | Word list + slide timestamps + total slides + duration | Slide-keyed transcript | None |
| PDF text extraction (optional) | PDF bytes + total slides | `Dict[slide_id, str]` of per-page text | None (PyMuPDF in-process) |
| Manual Analysis | Slide-keyed transcript + expectations | Slide-keyed metrics | None |
| LLM Analysis | Slide-keyed transcript + expectations + full text + slide texts | (Slide-keyed feedback, slide-keyed observations) | OpenAI Chat Completions |
| Aggregation | Slide-keyed transcript + metrics + feedback + observations + expectations + duration | `PresentationResults` | None |
| Coaching Summary | `PresentationResults` | `List[CoachingTip]` (assigned to `results.coaching_summary`) | OpenAI Chat Completions |
| Results | Presentation ID | Full results JSON | None |
| Audio | Presentation ID | Raw `audio/webm` bytes | None |
| Chat | Presentation ID + user message (+ stored history) | Assistant message (history updated in-memory) | OpenAI Chat Completions |
