# Clara — Processing Pipeline

Step-by-step deterministic pipeline from recording to results.

---

## Pipeline Overview

```
Step 1: Frontend Recording
Step 2: Upload Submission
Step 3: Whisper Transcription
Step 4: Slide Indexing
Step 5: Parallel Analysis (Manual + LLM)
Step 6: Aggregation
Step 7: Results Available
```

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
- `slide_timestamps: number[]` — e.g., `[0.0, 45.2, 102.7, 180.0]`
- `total_slides: number` — must equal `slide_timestamps.length`

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

**Algorithm:**
```
for each slide_index from 0 to total_slides - 1:
    slide_start = slide_timestamps[slide_index]
    slide_end = slide_timestamps[slide_index + 1] if not last slide
              = recording_duration if last slide

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

**Output:** `Dict[str, SlideTranscript]` — see DATA_SCHEMAS.md §3

---

## Step 5: Parallel Analysis

**Stage:** `analyzing` (step 4/5)

Two independent analysis paths run on the slide-indexed transcript.

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

### 5b: Snowflake LLM Feedback

**Input:** Slide-indexed transcript + expectations + full presentation text

**Per-slide processing (run N times, once per slide):**

1. Construct prompt with:
   - Full presentation transcript (for cross-slide context)
   - Current slide transcript (focus)
   - Presentation expectations (tone, context, duration)
   - Specific instructions for categories: repetition, clarity, diction, pacing, structure, timing
   - Output format instructions (JSON array of feedback items)

2. Call Snowflake Cortex REST API

3. Parse response into structured feedback items

4. Validate: max 5 items, each under 200 chars, each has valid category and severity

**Output:** `Dict[str, SlideFeedback]` — see DATA_SCHEMAS.md §6

---

## Step 6: Aggregation

**Stage:** `aggregating` (step 5/5)

**Input:**
- Manual analytics output: `Dict[str, SlideMetrics]`
- LLM feedback output: `Dict[str, SlideFeedback]`
- Slide-indexed transcript
- Presentation expectations
- Whisper metadata (duration)

**Actions:**

1. For each slide ID, merge:
   - Transcript data (text, words, start/end times)
   - Manual metrics
   - LLM feedback items

2. Compute overall metrics:
   - `total_word_count`: sum of all slide word counts
   - `average_wpm`: `total_word_count / (total_duration / 60)`
   - `total_filler_count`: sum of all slide filler counts
   - `total_pause_count`: sum of all slide pause counts
   - `expected_duration_seconds`: `expectations.expected_duration_minutes * 60`
   - `actual_duration_seconds`: Whisper `duration`
   - `duration_deviation_seconds`: `actual - expected`

3. Construct final `PresentationResults` object

**Output:** See DATA_SCHEMAS.md §7

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
| Whisper API failure | transcribing | Set status `failed`, include API error message |
| Snowflake API failure | analyzing | Set status `failed`, include API error message |
| Invalid audio format | transcribing | Set status `failed`, message: "Unsupported audio format" |
| Empty transcript | indexing | Proceed with empty slides (valid edge case) |
| LLM returns malformed JSON | analyzing | Retry once, then set status `failed` |

## Timing Expectations

| Step | Expected Duration |
|------|------------------|
| Whisper transcription | 5–30 seconds (depends on audio length) |
| Slide indexing | < 100ms |
| Manual analytics | < 500ms |
| LLM feedback (all slides) | 10–60 seconds (N API calls, depends on slide count) |
| Aggregation | < 100ms |
| **Total pipeline** | **15–90 seconds typical** |
