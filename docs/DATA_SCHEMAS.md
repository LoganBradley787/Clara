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
| `slide_timestamps` | `number[]` | Start time of each slide in seconds. Sorted ascending. |
| `total_slides` | `integer` | Must equal length of `slide_timestamps` |

**Slide boundary logic:**
- `slide_0`: words where `start >= slide_timestamps[0]` and `start < slide_timestamps[1]`
- `slide_N` (last): words where `start >= slide_timestamps[N]` and `start <= recording_end`

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
  "tone": "formal",
  "expected_duration_minutes": 10,
  "context": "Class presentation on climate change for university course"
}
```

| Field | Type | Allowed Values | Description |
|-------|------|---------------|-------------|
| `tone` | string | `"formal"`, `"casual"`, `"informative"`, `"persuasive"` | Affects WPM benchmarks and pause thresholds |
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

**Filler word list:**
`um`, `uh`, `like`, `you know`, `so`, `basically`, `actually`, `literally`, `right`, `I mean`, `kind of`, `sort of`

**Pause threshold by tone:**

| Tone | Pause Threshold |
|------|----------------|
| formal | > 2.0s |
| casual | > 3.0s |
| informative | > 2.5s |
| persuasive | > 2.0s |

**Speaking pace ranges:**

| Tone | Slow | Normal | Fast |
|------|------|--------|------|
| formal | < 130 WPM | 130–160 WPM | > 160 WPM |
| casual | < 140 WPM | 140–180 WPM | > 180 WPM |
| informative | < 120 WPM | 120–150 WPM | > 150 WPM |
| persuasive | < 140 WPM | 140–170 WPM | > 170 WPM |

---

## 6. LLM Feedback Output (Per Slide)

Output of the Snowflake Cortex LLM module.

```json
{
  "slide_0": {
    "feedback": [
      {
        "category": "pacing",
        "comment": "Speaking pace of 112 WPM is below the 130-160 WPM range typical for formal presentations.",
        "severity": "observation"
      },
      {
        "category": "repetition",
        "comment": "The phrase 'climate change' appears 3 times in 45 seconds. Consider synonyms.",
        "severity": "suggestion"
      }
    ]
  }
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `category` | string | `"pacing"`, `"repetition"`, `"clarity"`, `"diction"`, `"structure"`, `"timing"` | Feedback domain |
| `comment` | string | max 200 chars | Specific, data-grounded observation |
| `severity` | string | `"observation"`, `"suggestion"` | Neutral vs actionable |

**Constraints:**
- Maximum 5 feedback items per slide
- Each comment must reference specific words, phrases, or metrics from the transcript
- No generic encouragement or subjective quality ratings
- Comments must be under 200 characters

---

## 7. Aggregated Final Output

The complete results object returned by `GET /api/presentations/{id}/results`.

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
          "category": "pacing",
          "comment": "Speaking pace of 112 WPM is below typical range for formal presentations.",
          "severity": "observation"
        }
      ]
    }
  }
}
```

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
