# Clara — Manual Analytics Service Specification

This module computes objective, algorithmic speaking metrics from slide-indexed transcripts. No LLM calls. Pure computation.

Implemented as a Python module within the FastAPI application: `app/manual_analytics.py`

---

## Responsibilities

1. Compute per-slide speaking metrics from word-level transcript data
2. Detect filler words with timestamps
3. Detect pauses between words
4. Identify repeated phrases
5. Classify speaking pace against tone benchmarks
6. Return structured, slide-indexed JSON

---

## Input Format

Receives the slide-indexed transcript (output of the Indexer) and presentation expectations.

```python
def compute_manual_analytics(
    slide_transcript: Dict[str, SlideTranscript],
    expectations: Expectations
) -> Dict[str, SlideMetrics]:
```

**SlideTranscript:**
```json
{
  "slide_index": 0,
  "start_time": 0.0,
  "end_time": 45.2,
  "words": [
    {"word": "Hello", "start": 0.0, "end": 0.52},
    {"word": "everyone", "start": 0.6, "end": 1.1}
  ],
  "text": "Hello everyone..."
}
```

**Expectations:**
```json
{
  "tone": "formal",
  "expected_duration_minutes": 10,
  "context": "Class presentation on climate change"
}
```

---

## Output Format

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

---

## Metrics Computed

### 1. Word Count

```
word_count = len(slide.words)
```

Count of all words in the slide's word array.

### 2. Duration

```
duration_seconds = slide.end_time - slide.start_time
```

Time spent on this slide in seconds.

### 3. Words Per Minute (WPM)

```
wpm = word_count / (duration_seconds / 60)
```

If `duration_seconds` is 0, set `wpm` to 0.

Round to 1 decimal place.

### 4. Filler Word Detection

**Filler word list (case-insensitive):**

| Single-word | Multi-word |
|------------|------------|
| um | you know |
| uh | I mean |
| like | kind of |
| basically | sort of |
| actually | |
| literally | |
| right | |

**Algorithm:**

```
for i, word in enumerate(slide.words):
    normalized = word.word.lower().strip(punctuation)

    # Check single-word fillers
    if normalized in SINGLE_FILLERS:
        record filler instance

    # Check multi-word fillers (bigrams)
    if i + 1 < len(slide.words):
        bigram = normalized + " " + slide.words[i+1].word.lower().strip(punctuation)
        if bigram in MULTI_FILLERS:
            record filler instance (use first word's timestamp)
```

**Important:** "like" is only a filler when not part of a comparison (e.g., "like a" is filler, "looks like" may not be). For hackathon scope, count all instances of "like" as fillers.

**Output per instance:**
```json
{"word": "um", "timestamp": 12.3}
```

Where `timestamp` is `word.start`.

### 5. Pause Detection

A pause is a gap between consecutive words that exceeds the tone-based threshold.

**Thresholds:**

| Tone | Threshold |
|------|-----------|
| formal | 2.0 seconds |
| casual | 3.0 seconds |
| informative | 2.5 seconds |
| persuasive | 2.0 seconds |

**Algorithm:**

```
for i in range(len(slide.words) - 1):
    gap = slide.words[i + 1].start - slide.words[i].end
    if gap > threshold:
        record pause instance
```

**Output per instance:**
```json
{"start": 20.5, "end": 22.1, "duration_seconds": 1.6}
```

Where:
- `start` = `words[i].end`
- `end` = `words[i + 1].start`
- `duration_seconds` = `end - start`

### 6. Repetition Detection

Find phrases (2-word and 3-word n-grams) that appear 2 or more times within a slide.

**Algorithm:**

```
words_lower = [w.word.lower().strip(punctuation) for w in slide.words]

# Generate bigrams and trigrams
for n in [2, 3]:
    ngrams = [" ".join(words_lower[i:i+n]) for i in range(len(words_lower) - n + 1)]
    counts = Counter(ngrams)

    for phrase, count in counts.items():
        if count >= 2 and not is_all_stop_words(phrase):
            record repeated phrase
```

**Stop words to exclude:**
`the`, `a`, `an`, `is`, `are`, `was`, `were`, `be`, `been`, `being`, `have`, `has`, `had`, `do`, `does`, `did`, `will`, `would`, `could`, `should`, `may`, `might`, `can`, `shall`, `to`, `of`, `in`, `for`, `on`, `with`, `at`, `by`, `from`, `it`, `its`, `this`, `that`, `and`, `or`, `but`, `not`, `no`, `if`, `then`, `than`, `so`, `as`

A phrase is excluded only if ALL words in it are stop words.

**Output per phrase:**
```json
{"phrase": "climate change", "count": 3}
```

### 7. Speaking Pace Classification

Compare computed WPM against tone-specific ranges:

| Tone | Slow | Normal (inclusive) | Fast |
|------|------|--------|------|
| formal | < 130 | 130 ≤ WPM ≤ 160 | > 160 |
| casual | < 140 | 140 ≤ WPM ≤ 180 | > 180 |
| informative | < 120 | 120 ≤ WPM ≤ 150 | > 150 |
| persuasive | < 140 | 140 ≤ WPM ≤ 170 | > 170 |

Output: `"slow"`, `"normal"`, or `"fast"`

---

## Slide Aggregation Logic

The function iterates over every key in the slide-indexed transcript dict. For each slide:

1. Extract `words`, `start_time`, `end_time`
2. Compute all 7 metrics
3. Package into `SlideMetrics` object
4. Key the result by the same slide ID (`slide_0`, `slide_1`, ...)

The output dict must have the same keys as the input dict. No slides should be dropped.

---

## Performance Expectations

| Metric | Target |
|--------|--------|
| 10-slide presentation | < 200ms total |
| 50-slide presentation | < 500ms total |
| Memory | O(n) where n = total words |

This module does no I/O. It is pure computation over in-memory data. Performance should not be a concern.

---

## Edge Cases

| Case | Handling |
|------|----------|
| Slide with 0 words | `word_count: 0`, `wpm: 0`, empty arrays for fillers/pauses/repeats, `pace: "slow"` |
| Slide with 1 word | `word_count: 1`, compute WPM normally, no pauses possible, no bigrams |
| Duration of 0 seconds | `wpm: 0` |
| All words are fillers | Count them all, no special treatment |
| Same phrase repeated across slides | Each slide is independent — only count within-slide repetitions |

---

## Implementation Notes

- Use Python `collections.Counter` for n-gram counting
- Use `string.punctuation` for stripping
- All string comparisons are case-insensitive
- Timestamps are floats in seconds
- Round WPM to 1 decimal place
- Round pause durations to 1 decimal place
