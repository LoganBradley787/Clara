# Clara Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete Clara backend — FastAPI server with transcription, slide indexing, manual analytics, LLM feedback via Snowflake Cortex, and result aggregation.

**Architecture:** Single FastAPI app with 8 modules (main, gateway, transcriber, indexer, manual_analytics, llm_feedback, aggregator, models/config). In-memory state dict. Background processing pipeline. No database, no auth.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic v2, OpenAI SDK (Whisper), Snowflake Connector + Cortex REST API, pytest

**Spec documents:**
- `docs/API_SPEC.md` — API contracts
- `docs/DATA_SCHEMAS.md` — All data structures
- `docs/PIPELINE.md` — Processing pipeline
- `docs/SERVICE_MANUAL.md` — Manual analytics spec
- `docs/SERVICE_LLM.md` — Snowflake Cortex LLM spec

---

## File Map

| File | Responsibility | Created In |
|------|---------------|------------|
| `backend/requirements.txt` | Dependencies | Task 1 |
| `backend/.env.example` | Environment variable template | Task 1 |
| `backend/app/__init__.py` | Package marker | Task 1 |
| `backend/app/config.py` | Env var loading | Task 2 |
| `backend/app/models.py` | All Pydantic models | Task 3 |
| `backend/app/main.py` | FastAPI app, CORS, lifespan | Task 4 |
| `backend/app/gateway.py` | Routes + pipeline orchestration | Task 4, Task 10 |
| `backend/app/indexer.py` | Word-to-slide mapping | Task 5 |
| `backend/tests/__init__.py` | Test package marker | Task 5 |
| `backend/tests/test_indexer.py` | Indexer tests | Task 5 |
| `backend/app/manual_analytics.py` | Objective metrics computation | Task 6-7 |
| `backend/tests/test_manual_analytics.py` | Manual analytics tests | Task 6-7 |
| `backend/app/aggregator.py` | Merge metrics + feedback | Task 8 |
| `backend/tests/test_aggregator.py` | Aggregator tests | Task 8 |
| `backend/app/transcriber.py` | OpenAI Whisper API client | Task 9 |
| `backend/app/llm_feedback.py` | Snowflake Cortex client | Task 9 |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py`

- [ ] **Step 1: Create backend directory structure**

```bash
mkdir -p backend/app backend/tests
```

- [ ] **Step 2: Create requirements.txt**

```
fastapi>=0.104
uvicorn>=0.24
python-multipart>=0.0.6
openai>=1.0
snowflake-connector-python>=3.0
requests>=2.31
pydantic>=2.0
python-dotenv>=1.0
pytest>=7.0
pytest-asyncio>=0.21
httpx>=0.25
```

- [ ] **Step 3: Create .env.example**

```
OPENAI_API_KEY=sk-...
SNOWFLAKE_ACCOUNT=...
SNOWFLAKE_USER=...
SNOWFLAKE_PASSWORD=...
SNOWFLAKE_ROLE=...
SNOWFLAKE_WAREHOUSE=...
CORTEX_MODEL=mistral-large2
```

- [ ] **Step 4: Create __init__.py files**

Create empty `backend/app/__init__.py` and `backend/tests/__init__.py`.

- [ ] **Step 5: Install dependencies**

```bash
cd backend && pip install -r requirements.txt
```

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/.env.example backend/app/__init__.py backend/tests/__init__.py
git commit -m "scaffold: create backend project structure with dependencies"
```

---

## Task 2: Config Module

**Files:**
- Create: `backend/app/config.py`

- [ ] **Step 1: Create config.py**

Load all env vars from `.env` file using `python-dotenv`. Expose them as module-level constants.

```python
import os
from dotenv import load_dotenv

load_dotenv()

# OpenAI (Whisper only)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Snowflake Cortex
SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT", "")
SNOWFLAKE_USER = os.getenv("SNOWFLAKE_USER", "")
SNOWFLAKE_PASSWORD = os.getenv("SNOWFLAKE_PASSWORD", "")
SNOWFLAKE_ROLE = os.getenv("SNOWFLAKE_ROLE", "")
SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE", "")
CORTEX_MODEL = os.getenv("CORTEX_MODEL", "mistral-large2")
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/config.py
git commit -m "feat: add config module for environment variable loading"
```

---

## Task 3: Pydantic Models

**Files:**
- Create: `backend/app/models.py`

**Reference:** `docs/DATA_SCHEMAS.md` — every model must match exactly.

- [ ] **Step 1: Create models.py with all Pydantic models**

Models to define (in order of dependency):

```python
from pydantic import BaseModel, Field
from typing import Dict, List, Optional
from enum import Enum

# --- Enums ---

class Tone(str, Enum):
    formal = "formal"
    casual = "casual"
    informative = "informative"
    persuasive = "persuasive"

class SpeakingPace(str, Enum):
    slow = "slow"
    normal = "normal"
    fast = "fast"

class FeedbackCategory(str, Enum):
    pacing = "pacing"
    repetition = "repetition"
    clarity = "clarity"
    diction = "diction"
    structure = "structure"
    timing = "timing"

class Severity(str, Enum):
    observation = "observation"
    suggestion = "suggestion"

class ProcessingStatus(str, Enum):
    processing = "processing"
    completed = "completed"
    failed = "failed"

class PipelineStage(str, Enum):
    received = "received"
    transcribing = "transcribing"
    indexing = "indexing"
    analyzing = "analyzing"
    aggregating = "aggregating"

# --- Whisper types ---

class WordTimestamp(BaseModel):
    word: str
    start: float
    end: float

# --- Request types ---

class Expectations(BaseModel):
    tone: Tone
    expected_duration_minutes: float = Field(gt=0, le=120)
    context: str = Field(min_length=1, max_length=500)

class PresentationMetadata(BaseModel):
    slide_timestamps: List[float]
    expectations: Expectations
    total_slides: int = Field(ge=1, le=100)

# --- Indexer output ---

class SlideTranscript(BaseModel):
    slide_index: int
    start_time: float
    end_time: float
    words: List[WordTimestamp]
    text: str

# --- Manual analytics output ---

class FillerInstance(BaseModel):
    word: str
    timestamp: float

class FillerInfo(BaseModel):
    count: int
    instances: List[FillerInstance]

class PauseInstance(BaseModel):
    start: float
    end: float
    duration_seconds: float

class PauseInfo(BaseModel):
    count: int
    instances: List[PauseInstance]

class RepeatedPhrase(BaseModel):
    phrase: str
    count: int

class SlideMetrics(BaseModel):
    word_count: int
    wpm: float
    duration_seconds: float
    filler_words: FillerInfo
    pauses: PauseInfo
    repeated_phrases: List[RepeatedPhrase]
    speaking_pace: SpeakingPace

# --- LLM feedback output ---

class FeedbackItem(BaseModel):
    category: FeedbackCategory
    comment: str = Field(max_length=200)
    severity: Severity

class SlideFeedback(BaseModel):
    feedback: List[FeedbackItem]

# --- Aggregated output ---

class AggregatedSlide(BaseModel):
    slide_index: int
    start_time: float
    end_time: float
    duration_seconds: float
    transcript: str
    words: List[WordTimestamp]
    metrics: Dict[str, object]  # SlideMetrics fields minus duration_seconds
    feedback: List[FeedbackItem]

class OverallMetrics(BaseModel):
    total_word_count: int
    average_wpm: float
    total_filler_count: int
    total_pause_count: int
    expected_duration_seconds: float
    actual_duration_seconds: float
    duration_deviation_seconds: float

class PresentationResults(BaseModel):
    presentation_id: str
    total_slides: int
    total_duration_seconds: float
    overall_metrics: OverallMetrics
    slides: Dict[str, AggregatedSlide]

# --- API response types ---

class UploadResponse(BaseModel):
    presentation_id: str
    status: str = "processing"
    message: str = "Presentation received. Poll status endpoint for progress."

class ProgressInfo(BaseModel):
    current_step: int
    total_steps: int = 5
    step_name: str

class StatusResponse(BaseModel):
    presentation_id: str
    status: ProcessingStatus
    stage: Optional[PipelineStage] = None
    progress: Optional[ProgressInfo] = None
    error: Optional[str] = None
    message: Optional[str] = None

class ErrorResponse(BaseModel):
    error: str
    message: str
    field: Optional[str] = None
    status: Optional[str] = None
    presentation_id: Optional[str] = None
```

- [ ] **Step 2: Verify models load without errors**

```bash
cd backend && python -c "from app.models import *; print('All models loaded OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/models.py
git commit -m "feat: add all Pydantic models matching DATA_SCHEMAS.md"
```

---

## Task 4: FastAPI App + Gateway (Stub Routes)

**Files:**
- Create: `backend/app/main.py`
- Create: `backend/app/gateway.py`

**Reference:** `docs/API_SPEC.md` — 3 endpoints exactly.

- [ ] **Step 1: Create main.py**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.gateway import router

app = FastAPI(title="Clara API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory state store
presentations: dict = {}

app.include_router(router)
```

- [ ] **Step 2: Create gateway.py with stub routes**

Implement the 3 endpoints per `docs/API_SPEC.md`:
- `POST /api/presentations` — validate metadata, generate UUID, return 202. Leave pipeline as TODO stub.
- `GET /api/presentations/{id}/status` — look up in-memory state, return status.
- `GET /api/presentations/{id}/results` — return results or 409/404.

All validation rules from API_SPEC.md must be implemented:
- Audio non-empty, under 100MB (return **413** for file too large, not 400)
- slide_timestamps sorted ascending
- slide_timestamps length >= total_slides
- total_slides 1-100
- expected_duration_minutes > 0, <= 120
- tone is valid enum value
- context non-empty, <= 500 chars

Error responses must use the format: `{"error": "...", "message": "...", "field": "..."}`.

**Important:** Audio over 100MB must return HTTP **413** with `{"error": "file_too_large", "message": "Audio file must be under 100MB"}`. All other validation errors return 400.

- [ ] **Step 3: Run the server to verify it starts**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` to see the 3 endpoints in Swagger.

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py backend/app/gateway.py
git commit -m "feat: add FastAPI app with 3 stub API endpoints"
```

---

## Task 5: Indexer (TDD)

**Files:**
- Create: `backend/app/indexer.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_indexer.py`

**Reference:** `docs/PIPELINE.md` Step 4, `docs/DATA_SCHEMAS.md` §3

- [ ] **Step 1: Write indexer tests**

Test cases to cover:
1. **Basic indexing** — 3 slides, words distributed across slides correctly
2. **Boundary words** — word at exact slide boundary belongs to NEXT slide (`word.start == slide_end` → next slide)
3. **Last slide** — captures all words until recording end (Whisper `duration`)
4. **Empty slide** — slide with no words gets empty arrays/text
5. **Extra timestamps** — `slide_timestamps` longer than `total_slides`, extras truncated
6. **Single slide** — all words go to slide_0
7. **No words** — empty word list, all slides get empty arrays

```python
# tests/test_indexer.py
from app.indexer import index_slides
from app.models import WordTimestamp

def test_basic_three_slides():
    words = [
        WordTimestamp(word="hello", start=0.0, end=0.5),
        WordTimestamp(word="world", start=1.0, end=1.5),
        WordTimestamp(word="slide", start=10.5, end=11.0),
        WordTimestamp(word="two", start=12.0, end=12.5),
        WordTimestamp(word="final", start=25.0, end=25.5),
    ]
    result = index_slides(
        words=words,
        slide_timestamps=[0.0, 10.0, 20.0],
        total_slides=3,
        recording_duration=30.0,
    )
    assert len(result) == 3
    assert result["slide_0"].slide_index == 0
    assert len(result["slide_0"].words) == 2  # hello, world
    assert len(result["slide_1"].words) == 2  # slide, two
    assert len(result["slide_2"].words) == 1  # final
    assert result["slide_0"].start_time == 0.0
    assert result["slide_0"].end_time == 10.0
    assert result["slide_2"].end_time == 30.0

def test_word_at_boundary_goes_to_next_slide():
    words = [
        WordTimestamp(word="before", start=9.0, end=9.5),
        WordTimestamp(word="exact", start=10.0, end=10.5),  # at boundary
    ]
    result = index_slides(
        words=words,
        slide_timestamps=[0.0, 10.0],
        total_slides=2,
        recording_duration=20.0,
    )
    assert len(result["slide_0"].words) == 1  # "before" only
    assert len(result["slide_1"].words) == 1  # "exact" goes to next

def test_empty_slide():
    words = [
        WordTimestamp(word="hello", start=0.0, end=0.5),
        WordTimestamp(word="skip", start=25.0, end=25.5),
    ]
    result = index_slides(
        words=words,
        slide_timestamps=[0.0, 10.0, 20.0],
        total_slides=3,
        recording_duration=30.0,
    )
    assert len(result["slide_1"].words) == 0
    assert result["slide_1"].text == ""

def test_extra_timestamps_truncated():
    words = [WordTimestamp(word="hello", start=0.0, end=0.5)]
    result = index_slides(
        words=words,
        slide_timestamps=[0.0, 10.0, 20.0, 30.0],  # 4 timestamps
        total_slides=2,  # but only 2 slides
        recording_duration=40.0,
    )
    assert len(result) == 2
    assert "slide_2" not in result
    assert result["slide_1"].end_time == 40.0  # last slide goes to recording end

def test_no_words():
    result = index_slides(
        words=[],
        slide_timestamps=[0.0, 10.0],
        total_slides=2,
        recording_duration=20.0,
    )
    assert len(result) == 2
    assert len(result["slide_0"].words) == 0
    assert len(result["slide_1"].words) == 0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_indexer.py -v
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement indexer.py**

```python
# app/indexer.py
from typing import Dict, List
from app.models import WordTimestamp, SlideTranscript

def index_slides(
    words: List[WordTimestamp],
    slide_timestamps: List[float],
    total_slides: int,
    recording_duration: float,
) -> Dict[str, SlideTranscript]:
    # Truncate extra timestamps
    timestamps = slide_timestamps[:total_slides]

    result: Dict[str, SlideTranscript] = {}

    for i in range(total_slides):
        slide_start = timestamps[i]
        slide_end = timestamps[i + 1] if i + 1 < len(timestamps) else recording_duration

        slide_words = [
            w for w in words
            if w.start >= slide_start and w.start < slide_end
        ]
        slide_text = " ".join(w.word for w in slide_words)

        result[f"slide_{i}"] = SlideTranscript(
            slide_index=i,
            start_time=slide_start,
            end_time=slide_end,
            words=slide_words,
            text=slide_text,
        )

    return result
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_indexer.py -v
```

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/indexer.py backend/tests/test_indexer.py backend/tests/__init__.py
git commit -m "feat: implement slide indexer with word-to-slide mapping"
```

---

## Task 6: Manual Analytics — Core Metrics (TDD)

**Files:**
- Create: `backend/app/manual_analytics.py`
- Create: `backend/tests/test_manual_analytics.py`

**Reference:** `docs/SERVICE_MANUAL.md` — all 7 metrics, exact filler list, exact thresholds, exact pace ranges.

- [ ] **Step 1: Write tests for word_count, duration, wpm, speaking_pace**

```python
# tests/test_manual_analytics.py
from app.manual_analytics import compute_manual_analytics
from app.models import SlideTranscript, WordTimestamp, Expectations, Tone

def _make_slide(words_data, start=0.0, end=10.0, index=0):
    """Helper to create a SlideTranscript from (word, start, end) tuples."""
    words = [WordTimestamp(word=w, start=s, end=e) for w, s, e in words_data]
    text = " ".join(w for w, _, _ in words_data)
    return SlideTranscript(
        slide_index=index, start_time=start, end_time=end,
        words=words, text=text,
    )

def _formal_expectations():
    return Expectations(tone=Tone.formal, expected_duration_minutes=10, context="test")

def test_word_count():
    slide = _make_slide([("hello", 0.0, 0.5), ("world", 1.0, 1.5)])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].word_count == 2

def test_duration():
    slide = _make_slide([], start=5.0, end=50.2)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].duration_seconds == 45.2

def test_wpm_basic():
    # 120 words in 60 seconds = 120 WPM
    words = [(f"word{i}", i * 0.5, i * 0.5 + 0.3) for i in range(120)]
    slide = _make_slide(words, start=0.0, end=60.0)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].wpm == 120.0

def test_wpm_zero_duration():
    slide = _make_slide([("hello", 0.0, 0.5)], start=0.0, end=0.0)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].wpm == 0

def test_wpm_rounded_to_one_decimal():
    # 7 words in 4.0 seconds = 7 / (4/60) = 105.0
    # 11 words in 7.0 seconds = 11 / (7/60) = 94.28571... -> 94.3
    words = [(f"w{i}", i * 0.5, i * 0.5 + 0.3) for i in range(11)]
    slide = _make_slide(words, start=0.0, end=7.0)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].wpm == 94.3

def test_speaking_pace_formal_slow():
    # WPM < 130 for formal = slow
    words = [(f"w{i}", i * 0.5, i * 0.5 + 0.3) for i in range(100)]
    slide = _make_slide(words, start=0.0, end=60.0)  # 100 WPM
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].speaking_pace == "slow"

def test_speaking_pace_formal_normal():
    words = [(f"w{i}", i * 0.4, i * 0.4 + 0.2) for i in range(150)]
    slide = _make_slide(words, start=0.0, end=60.0)  # 150 WPM
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].speaking_pace == "normal"

def test_speaking_pace_formal_fast():
    words = [(f"w{i}", i * 0.3, i * 0.3 + 0.2) for i in range(180)]
    slide = _make_slide(words, start=0.0, end=60.0)  # 180 WPM
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].speaking_pace == "fast"

def test_empty_slide():
    slide = _make_slide([], start=0.0, end=10.0)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    m = result["slide_0"]
    assert m.word_count == 0
    assert m.wpm == 0
    assert m.filler_words.count == 0
    assert m.pauses.count == 0
    assert len(m.repeated_phrases) == 0
    assert m.speaking_pace == "slow"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_manual_analytics.py -v
```

- [ ] **Step 3: Implement core metrics in manual_analytics.py**

Implement `compute_manual_analytics` with word_count, duration, wpm, speaking_pace, and stubs for filler/pause/repetition (return empty results).

Pace ranges from `docs/DATA_SCHEMAS.md`:

| Tone | Slow | Normal (inclusive) | Fast |
|------|------|--------|------|
| formal | < 130 | 130-160 | > 160 |
| casual | < 140 | 140-180 | > 180 |
| informative | < 120 | 120-150 | > 150 |
| persuasive | < 140 | 140-170 | > 170 |

```python
PACE_RANGES = {
    "formal": (130, 160),
    "casual": (140, 180),
    "informative": (120, 150),
    "persuasive": (140, 170),
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_manual_analytics.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/manual_analytics.py backend/tests/test_manual_analytics.py
git commit -m "feat: implement manual analytics core metrics (word count, WPM, pace)"
```

---

## Task 7: Manual Analytics — Fillers, Pauses, Repetition (TDD)

**Files:**
- Modify: `backend/app/manual_analytics.py`
- Modify: `backend/tests/test_manual_analytics.py`

**Reference:** `docs/SERVICE_MANUAL.md` — exact filler word list, exact pause thresholds, stop word list.

- [ ] **Step 1: Add filler word detection tests**

```python
def test_single_filler_detection():
    slide = _make_slide([
        ("Hello", 0.0, 0.5), ("um", 1.0, 1.2), ("world", 2.0, 2.5)
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].filler_words.count == 1
    assert result["slide_0"].filler_words.instances[0].word == "um"
    assert result["slide_0"].filler_words.instances[0].timestamp == 1.0

def test_multi_word_filler():
    slide = _make_slide([
        ("you", 0.0, 0.3), ("know", 0.4, 0.7), ("stuff", 1.0, 1.5)
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].filler_words.count == 1
    assert result["slide_0"].filler_words.instances[0].word == "you know"

def test_filler_case_insensitive():
    slide = _make_slide([("BASICALLY", 0.0, 0.5), ("UM", 1.0, 1.2)])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].filler_words.count == 2
```

- [ ] **Step 2: Add pause detection tests**

```python
def test_pause_detected_formal():
    # Formal threshold = 2.0s. Gap of 2.5s should be detected.
    slide = _make_slide([
        ("hello", 0.0, 0.5), ("world", 3.0, 3.5)  # gap = 3.0 - 0.5 = 2.5s
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].pauses.count == 1
    assert result["slide_0"].pauses.instances[0].start == 0.5
    assert result["slide_0"].pauses.instances[0].end == 3.0

def test_pause_duration_rounded_to_one_decimal():
    # Gap: 3.15 - 0.5 = 2.65s -> should round to 2.7
    slide = _make_slide([
        ("hello", 0.0, 0.5), ("world", 3.15, 3.5)
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].pauses.count == 1
    assert result["slide_0"].pauses.instances[0].duration_seconds == 2.7

def test_pause_not_detected_below_threshold():
    # Gap of 1.5s < formal threshold 2.0s
    slide = _make_slide([
        ("hello", 0.0, 0.5), ("world", 2.0, 2.5)  # gap = 1.5s
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].pauses.count == 0

def test_pause_casual_higher_threshold():
    # Casual threshold = 3.0s. Gap of 2.5s should NOT be detected.
    slide = _make_slide([
        ("hello", 0.0, 0.5), ("world", 3.0, 3.5)  # gap = 2.5s
    ])
    casual = Expectations(tone=Tone.casual, expected_duration_minutes=10, context="test")
    result = compute_manual_analytics({"slide_0": slide}, casual)
    assert result["slide_0"].pauses.count == 0
```

- [ ] **Step 3: Add repetition detection tests**

```python
def test_repeated_bigram():
    slide = _make_slide([
        ("climate", 0.0, 0.5), ("change", 0.6, 1.0),
        ("is", 1.5, 1.7), ("real", 1.8, 2.0),
        ("climate", 2.5, 3.0), ("change", 3.1, 3.5),
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    phrases = {p.phrase for p in result["slide_0"].repeated_phrases}
    assert "climate change" in phrases

def test_stop_words_only_excluded():
    slide = _make_slide([
        ("it", 0.0, 0.3), ("is", 0.4, 0.6),
        ("good", 0.7, 1.0),
        ("it", 1.5, 1.7), ("is", 1.8, 2.0),
        ("bad", 2.1, 2.4),
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    phrases = {p.phrase for p in result["slide_0"].repeated_phrases}
    assert "it is" not in phrases  # all stop words, excluded
```

- [ ] **Step 4: Run all new tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_manual_analytics.py -v
```

- [ ] **Step 5: Implement filler word detection**

Filler word list from `docs/SERVICE_MANUAL.md`:
- Single: `um`, `uh`, `like`, `basically`, `actually`, `literally`, `right`
- Multi: `you know`, `I mean`, `kind of`, `sort of`

Strip punctuation from words using `string.punctuation`. Case-insensitive.
For multi-word fillers, check `words[i]` + `words[i+1]` as bigram. Use first word's timestamp.

- [ ] **Step 6: Implement pause detection**

Pause thresholds from `docs/SERVICE_MANUAL.md`:
- formal: 2.0s
- casual: 3.0s
- informative: 2.5s
- persuasive: 2.0s

Gap = `words[i+1].start - words[i].end`. If gap > threshold, record pause.
Round `duration_seconds` to 1 decimal place.

- [ ] **Step 7: Implement repetition detection**

From `docs/SERVICE_MANUAL.md`:
- Generate 2-word and 3-word n-grams from lowercase, punctuation-stripped words
- Use `collections.Counter` to count occurrences
- Filter: count >= 2 AND not all stop words
- Stop word list (exact from spec): `the`, `a`, `an`, `is`, `are`, `was`, `were`, `be`, `been`, `being`, `have`, `has`, `had`, `do`, `does`, `did`, `will`, `would`, `could`, `should`, `may`, `might`, `can`, `shall`, `to`, `of`, `in`, `for`, `on`, `with`, `at`, `by`, `from`, `it`, `its`, `this`, `that`, `and`, `or`, `but`, `not`, `no`, `if`, `then`, `than`, `so`, `as`

- [ ] **Step 8: Run all manual analytics tests**

```bash
cd backend && python -m pytest tests/test_manual_analytics.py -v
```

Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add backend/app/manual_analytics.py backend/tests/test_manual_analytics.py
git commit -m "feat: implement filler detection, pause detection, repetition detection"
```

---

## Task 8: Aggregator (TDD)

**Files:**
- Create: `backend/app/aggregator.py`
- Create: `backend/tests/test_aggregator.py`

**Reference:** `docs/DATA_SCHEMAS.md` §7 — field transformations: `text` → `transcript`, `duration_seconds` promoted, overall metrics computed.

- [ ] **Step 1: Write aggregator tests**

```python
# tests/test_aggregator.py
from app.aggregator import aggregate_results
from app.models import (
    SlideTranscript, SlideMetrics, SlideFeedback, FeedbackItem,
    WordTimestamp, FillerInfo, PauseInfo, Expectations, Tone,
    FeedbackCategory, Severity, SpeakingPace,
)

def _make_transcript():
    return {
        "slide_0": SlideTranscript(
            slide_index=0, start_time=0.0, end_time=30.0,
            words=[WordTimestamp(word="hello", start=0.0, end=0.5)],
            text="hello",
        ),
        "slide_1": SlideTranscript(
            slide_index=1, start_time=30.0, end_time=60.0,
            words=[WordTimestamp(word="world", start=30.0, end=30.5)],
            text="world",
        ),
    }

def _make_metrics():
    def m(wc, dur):
        return SlideMetrics(
            word_count=wc, wpm=round(wc / (dur / 60), 1) if dur > 0 else 0,
            duration_seconds=dur,
            filler_words=FillerInfo(count=1, instances=[]),
            pauses=PauseInfo(count=2, instances=[]),
            repeated_phrases=[], speaking_pace=SpeakingPace.normal,
        )
    return {"slide_0": m(50, 30.0), "slide_1": m(60, 30.0)}

def _make_feedback():
    return {
        "slide_0": SlideFeedback(feedback=[
            FeedbackItem(category=FeedbackCategory.pacing, comment="test", severity=Severity.observation)
        ]),
        "slide_1": SlideFeedback(feedback=[]),
    }

def _make_expectations():
    return Expectations(tone=Tone.formal, expected_duration_minutes=1, context="test")

def test_text_renamed_to_transcript():
    result = aggregate_results(
        _make_transcript(), _make_metrics(), _make_feedback(),
        _make_expectations(), total_duration=60.0,
    )
    assert result.slides["slide_0"].transcript == "hello"

def test_duration_promoted_to_slide_level():
    result = aggregate_results(
        _make_transcript(), _make_metrics(), _make_feedback(),
        _make_expectations(), total_duration=60.0,
    )
    assert result.slides["slide_0"].duration_seconds == 30.0
    assert "duration_seconds" not in result.slides["slide_0"].metrics

def test_overall_metrics():
    result = aggregate_results(
        _make_transcript(), _make_metrics(), _make_feedback(),
        _make_expectations(), total_duration=60.0,
    )
    om = result.overall_metrics
    assert om.total_word_count == 110  # 50 + 60
    assert om.average_wpm == 110.0     # 110 / (60/60) = 110.0
    assert om.total_filler_count == 2  # 1 + 1
    assert om.total_pause_count == 4   # 2 + 2
    assert om.expected_duration_seconds == 60.0  # 1 min * 60
    assert om.actual_duration_seconds == 60.0
    assert om.duration_deviation_seconds == 0.0

def test_total_slides_and_duration():
    result = aggregate_results(
        _make_transcript(), _make_metrics(), _make_feedback(),
        _make_expectations(), total_duration=60.0,
    )
    assert result.total_slides == 2
    assert result.total_duration_seconds == 60.0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_aggregator.py -v
```

- [ ] **Step 3: Implement aggregator.py**

```python
# app/aggregator.py
from typing import Dict
from app.models import (
    SlideTranscript, SlideMetrics, SlideFeedback, Expectations,
    AggregatedSlide, OverallMetrics, PresentationResults,
)

def aggregate_results(
    transcripts: Dict[str, SlideTranscript],
    metrics: Dict[str, SlideMetrics],
    feedback: Dict[str, SlideFeedback],
    expectations: Expectations,
    total_duration: float,
    presentation_id: str = "",
) -> PresentationResults:
    slides = {}
    total_word_count = 0
    total_filler_count = 0
    total_pause_count = 0

    for slide_id in transcripts:
        t = transcripts[slide_id]
        m = metrics[slide_id]
        f = feedback.get(slide_id, SlideFeedback(feedback=[]))

        # Build metrics dict WITHOUT duration_seconds
        metrics_dict = m.model_dump(exclude={"duration_seconds"})

        slides[slide_id] = AggregatedSlide(
            slide_index=t.slide_index,
            start_time=t.start_time,
            end_time=t.end_time,
            duration_seconds=m.duration_seconds,  # promoted
            transcript=t.text,  # renamed from text
            words=t.words,
            metrics=metrics_dict,
            feedback=f.feedback,
        )

        total_word_count += m.word_count
        total_filler_count += m.filler_words.count
        total_pause_count += m.pauses.count

    expected_secs = expectations.expected_duration_minutes * 60
    avg_wpm = round(total_word_count / (total_duration / 60), 1) if total_duration > 0 else 0

    return PresentationResults(
        presentation_id=presentation_id,
        total_slides=len(transcripts),
        total_duration_seconds=total_duration,
        overall_metrics=OverallMetrics(
            total_word_count=total_word_count,
            average_wpm=avg_wpm,
            total_filler_count=total_filler_count,
            total_pause_count=total_pause_count,
            expected_duration_seconds=expected_secs,
            actual_duration_seconds=total_duration,
            duration_deviation_seconds=round(total_duration - expected_secs, 1),
        ),
        slides=slides,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_aggregator.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/aggregator.py backend/tests/test_aggregator.py
git commit -m "feat: implement aggregator with field transformations and overall metrics"
```

---

## Task 9: Transcriber + LLM Feedback (External API Clients)

**Files:**
- Create: `backend/app/transcriber.py`
- Create: `backend/app/llm_feedback.py`

These modules call external APIs (OpenAI Whisper, Snowflake Cortex). No unit tests — they are integration-tested via the full pipeline.

**Reference:** `docs/PIPELINE.md` Step 3, `docs/SERVICE_LLM.md`

- [ ] **Step 1: Implement transcriber.py**

```python
# app/transcriber.py
import openai
from app.config import OPENAI_API_KEY
from app.models import WordTimestamp

async def transcribe_audio(audio_path: str) -> dict:
    """Call OpenAI Whisper API. Returns dict with keys: words, text, duration."""
    client = openai.OpenAI(api_key=OPENAI_API_KEY)

    with open(audio_path, "rb") as audio_file:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json",
            timestamp_granularities=["word", "segment"],
        )

    words = [
        WordTimestamp(word=w.word, start=w.start, end=w.end)
        for w in (response.words or [])
    ]

    return {
        "words": words,
        "text": response.text or "",
        "duration": response.duration or 0.0,
    }
```

- [ ] **Step 2: Implement llm_feedback.py**

Implement per `docs/SERVICE_LLM.md`:

1. **Authentication**: Use Snowflake connector to get session token
2. **Per-slide API calls**: Call Cortex REST API for each slide
3. **System prompt**: Exact text from SERVICE_LLM.md
4. **User prompt template**: Exact template from SERVICE_LLM.md
5. **Response parsing**: Strip markdown fences, parse JSON, validate
6. **Post-processing**: Max 5 items, truncate comments >200 chars, filter banned phrases
7. **Error handling**: Retry once on non-200 or invalid JSON, rate limit wait 5s
8. **Empty slides**: Skip LLM call, return empty feedback

```python
# app/llm_feedback.py
import json
import asyncio
import requests
import snowflake.connector
from typing import Dict, List
from app.config import (
    SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD,
    SNOWFLAKE_ROLE, SNOWFLAKE_WAREHOUSE, CORTEX_MODEL,
)
from app.models import (
    SlideTranscript, Expectations, SlideFeedback, FeedbackItem,
    FeedbackCategory, Severity,
)

VALID_CATEGORIES = {c.value for c in FeedbackCategory}

BANNED_PHRASES = [
    "great job", "well done", "excellent", "good work",
    "nicely done", "impressive", "keep it up", "good job",
    "try to be more", "consider being more", "you should try",
]

SYSTEM_PROMPT = """You are a presentation speech analyst. Your role is to provide specific,
data-grounded feedback on speaking patterns observed in presentation transcripts.

Rules:
- Every comment MUST reference specific words, phrases, or patterns from the transcript
- Do NOT give generic advice like "try to be more engaging" or "good job"
- Do NOT rate the quality of the content or ideas
- Do NOT give encouragement or praise
- Focus ONLY on observable speaking behaviors: word choice, repetition, pacing patterns, clarity of phrasing, structural transitions
- Each comment must be under 200 characters
- Respond ONLY with valid JSON — no markdown, no explanation"""


def _get_snowflake_token() -> str:
    conn = snowflake.connector.connect(
        account=SNOWFLAKE_ACCOUNT,
        user=SNOWFLAKE_USER,
        password=SNOWFLAKE_PASSWORD,
        role=SNOWFLAKE_ROLE,
        warehouse=SNOWFLAKE_WAREHOUSE,
    )
    token = conn.rest.token
    conn.close()
    return token


def _build_user_prompt(
    slide: SlideTranscript, expectations: Expectations,
    full_text: str, total_slides: int,
) -> str:
    return f"""PRESENTATION CONTEXT:
- Tone: {expectations.tone.value}
- Expected duration: {expectations.expected_duration_minutes} minutes
- Context: {expectations.context}

FULL PRESENTATION TRANSCRIPT (for reference across slides):
{full_text}

SLIDE {slide.slide_index + 1} OF {total_slides}:
Transcript: "{slide.text}"
Duration: {round(slide.end_time - slide.start_time, 1)} seconds
Word count: {len(slide.words)}

Analyze ONLY Slide {slide.slide_index + 1}. Consider repetition and patterns relative to the rest of the presentation.

Categories to evaluate:
- repetition: repeated words or phrases within this slide or across the presentation
- clarity: unclear or convoluted phrasing
- diction: word choice issues, overly complex or informal language for the tone
- pacing: observations about information density relative to slide duration
- structure: how the speaker transitions into or out of this slide
- timing: time spent on this slide relative to its content

Respond with a JSON array of feedback objects. Maximum 5 items. If few issues found, return fewer items.

Format:
[
  {{
    "category": "repetition|clarity|diction|pacing|structure|timing",
    "comment": "specific observation under 200 characters",
    "severity": "observation|suggestion"
  }}
]"""


def _parse_llm_response(raw: str) -> List[FeedbackItem]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]

    items = json.loads(cleaned)
    validated = []
    for item in items[:5]:
        if item.get("category") not in VALID_CATEGORIES:
            continue
        severity = item.get("severity", "observation")
        if severity not in ("observation", "suggestion"):
            severity = "observation"
        comment = item.get("comment", "")
        if len(comment) > 200:
            comment = comment[:197] + "..."
        # Filter banned phrases
        lower_comment = comment.lower()
        if any(phrase in lower_comment for phrase in BANNED_PHRASES):
            continue
        validated.append(FeedbackItem(
            category=FeedbackCategory(item["category"]),
            comment=comment,
            severity=Severity(severity),
        ))
    return validated


def _call_cortex(token: str, user_prompt: str) -> str:
    url = f"https://{SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/api/v2/cortex/inference:complete"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": CORTEX_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "max_tokens": 1024,
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=30)

    if resp.status_code == 429:
        import time
        time.sleep(5)
        resp = requests.post(url, json=payload, headers=headers, timeout=30)

    if resp.status_code != 200:
        # Retry once after 2 seconds
        import time
        time.sleep(2)
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        if resp.status_code != 200:
            raise Exception(f"Cortex API error: {resp.status_code} {resp.text}")

    data = resp.json()
    return data["choices"][0]["message"]["content"]


async def generate_llm_feedback(
    slide_transcript: Dict[str, SlideTranscript],
    expectations: Expectations,
    full_text: str,
) -> Dict[str, SlideFeedback]:
    token = _get_snowflake_token()
    total_slides = len(slide_transcript)
    result: Dict[str, SlideFeedback] = {}

    for slide_id, slide in slide_transcript.items():
        # Skip empty slides
        if not slide.words:
            result[slide_id] = SlideFeedback(feedback=[])
            continue

        user_prompt = _build_user_prompt(slide, expectations, full_text, total_slides)

        try:
            raw = _call_cortex(token, user_prompt)
            feedback_items = _parse_llm_response(raw)
        except json.JSONDecodeError:
            # Retry once on invalid JSON
            try:
                raw = _call_cortex(token, user_prompt)
                feedback_items = _parse_llm_response(raw)
            except (json.JSONDecodeError, Exception):
                feedback_items = []
        except Exception:
            raise  # Let pipeline catch and mark as failed

        result[slide_id] = SlideFeedback(feedback=feedback_items)

    return result
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/transcriber.py backend/app/llm_feedback.py
git commit -m "feat: implement Whisper transcriber and Snowflake Cortex LLM feedback"
```

---

## Task 10: Wire Pipeline in Gateway

**Files:**
- Modify: `backend/app/gateway.py`
- Modify: `backend/app/main.py`

**Reference:** `docs/PIPELINE.md` — full pipeline flow, `docs/API_SPEC.md` — all validation and error responses.

- [ ] **Step 1: Implement the background pipeline function in gateway.py**

The pipeline function runs as a FastAPI background task:

```python
async def run_pipeline(presentation_id: str, audio_path: str, metadata: PresentationMetadata):
    presentations = get_presentations_store()

    try:
        # Stage 1: transcribing
        update_status(presentation_id, "transcribing", 2, "Transcribing audio")
        whisper_result = await transcribe_audio(audio_path)

        # Stage 2: indexing
        update_status(presentation_id, "indexing", 3, "Mapping transcript to slides")
        indexed = index_slides(
            words=whisper_result["words"],
            slide_timestamps=metadata.slide_timestamps,
            total_slides=metadata.total_slides,
            recording_duration=whisper_result["duration"],
        )

        # Stage 3: analyzing (parallel — manual is sync, wrap in thread)
        update_status(presentation_id, "analyzing", 4, "Running manual analytics + LLM feedback")
        metrics, feedback = await asyncio.gather(
            asyncio.to_thread(compute_manual_analytics, indexed, metadata.expectations),
            generate_llm_feedback(indexed, metadata.expectations, whisper_result["text"]),
        )

        # Stage 4: aggregating
        update_status(presentation_id, "aggregating", 5, "Combining results")
        results = aggregate_results(
            indexed, metrics, feedback, metadata.expectations,
            total_duration=whisper_result["duration"],
            presentation_id=presentation_id,
        )

        presentations[presentation_id]["status"] = "completed"
        presentations[presentation_id]["results"] = results

    except Exception as e:
        presentations[presentation_id]["status"] = "failed"
        presentations[presentation_id]["error"] = "processing_failed"
        presentations[presentation_id]["message"] = str(e)

    finally:
        # Clean up temp audio file
        import os
        if os.path.exists(audio_path):
            os.remove(audio_path)
```

- [ ] **Step 2: Wire POST endpoint to launch background pipeline**

In `POST /api/presentations`:
1. Validate metadata
2. Generate UUID v4
3. Save audio to temp file
4. Store initial state: `{status: "processing", stage: "received"}`
5. Add background task calling `run_pipeline`
6. Return 202

- [ ] **Step 3: Ensure status and results endpoints work with in-memory store**

The in-memory store is a dict in `main.py`, accessed from `gateway.py`. Pass it via app state or a shared module.

Status endpoint stage-to-step mapping:
```python
STAGE_STEPS = {
    "received": (1, "Upload received, queued for processing"),
    "transcribing": (2, "Transcribing audio"),
    "indexing": (3, "Mapping transcript to slides"),
    "analyzing": (4, "Running manual analytics + LLM feedback"),
    "aggregating": (5, "Combining results"),
}
```

- [ ] **Step 4: Test full server manually**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
```

Test with curl:
```bash
# Should return 202
curl -X POST http://localhost:8000/api/presentations \
  -F "audio=@test_audio.webm" \
  -F 'metadata={"slide_timestamps":[0.0,10.0],"expectations":{"tone":"formal","expected_duration_minutes":5,"context":"test"},"total_slides":2}'
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/gateway.py backend/app/main.py
git commit -m "feat: wire complete processing pipeline with background tasks"
```

---

## Task 11: Run Full Test Suite + Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: All tests pass (indexer, manual_analytics, aggregator).

- [ ] **Step 2: Verify server starts cleanly**

```bash
cd backend && uvicorn app.main:app --port 8000
```

No import errors, no startup crashes.

- [ ] **Step 3: Verify API docs render**

Open `http://localhost:8000/docs` — all 3 endpoints should appear with correct request/response schemas.

- [ ] **Step 4: Verify CORS headers**

```bash
curl -i -X OPTIONS http://localhost:8000/api/presentations \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST"
```

Response should include `access-control-allow-origin: http://localhost:5173`.

- [ ] **Step 5: Spot-check validation errors**

```bash
# Missing audio
curl -X POST http://localhost:8000/api/presentations \
  -F 'metadata={"slide_timestamps":[0.0],"expectations":{"tone":"formal","expected_duration_minutes":5,"context":"test"},"total_slides":1}'

# Invalid tone
curl -X POST http://localhost:8000/api/presentations \
  -F "audio=@test.webm" \
  -F 'metadata={"slide_timestamps":[0.0],"expectations":{"tone":"unknown","expected_duration_minutes":5,"context":"test"},"total_slides":1}'

# 404 on unknown presentation
curl http://localhost:8000/api/presentations/00000000-0000-0000-0000-000000000000/status
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final verification — all tests pass, server starts cleanly"
```

---

## Build Order Summary

```
Task 1:  Scaffolding (dirs, deps, env)
Task 2:  Config module (env vars)
Task 3:  Pydantic models (all schemas)
Task 4:  FastAPI app + stub routes (3 endpoints)
Task 5:  Indexer (TDD) — pure logic, no external deps
Task 6:  Manual analytics core (TDD) — word count, WPM, pace
Task 7:  Manual analytics detail (TDD) — fillers, pauses, repetition
Task 8:  Aggregator (TDD) — merge + transform
Task 9:  Transcriber + LLM feedback (external API clients)
Task 10: Wire pipeline (connect all modules in gateway)
Task 11: Full verification
```

Each task produces a working, committable state. Tasks 5-8 are pure logic with full test coverage. Tasks 9-10 involve external APIs and are verified via manual integration testing.
