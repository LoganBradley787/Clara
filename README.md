# Clara

**Game film review for presentations.** Clara records you presenting over your slides, then breaks down exactly what happened slide by slide.

Upload a PDF, give your talk, and get back per-slide telemetry: speaking pace, filler words, pauses, cross-slide repetition, hedge stacking, false starts, and slide reading detection. Just what you did and where, without scores or generic "great job" feedback.

Built for **HooHacks 2026** (Education track).

---

## How it works

```
Record presentation (audio + slide navigation)
        │
        ▼
OpenAI Whisper (word-level transcription)
        │
        ▼
Slide Indexer (maps words → slides via timestamps)
        │
        ├──────────────────────────┐
        ▼                          ▼
Manual Analytics             Snowflake Cortex
 WPM, fillers, pauses,       REPETITION, HEDGE_STACK,
 repetition phrases,          FALSE_START, SLIDE_READING
 pace classification          (post-validated)
        │                          │
        └──────────┬───────────────┘
                   ▼
           Aggregated Results
                   │
                   ▼
        Interactive Results UI
         + Coaching Summary
         + AI Coach Chat
         + Practice Comparison
```

Manual metrics and LLM feedback run in parallel via `asyncio.gather`. The LLM flags language-level patterns that word counting can't detect.

## What makes Clara different

**Evidence-grounded LLM feedback.** Before Snowflake Cortex sees a slide, Clara pre-computes cross-slide n-gram repetitions and spoken-vs-slide text similarity. These get injected into the prompt as evidence. After the LLM responds, every claim is post-validated: hallucinated quotes, ungrounded repetition flags, and low-similarity slide reading claims get dropped.

**Telemetry, not judgment.** Every output traces back to something observable in the recording. No confidence scores, no subjective ratings, no "try to be more engaging." Clara tells you that you said "kind of" 14 times and hedged 3 words into one sentence on slide 4. What you do with that is up to you.

**Full coaching loop.** Record → review slide-by-slide telemetry → ask the AI coach follow-up questions → practice again → compare attempts side by side.

## Tech stack

| Layer | Stack |
|-------|-------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Motion |
| Backend | Python, FastAPI, Pydantic v2 |
| Transcription | OpenAI Whisper API (word-level timestamps) |
| LLM Feedback | Snowflake Cortex (SQL-based inference) |
| PDF Extraction | PyMuPDF (slide text for reading detection) |

## Features

- **Per-slide metrics** — WPM, word count, filler words with timestamps, pauses with durations, repetition phrases, tone-aware pace classification
- **LLM feedback flags** — cross-slide repetition, hedge stacking (3+ hedges in one sentence), false starts, slide reading
- **Coaching summary** — 3 prioritized tips with specific slide references
- **AI coach chat** — ask follow-up questions grounded in your presentation data
- **Audio playback with timeline** — pace-colored slide segments, filler/pause markers, click-to-seek
- **Word-by-word transcript sync** — highlights words during playback, auto-scrolls
- **Inline transcript annotations** — clickable feedback highlights with detail tooltips
- **Practice comparison** — side-by-side metrics across attempts with improvement indicators

## Running locally

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your API keys
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`, backend on `http://localhost:8000`.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Whisper transcription |
| `SNOWFLAKE_ACCOUNT` | Snowflake account identifier |
| `SNOWFLAKE_USER` | Snowflake username |
| `SNOWFLAKE_PASSWORD` | Snowflake password |
| `SNOWFLAKE_ROLE` | Snowflake role |
| `SNOWFLAKE_WAREHOUSE` | Snowflake warehouse |
| `CORTEX_MODEL` | Cortex model name (default: `mistral-large2`) |

## Project structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app, CORS, lifespan
│   ├── gateway.py           # Routes, upload handling, orchestration
│   ├── transcriber.py       # OpenAI Whisper client
│   ├── indexer.py           # Word-to-slide timestamp mapping
│   ├── manual_analytics.py  # Algorithmic metrics (no LLM)
│   ├── llm_feedback.py      # Snowflake Cortex + evidence grounding
│   ├── aggregator.py        # Merges metrics + feedback
│   ├── models.py            # Pydantic schemas
│   └── config.py            # Environment loading
└── tests/

frontend/
├── src/
│   ├── pages/               # Landing, Setup, Recording, Processing, Results, Comparison
│   ├── components/          # SlideViewer, MetricsPanel, TranscriptPanel, ChatPanel, etc.
│   ├── hooks/               # useAudioPlayer
│   ├── context/             # App state
│   └── api/                 # Backend client
```

## Tests

```bash
cd backend
pytest
```
