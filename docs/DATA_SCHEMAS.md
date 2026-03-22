# Clara — Data Schemas

All data structures used in the Clara pipeline.

---

## 1. Whisper API Response (Raw)

Returned by OpenAI Whisper API. This is the input to the Slide Indexer.

```json
{
  "duration": 600.0,
  "language": "english",
  "text": "Full transcript text...",
  "segments": [
    {
      "id": 0,
      "start": 0.0,
      "end": 12.48,
      "text": " Hello everyone. Today I will be presenting...",
      "avg_logprob": -0.437,
      "compression_ratio": 1.03,
      "no_speech_prob": 0.099,
      "temperature": 0.0
    }
  ],
  "words": [
    {
      "word": "Hello",
      "start": 0.0,
      "end": 0.52
    },
    {
      "word": "everyone",
      "start": 0.6,
      "end": 1.1
    }
  ]
}
```

**Key fields used by Clara:**

| Field | Type | Used By | Purpose |
|-------|------|---------|---------|
| `words` | array | Indexer | Map words to slides by timestamp |
| `words[].word` | string | Indexer, Analytics | The spoken word |
| `words[].start` | float | Indexer, Analytics | Word start time (seconds) |
| `words[].end` | float | Indexer, Analytics | Word end time (seconds) |
| `duration` | float | Aggregator | Total recording duration |
| `text` | string | LLM Module | Full transcript for context |

---

## 2. Slide Timestamps (Frontend Input)

Sent by frontend as part of the metadata JSON.

```json
{
  "slide_timestamps": [0.0, 45.2, 102.7, 180.0],
  "total_slides": 4
}
```

| Field | Type | Description |
|-------|------|-------------|
| `slide_timestamps` | `number[]` | Start time of each slide in seconds. Sorted ascending. Length >= `total_slides` (may exceed it if user navigated backward then forward; backend uses only the first `total_slides` entries). |
| `total_slides` | `integer` | Number of slides in the PDF. Must be <= length of `slide_timestamps`. |

**Slide boundary logic:**
- `slide_0`: words where `start >= slide_timestamps[0]` and `start < slide_timestamps[1]`
- `slide_N` (last): words where `start >= slide_timestamps[N]` and `start < recording_end`

> **Note:** All slide boundaries use strict `<` for the end bound. The last slide uses `recording_end` (Whisper `duration`) as its upper bound. A word exactly at `recording_end` is excluded (this is a degenerate edge case — Whisper word timestamps are always strictly within the audio duration).

---

## 3. Slide-Indexed Transcript

Output of the Slide Indexer. Input to both Manual Analytics and LLM Module.

```json
{
  "slide_0": {
    "slide_index": 0,
    "start_time": 0.0,
    "end_time": 45.2,
    "words": [
      {"word": "Hello", "start": 0.0, "end": 0.52},
      {"word": "everyone", "start": 0.6, "end": 1.1}
    ],
    "text": "Hello everyone. Today I will be presenting..."
  },
  "slide_1": {
    "slide_index": 1,
    "start_time": 45.2,
    "end_time": 102.7,
    "words": [],
    "text": "..."
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `slide_index` | integer | Zero-based index |
| `start_time` | float | When the speaker started this slide (seconds) |
| `end_time` | float | When the speaker moved to the next slide (or recording ended) |
| `words` | array | Whisper word objects that fall within this slide's time range |
| `text` | string | Concatenated words for this slide |

---

## 4. Presentation Expectations

Sent by frontend, used by both Manual Analytics and LLM Module.

```json
{
  "tone": "professional",
  "expected_duration_minutes": 10,
  "context": "Class presentation on climate change for university course"
}
```

| Field | Type | Allowed Values | Description |
|-------|------|---------------|-------------|
| `tone` | string | `"professional"`, `"conversational"`, `"educational"`, `"persuasive"`, `"storytelling"` | Affects WPM benchmarks and pause thresholds |
| `expected_duration_minutes` | number | 1–120 | Target duration |
| `context` | string | free text, max 500 chars | Audience and purpose context for LLM |

---

## 5. Manual Analytics Output (Per Slide)

Output of the Manual Analytics module.

```json
{
  "slide_0": {
    "word_count": 85,
    "wpm": 112.8,
    "duration_seconds": 45.2,
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
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `word_count` | integer | Total words on this slide |
| `wpm` | float | `word_count / (duration_seconds / 60)` |
| `duration_seconds` | float | `end_time - start_time` |
| `filler_words.count` | integer | Total fillers detected |
| `filler_words.instances[]` | array | Each filler with word string and timestamp float |
| `pauses.count` | integer | Pauses exceeding tone-based threshold |
| `pauses.instances[]` | array | Each pause with start, end, duration_seconds |
| `repeated_phrases[]` | array | Phrases (2+ words) repeated 2+ times |
| `speaking_pace` | string | `"slow"`, `"normal"`, `"fast"` based on tone WPM ranges |

> **Aggregation note:** The aggregator promotes `duration_seconds` from the metrics object to the slide top level. In the final API response (§7), `duration_seconds` appears at the slide level, **not** inside `metrics`. Implementations of `manual_analytics.py` should still compute and return `duration_seconds` as part of `SlideMetrics` — the restructuring happens in the aggregator.

**Filler word list:**
`um`, `uh`, `like`, `you know`, `basically`, `actually`, `literally`, `right`, `I mean`, `kind of`, `sort of`

**Pause threshold by tone:**

| Tone | Pause Threshold |
|------|----------------|
| professional | > 2.0s |
| conversational | > 3.0s |
| educational | > 2.5s |
| persuasive | > 2.0s |
| storytelling | > 3.5s |

**Speaking pace ranges:**

| Tone | Slow | Normal (inclusive) | Fast |
|------|------|--------|------|
| professional | < 90 WPM | 90 ≤ WPM ≤ 130 | > 130 WPM |
| conversational | < 100 WPM | 100 ≤ WPM ≤ 140 | > 140 WPM |
| educational | < 80 WPM | 80 ≤ WPM ≤ 110 | > 110 WPM |
| persuasive | < 100 WPM | 100 ≤ WPM ≤ 140 | > 140 WPM |
| storytelling | < 85 WPM | 85 ≤ WPM ≤ 120 | > 120 WPM |

---

## 6. LLM Feedback Output (Per Slide)

Output of the Snowflake Cortex LLM module. The LLM catches language-level patterns that regex/counting cannot detect. It does not duplicate deterministic metrics.

```json
{
  "slide_0": {
    "feedback": [
      {
        "type": "REPETITION",
        "text": "You know",
        "detail": "Phrase 'You know' appears on slides 2, 5, and 7"
      }
    ]
  },
  "slide_1": {
    "feedback": []
  }
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `type` | string | `"REPETITION"`, `"HEDGE_STACK"`, `"FALSE_START"`, `"SLIDE_READING"` | Flag type |
| `text` | string | max 200 chars | The specific words or phrase flagged from the transcript |
| `detail` | string | max 200 chars | Brief explanation of the issue |

**Flag type definitions:**
- `REPETITION` — same phrase/structure repeated across multiple slides (not within a single slide)
- `HEDGE_STACK` — 3+ hedging words in the same sentence
- `FALSE_START` — speaker begins a sentence, abandons it, restarts
- `SLIDE_READING` — transcript closely matches PDF slide text verbatim (only when slide text is available)

**Constraints:**
- Maximum 2 feedback items per slide
- Each flag must reference specific words or phrases from the transcript
- No metrics commentary (duration, WPM, word count)
- No encouragement, praise, or subjective quality ratings
- No grammar/vocabulary critique unless hedge stacking
- Clean slides return an empty array — feedback is never forced

---

## 6b. Observation Output (Per Slide)

Observations are holistic, slide-level assessments that complement the granular flags in §6. Currently only CONTENT_COVERAGE is supported. Observations are **optional** — most slides will have an empty array.

```json
{
  "slide_0": {
    "observations": [
      {
        "type": "CONTENT_COVERAGE",
        "detail": "Speaker addressed neural networks but skipped loss functions and backpropagation from the slide",
        "evidence": {
          "concepts_covered": ["neural networks", "training process"],
          "concepts_missed": ["loss functions", "backpropagation"]
        }
      }
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `"CONTENT_COVERAGE"` |
| `detail` | string | Yes | Explanation of the observation. Max 250 chars. |
| `evidence` | object | No | Structured data for visual rendering. Shape depends on type. |

**Observation type definitions:**

| Type | What it catches | Requires PDF | Evidence shape |
|------|----------------|-------------|----------------|
| `CONTENT_COVERAGE` | Speaker skipped significant slide content | Yes (10+ words) | `{"concepts_covered": [...], "concepts_missed": [...]}` — LLM identifies concepts semantically |

**Constraints:**
- Maximum 1 observation per slide
- Empty array is the norm — observations are never forced
- CONTENT_COVERAGE uses semantic concept matching (synonyms count as covered)
- No encouragement, praise, or subjective quality ratings

---

## 7. Aggregated Final Output

The complete results object returned by `GET /api/presentations/{id}/results`.

```json
{
  "presentation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "total_slides": 4,
  "total_duration_seconds": 585.3,
  "overall_metrics": {
    "total_word_count": 1500,
    "average_wpm": 153.8,
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
      "transcript": "Hello everyone...",
      "words": [
        {"word": "Hello", "start": 0.0, "end": 0.52}
      ],
      "metrics": {
        "word_count": 85,
        "wpm": 112.8,
        "filler_words": {
          "count": 2,
          "instances": [
            {"word": "um", "timestamp": 12.3}
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
          "type": "REPETITION",
          "text": "climate change",
          "detail": "Phrase 'climate change' also appears on slides 2 and 4"
        }
      ],
      "observations": [
        {
          "type": "CONTENT_COVERAGE",
          "detail": "Speaker covered climate change effects but skipped mitigation strategies and policy proposals from the slide",
          "text": null,
          "evidence": {
            "concepts_covered": ["climate change", "coastal communities", "rising sea levels"],
            "concepts_missed": ["mitigation strategies", "policy proposals"]
          }
        }
      ]
    }
  }
}
```

### Aggregation Notes

The aggregator merges data from three sources into each slide object. Two fields are **renamed or relocated** during aggregation:

| Transformation | Detail |
|---------------|--------|
| **`text` → `transcript`** | The slide-indexed transcript (§3) field `text` is renamed to `transcript` in the final output. |
| **`duration_seconds` promoted** | Manual analytics (§5) computes `duration_seconds` inside the metrics object, but the aggregator moves it to the **slide top level** and excludes it from `metrics`. |

| Field | Source |
|-------|--------|
| `slide_index`, `start_time`, `end_time`, `words` | Slide-indexed transcript (§3) |
| `transcript` | Slide-indexed transcript (§3) `text` field, renamed |
| `duration_seconds` | Manual analytics (§5), promoted to slide top level |
| `metrics` (all fields except `duration_seconds`) | Manual analytics output (§5) |
| `feedback` | LLM feedback output (§6) |
| `observations` | Observation output (§6b) |

### Overall Metrics

| Field | Type | Description |
|-------|------|-------------|
| `total_word_count` | integer | Sum of all slide word counts |
| `average_wpm` | float | `total_word_count / (total_duration_seconds / 60)` |
| `total_filler_count` | integer | Sum of all slide filler counts |
| `total_pause_count` | integer | Sum of all slide pause counts |
| `expected_duration_seconds` | float | From expectations, converted to seconds |
| `actual_duration_seconds` | float | From Whisper duration |
| `duration_deviation_seconds` | float | `actual - expected` (negative = under time) |

### Coaching Summary

The `coaching_summary` field is a list of 3 prioritized, actionable coaching tips generated by the LLM after all per-slide analysis is complete. It appears at the top level of the results alongside `overall_metrics`.

```json
{
  "coaching_summary": [
    {
      "title": "Replace filler phrases with deliberate pauses",
      "explanation": "You used 'kind of' 12 times across slides 2-5. Try pausing silently instead — it projects confidence and gives your audience time to absorb key points.",
      "slide_references": ["slide_2", "slide_3", "slide_4", "slide_5"]
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `coaching_summary` | array | Exactly 3 coaching tips, ordered by priority |
| `coaching_summary[].title` | string | Short actionable title, max 100 chars |
| `coaching_summary[].explanation` | string | Detailed explanation with specific data references, max 300 chars |
| `coaching_summary[].slide_references` | string[] | Slide IDs most relevant to this tip (e.g. `["slide_2", "slide_5"]`) |

---

## 8. Chat Message Schema

Used by the `POST /api/presentations/{id}/chat` endpoint for conversational follow-up.

### Request

```json
{
  "message": "Why do I keep saying 'kind of' so much on slide 3?"
}
```

### Response

```json
{
  "response": "On slide 3, you used 'kind of' 4 times..."
}
```

Chat history is maintained server-side per presentation (in-memory). Each message is sent with full presentation context so the AI coach can reference specific metrics, feedback, and transcript data.
