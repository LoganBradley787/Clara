# Clara — API Specification

This is the contract between frontend and backend. No deviations allowed.

## Base URL

```
http://localhost:8000/api
```

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/presentations` | Submit a presentation for processing |
| GET | `/presentations/{id}/status` | Poll processing status |
| GET | `/presentations/{id}/results` | Retrieve final results |

---

## POST /api/presentations

Submit a recorded presentation for analysis.

### Request

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio` | File (binary) | Yes | Audio recording. Accepted formats: `audio/webm`, `audio/wav`, `audio/mp4` |
| `metadata` | String (JSON) | Yes | JSON string containing slide timestamps and expectations |

**metadata JSON structure:**

```json
{
  "slide_timestamps": [0.0, 45.2, 102.7, 180.0],
  "expectations": {
    "tone": "formal",
    "expected_duration_minutes": 10,
    "context": "Class presentation on climate change for university course"
  },
  "total_slides": 4
}
```

**Field definitions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `slide_timestamps` | `number[]` | Yes | Array of timestamps (seconds) when each slide was started. Length must equal `total_slides`. First element should be `0.0` or close to it. |
| `expectations.tone` | `string` | Yes | One of: `"formal"`, `"casual"`, `"informative"`, `"persuasive"` |
| `expectations.expected_duration_minutes` | `number` | Yes | Expected total presentation duration in minutes |
| `expectations.context` | `string` | Yes | Brief description of presentation purpose and audience |
| `total_slides` | `number` | Yes | Total number of slides in the presentation |

**Validation rules:**
- `audio` must be non-empty and under 100MB
- `slide_timestamps` must be sorted ascending
- `slide_timestamps` length must equal `total_slides`
- `total_slides` must be >= 1 and <= 100
- `expected_duration_minutes` must be > 0 and <= 120
- `tone` must be one of the allowed values
- `context` must be non-empty and <= 500 characters

### Response

**Status:** `202 Accepted`

```json
{
  "presentation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "processing",
  "message": "Presentation received. Poll status endpoint for progress."
}
```

### Error Responses

**400 Bad Request** — validation failure:
```json
{
  "error": "validation_error",
  "message": "slide_timestamps must be sorted ascending",
  "field": "slide_timestamps"
}
```

**413 Payload Too Large** — audio file exceeds 100MB:
```json
{
  "error": "file_too_large",
  "message": "Audio file must be under 100MB"
}
```

---

## GET /api/presentations/{id}/status

Poll for processing progress.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (UUID)` | Presentation ID returned from POST |

### Response

**Status:** `200 OK`

```json
{
  "presentation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "processing",
  "stage": "transcribing",
  "progress": {
    "current_step": 2,
    "total_steps": 5,
    "step_name": "Transcribing audio"
  }
}
```

**Status values:**

| Status | Meaning |
|--------|---------|
| `processing` | Pipeline is running |
| `completed` | Results are ready |
| `failed` | Processing failed |

**Stage values (when status is `processing`):**

| Stage | Step | Description |
|-------|------|-------------|
| `received` | 1 | Upload received, queued for processing |
| `transcribing` | 2 | Sending audio to Whisper API |
| `indexing` | 3 | Mapping transcript to slides |
| `analyzing` | 4 | Running manual analytics + LLM feedback |
| `aggregating` | 5 | Combining results |

**When status is `failed`:**
```json
{
  "presentation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "failed",
  "error": "Whisper API returned an error: invalid audio format"
}
```

### Error Responses

**404 Not Found:**
```json
{
  "error": "not_found",
  "message": "Presentation not found"
}
```

---

## GET /api/presentations/{id}/results

Retrieve final processed results.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (UUID)` | Presentation ID |

### Response

**Status:** `200 OK`

```json
{
  "presentation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "total_slides": 4,
  "total_duration_seconds": 600.0,
  "overall_metrics": {
    "total_word_count": 1500,
    "average_wpm": 150.0,
    "total_filler_count": 12,
    "total_pause_count": 8,
    "expected_duration_seconds": 600,
    "actual_duration_seconds": 585.3,
    "duration_deviation_seconds": -14.7
  },
  "slides": {
    "slide_0": {
      "slide_index": 0,
      "start_time": 0.0,
      "end_time": 45.2,
      "duration_seconds": 45.2,
      "transcript": "Hello everyone. Today I will be presenting on climate change and its effects on coastal communities...",
      "words": [
        {"word": "Hello", "start": 0.0, "end": 0.5},
        {"word": "everyone", "start": 0.6, "end": 1.1}
      ],
      "metrics": {
        "word_count": 85,
        "wpm": 112.8,
        "filler_words": {
          "count": 2,
          "instances": [
            {"word": "um", "timestamp": 12.3},
            {"word": "like", "timestamp": 30.1}
          ]
        },
        "pauses": {
          "count": 1,
          "instances": [
            {"start": 20.5, "end": 22.1, "duration_seconds": 1.6}
          ]
        },
        "repeated_phrases": [
          {"phrase": "climate change", "count": 3}
        ],
        "speaking_pace": "slow"
      },
      "feedback": [
        {
          "category": "pacing",
          "comment": "Speaking pace of 112 WPM is below the 130-160 WPM range typical for formal presentations. Consider increasing pace slightly on this introductory slide.",
          "severity": "observation"
        },
        {
          "category": "repetition",
          "comment": "The phrase 'climate change' appears 3 times in 45 seconds. Consider using synonyms like 'global warming' or 'environmental shifts' for variety.",
          "severity": "suggestion"
        }
      ]
    }
  }
}
```

### Slide ID System

- Slide IDs are strings: `"slide_0"`, `"slide_1"`, ..., `"slide_N"`
- Zero-indexed based on order in `slide_timestamps` array
- `slide_index` field contains the integer index
- The `slides` object is keyed by slide ID strings

### Presentation ID System

- UUIDs generated server-side (v4)
- Format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Valid only for the lifetime of the server process (no persistence)

### Expectations Format

Expectations are passed in the initial POST and influence both manual analysis (pace benchmarks based on tone) and LLM analysis (context for feedback).

| Tone | Expected WPM Range | Pause Tolerance |
|------|-------------------|-----------------|
| `formal` | 130–160 | Pauses > 2s flagged |
| `casual` | 140–180 | Pauses > 3s flagged |
| `informative` | 120–150 | Pauses > 2.5s flagged |
| `persuasive` | 140–170 | Pauses > 2s flagged |

### Feedback Item Format

Each feedback item in the `feedback` array:

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `category` | string | `"pacing"`, `"repetition"`, `"clarity"`, `"diction"`, `"structure"`, `"timing"` | What aspect of speaking the comment addresses |
| `comment` | string | — | Specific, actionable observation. Must reference concrete data from the transcript. Max 200 characters. |
| `severity` | string | `"observation"`, `"suggestion"` | `observation` = neutral data point. `suggestion` = actionable recommendation. |

### Metrics Fields

| Field | Type | Description |
|-------|------|-------------|
| `word_count` | integer | Total words spoken on this slide |
| `wpm` | float | Words per minute for this slide |
| `filler_words.count` | integer | Number of filler words detected |
| `filler_words.instances` | array | Each filler with word and timestamp |
| `pauses.count` | integer | Number of pauses exceeding threshold |
| `pauses.instances` | array | Each pause with start, end, duration |
| `repeated_phrases` | array | Phrases said 2+ times with counts |
| `speaking_pace` | string | One of: `"slow"`, `"normal"`, `"fast"` based on tone benchmarks |

### Error Responses

**404 Not Found:**
```json
{
  "error": "not_found",
  "message": "Presentation not found"
}
```

**409 Conflict** — results not ready yet:
```json
{
  "error": "not_ready",
  "message": "Processing is still in progress. Poll the status endpoint.",
  "status": "processing"
}
```
