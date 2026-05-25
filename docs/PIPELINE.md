# Clara — Processing Pipeline

Step-by-step deterministic pipeline from recording to results.

---

## Pipeline Overview

```
Step 1: Frontend Recording          (client-side)
Step 2: Upload Submission           (client → server)
Step 3: Whisper Transcription       (server — backend stage 2/5: "transcribing")
Step 4: Slide Indexing              (server — backend stage 3/5: "indexing")
   └─ Substep 4b: PDF Text Extraction (optional, when slides PDF was uploaded)
Step 5: Parallel Analysis           (server — backend stage 4/5: "analyzing")
Step 6: Aggregation                 (server — backend stage 5/5: "aggregating")
   └─ Substep 6b: Coaching Summary Generation (post-aggregation LLM call)
Step 7: Results Available           (server → client)
```

> **Note:** This document describes the full end-to-end pipeline. The status API (`GET /api/presentations/{id}/status`) reports **5 backend stages** only (received → transcribing → indexing → analyzing → aggregating). Steps 1–2 happen client-side before the backend begins, and step 7 is the terminal state. The stage names and numbers map directly to `gateway.STAGE_STEPS` and `models.PipelineStage`. Substeps 4b and 6b are not surfaced as their own status stages — they run inside the surrounding stage.

---

## Step 1: Frontend Recording

**Trigger:** User clicks "Start Presenting" on the Recording Page.

**Actions:**
1. Start `MediaRecorder` with `audio/webm` mime type
2. Initialize `slide_timestamps` array with `[0.0]` (first slide starts at time 0)
3. Display slide 0 from the uploaded PDF
4. On each slide advance (user clicks next):
   - Record `performance.now() / 1000` relative to recording start
   - Append timestamp to `slide_timestamps`
   - Display next slide
5. On "End Presentation" click:
   - Stop `MediaRecorder`
   - Collect audio blob from recorded chunks

**Output:**
- Audio blob (`Blob`, type `audio/webm`)
- `slide_timestamps: number[]` — e.g., `[0.0, 45.2, 102.7, 180.0]`. May have more entries than `total_slides` if the user navigated backward then forward.
- `total_slides: number` — the PDF page count. Must be <= `slide_timestamps.length`.

**Constraints:**
- Minimum 1 slide
- Recording must be at least 5 seconds
- Timestamps must be monotonically increasing

---

## Step 2: Upload Submission

**Trigger:** Recording ends.

**Actions:**
1. Construct `FormData`:
   - `audio`: the audio blob
   - `metadata`: JSON string with `slide_timestamps`, `expectations`, `total_slides`
2. Send `POST /api/presentations` with multipart form data
3. Receive `202 Accepted` with `presentation_id`
4. Begin polling `GET /api/presentations/{id}/status` every 2 seconds
5. Transition UI to processing state

**Backend on receipt:**
1. Validate metadata JSON (see API_SPEC.md for rules)
2. Generate UUID v4 as `presentation_id`
3. Save audio to temporary file
4. Store presentation state in in-memory dict: `{status: "processing", stage: "received"}`
5. Launch pipeline in background task (FastAPI `BackgroundTasks`)
6. Return 202 immediately

---

## Step 3: Whisper Transcription

**Stage:** `transcribing` (step 2/5)

**Input:** Audio file bytes

**Actions:**
1. Read audio from temp file
2. Call OpenAI Whisper API:
   ```python
   client = openai.OpenAI(api_key=OPENAI_API_KEY)
   response = client.audio.transcriptions.create(
       model="whisper-1",
       file=audio_file,
       response_format="verbose_json",
       timestamp_granularities=["word", "segment"]
   )
   ```
3. Parse response into structured object

**Output:** Whisper response JSON containing:
- `words[]`: array of `{word, start, end}`
- `segments[]`: array of segment objects
- `text`: full transcript string
- `duration`: total audio duration in seconds

**Error handling:**
- If Whisper API fails, set presentation status to `failed` with error message
- If no words detected (empty transcript), proceed with empty arrays

---

## Step 4: Slide Indexing

**Stage:** `indexing` (step 3/5)

**Input:**
- Whisper `words[]` array
- `slide_timestamps` from metadata
- Total recording duration from Whisper `duration`

**Pre-processing:** If `slide_timestamps` has more entries than `total_slides` (this happens when the user navigated backward then forward during recording), truncate to the first `total_slides` entries. The extra timestamps are discarded.

**Algorithm:**
```
timestamps = slide_timestamps[:total_slides]  # truncate extras

for each slide_index from 0 to total_slides - 1:
    slide_start = timestamps[slide_index]
    slide_end = timestamps[slide_index + 1] if not last slide
              = recording_end if last slide

    slide_words = [w for w in words if w.start >= slide_start and w.start < slide_end]
    slide_text = " ".join([w.word for w in slide_words])

    indexed[f"slide_{slide_index}"] = {
        "slide_index": slide_index,
        "start_time": slide_start,
        "end_time": slide_end,
        "words": slide_words,
        "text": slide_text
    }
```

**Edge cases:**
- Words exactly at a slide boundary (`word.start == slide_end`) belong to the NEXT slide
- Last slide captures all remaining words until end of recording
- A slide with no words gets an empty `words` array and empty `text`
- Extra timestamps beyond `total_slides` are truncated before indexing

**Output:** `Dict[str, SlideTranscript]` — see DATA_SCHEMAS.md §3

---

## Step 4b: PDF Text Extraction (optional)

**Stage:** still `indexing` (not a separate status stage)

This substep runs only when the client uploaded a slides PDF alongside the audio (the `slides` multipart field on `POST /api/presentations`). If no PDF was supplied, the substep is skipped and `slide_texts` defaults to an empty dict.

**Input:**
- PDF bytes from the optional `slides` upload
- `total_slides` from metadata

**Implementation:** `gateway._extract_slide_texts(pdf_bytes, total_slides)`. Uses PyMuPDF (`fitz`) to open the PDF in-memory and pull `.get_text()` from each page, keyed by `slide_{i}`. Capped at `min(total_slides, len(doc))` pages so a mismatched PDF cannot index past the recorded slide range. The call is offloaded to a worker thread via `asyncio.to_thread` to avoid blocking the event loop.

**Output:** `slide_texts: Dict[str, str]` — e.g. `{"slide_0": "Project goals...", "slide_1": "Timeline..."}`. This dict is threaded into `generate_llm_feedback` to ground the `SLIDE_READING` flag and the `CONTENT_COVERAGE` observation. When the dict is empty, both of those LLM outputs are suppressed by the validation layer.

**Edge cases:**
- No PDF uploaded → empty dict, LLM never flags `SLIDE_READING` and never observes `CONTENT_COVERAGE`.
- PDF has fewer pages than `total_slides` → only the available pages are extracted; the missing slide IDs are absent from the dict and treated as if no slide text exists.
- PDF parse errors propagate out of the substep and fail the pipeline run (caught by the outer `_run_pipeline` exception handler).

---

## Step 5: Parallel Analysis

**Stage:** `analyzing` (step 4/5)

Two independent analysis paths run **concurrently** on the slide-indexed transcript. Use `asyncio.gather` to run both in parallel. These are the only concurrent stages in the pipeline; all other stages run sequentially.

### 5a: Manual Analytics

**Input:** Slide-indexed transcript + expectations

**Per-slide processing:**

1. **Word count**: `len(slide.words)`

2. **Duration**: `slide.end_time - slide.start_time`

3. **WPM**: `word_count / (duration_seconds / 60)`. If duration is 0, WPM is 0.

4. **Filler words**: Scan `slide.words` for matches against the filler list:
   - Single-word fillers: `um`, `uh`, `like`, `basically`, `actually`, `literally`, `right`
   - Multi-word fillers: `you know`, `I mean`, `kind of`, `sort of` (check consecutive words)
   - Case-insensitive matching
   - Record each instance with word and timestamp (`word.start`)

5. **Pauses**: Identify gaps between consecutive words:
   - For words `i` and `i+1`: gap = `words[i+1].start - words[i].end`
   - If gap exceeds tone-based threshold (see DATA_SCHEMAS.md §5), record as pause
   - Record start (`words[i].end`), end (`words[i+1].start`), duration

6. **Repeated phrases**: Scan for 2-word and 3-word phrases appearing 2+ times:
   - Normalize to lowercase
   - Exclude phrases composed entirely of stop words
   - Report phrase and count

7. **Speaking pace**: Compare WPM against tone benchmarks (see DATA_SCHEMAS.md §5):
   - Below range → `"slow"`
   - Within range → `"normal"`
   - Above range → `"fast"`

**Output:** `Dict[str, SlideMetrics]` — see DATA_SCHEMAS.md §5

### 5b: OpenAI LLM Feedback

**Input:** Slide-indexed transcript + expectations + full presentation text + `slide_texts` from substep 4b

**Execution model:** `generate_llm_feedback` iterates the slide dict and calls the OpenAI Chat Completions API **once per slide, sequentially**. There is no parallelization toggle — the loop is the only mode. The blocking OpenAI SDK call is offloaded per-slide via `asyncio.to_thread`, but slides are not fanned out.

**Pre-computation (runs once before the per-slide loop):**
- Build an annotated transcript with `[Slide N]` markers so the LLM can see slide boundaries.
- Compute cross-slide repeated n-grams (length 3–6) appearing on 2+ distinct slides. This is the only evidence the LLM may use to justify a `REPETITION` flag.
- Compute a word-overlap similarity score between each slide's spoken transcript and its PDF text (when available).

**Per-slide processing:**

1. Build an evidence block containing the pre-computed repetitions relevant to this slide and the PDF slide text + similarity score (when available).

2. Construct prompt with:
   - Full annotated transcript (cross-slide context)
   - Current slide transcript (focus)
   - Expectations (tone, context)
   - The evidence block from step 1
   - Output format instructions (single JSON object with `flags` and `observations` arrays)

3. Call OpenAI Chat Completions with `response_format={"type": "json_object"}` and the configured model (default `gpt-5.4-mini`, set via `OPENAI_MODEL`).

4. Parse the JSON object response and apply strict post-validation (see below).

**Allowed flag types (exactly four):**
- `REPETITION` — phrase repeated across multiple slides; only valid when the quoted text appears in the pre-computed cross-slide n-gram set for this slide.
- `HEDGE_STACK` — three or more hedging words clustered in the same sentence.
- `FALSE_START` — speaker abandons a sentence mid-thought and restarts.
- `SLIDE_READING` — speaker reads PDF slide text nearly verbatim; only valid when PDF slide text is present AND similarity score >= 0.5.

**Allowed observation types (exactly one):**
- `CONTENT_COVERAGE` — speaker skipped significant concepts from the slide. Only valid when PDF slide text is present and contains >= 10 words. The `evidence` payload must include non-empty `concepts_missed` and (optionally) `concepts_covered` string arrays.

There are no `pacing`, `clarity`, `diction`, `structure`, or `timing` categories, and there is no `severity` field — those concerns are handled entirely by manual analytics (5a).

**Per-slide validation limits:**
- At most **2 flags** per slide (`items[:2]`).
- At most **1 observation** per slide (`items[:1]`).
- Each `text` field must be an exact (normalized) substring of the slide's transcript; mismatched quotes are dropped.
- Each `detail` is capped at 200 chars for flags / 250 chars for observations.
- Outputs containing banned encouragement phrases (e.g. "great job", "well done") are dropped.
- On a `json.JSONDecodeError`/`KeyError`/`TypeError`, the call is retried **once** for that slide. A second failure yields empty `flags` and `observations` for that slide (graceful degradation).
- Slides with no spoken words skip the LLM call entirely and yield empty `flags` and `observations`.

**Output:** A **tuple** `(Dict[str, SlideFeedback], Dict[str, SlideObservations])` — see DATA_SCHEMAS.md §6. The aggregator consumes both halves.

---

## Step 6: Aggregation

**Stage:** `aggregating` (step 5/5)

**Input (full `aggregate_results` signature):**
- `transcripts`: slide-indexed transcript (`Dict[str, SlideTranscript]`)
- `metrics`: manual analytics output (`Dict[str, SlideMetrics]`)
- `feedback`: LLM flags output (`Dict[str, SlideFeedback]`)
- `expectations`: presentation expectations
- `total_duration`: Whisper-reported duration
- `presentation_id`: the server-issued UUID for this run (echoed into the result body)
- `observations`: LLM observations output (`Dict[str, SlideObservations]`), the second half of the `generate_llm_feedback` tuple

**Actions:**

1. For each slide ID, merge:
   - Transcript data (words, start/end times)
   - Manual metrics
   - LLM feedback flags (`feedback[slide_id].feedback`)
   - LLM observations (`observations[slide_id].observations`) — propagated to `AggregatedSlide.observations`. Missing keys default to an empty list.

2. Apply field transformations:
   - **Rename `text` → `transcript`**: The slide-indexed transcript `text` field becomes `transcript` in the final output
   - **Promote `duration_seconds`**: Move `duration_seconds` from inside the metrics object to the slide top level (exclude it from `metrics` via `model_dump(exclude={"duration_seconds"})`)

3. Set `total_duration_seconds` = Whisper `duration` (actual recording length)

4. Compute overall metrics:
   - `total_word_count`: sum of all slide word counts
   - `average_wpm`: `total_word_count / (total_duration_seconds / 60)`
   - `total_filler_count`: sum of all slide filler counts
   - `total_pause_count`: sum of all slide pause counts
   - `expected_duration_seconds`: `expectations.expected_duration_minutes * 60`
   - `actual_duration_seconds`: same as `total_duration_seconds`
   - `duration_deviation_seconds`: `actual_duration_seconds - expected_duration_seconds`

5. Construct final `PresentationResults` object with `coaching_summary` initialized to `[]` (populated in substep 6b).

**Output:** See DATA_SCHEMAS.md §7

---

## Step 6b: Coaching Summary Generation

**Stage:** still `aggregating` (not a separate status stage)

After `aggregate_results` returns, `_run_pipeline` makes one additional OpenAI Chat Completions call via `generate_coaching_summary(results)` to produce a prioritized, presentation-wide coaching debrief.

**Input:** The freshly-built `PresentationResults` object (overall metrics, per-slide metrics, per-slide flags, and the full transcript are formatted into a single coaching context string).

**Actions:**
1. Build a coaching context string from `results` (overall metrics + per-slide breakdown + full transcript with slide markers).
2. Call OpenAI Chat Completions with the coaching system prompt.
3. Parse a JSON array of up to 3 `CoachingTip` objects (`title`, `explanation`, `slide_references`), humanizing any `slide_N` references into `Slide N+1` for display.
4. Assign the parsed list to `results.coaching_summary`.

**Failure mode (best-effort):** Any exception raised inside `generate_coaching_summary` (network, OpenAI SDK error, JSON parse failure, etc.) is caught in `_run_pipeline`, logged at WARNING, and the pipeline continues with `results.coaching_summary = []`. A failed coaching summary must never fail the pipeline run — completed status is still returned to the client.

**Output:** `List[CoachingTip]` (length 0–3) attached to the `PresentationResults` before the run is marked `completed`.

---

## Step 7: Results Available

**Actions:**
1. Store aggregated results in in-memory dict under the presentation ID
2. Set presentation status to `completed`
3. Frontend polls `GET /api/presentations/{id}/status`, sees `completed`
4. Frontend fetches `GET /api/presentations/{id}/results`
5. Frontend renders results in slide carousel + side panel

---

## Error Handling

| Error | Stage | Behavior |
|-------|-------|----------|
| Whisper API failure | transcribing | Set status `failed`, include SDK error message |
| OpenAI Chat Completions failure (network, auth, rate limit, server error) | analyzing | Bubble out of `generate_llm_feedback`; outer `_run_pipeline` handler sets status `failed` with the SDK exception message |
| Invalid audio format | transcribing | Set status `failed`, message: "Unsupported audio format" |
| Empty transcript | indexing | Proceed with empty slides (valid edge case) |
| PDF parse failure | indexing (substep 4b) | Bubbles out and fails the run; the substep is optional, so omitting the PDF avoids this path entirely |
| LLM returns malformed JSON (per slide) | analyzing | Retry that slide **once**. A second failure yields empty `flags` and `observations` for that slide (graceful degradation). This is the only retry in the pipeline |
| Coaching summary failure | aggregating (substep 6b) | Swallowed: exception is logged at WARNING, `results.coaching_summary` is set to `[]`, and the run still completes successfully |

## Timing Expectations

| Step | Expected Duration |
|------|------------------|
| Whisper transcription | 5–30 seconds (depends on audio length) |
| Slide indexing | < 100ms |
| PDF text extraction (substep 4b, when PDF uploaded) | < 500ms typical; scales with page count |
| Manual analytics | < 500ms |
| LLM feedback (all slides, sequential) | 10–60 seconds (N OpenAI calls, one per slide) |
| Aggregation | < 100ms |
| Coaching summary (substep 6b) | 2–8 seconds (one additional OpenAI call) |
| **Total pipeline** | **20–100 seconds typical** |
