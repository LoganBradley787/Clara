# Clara — Manual Analytics Service Specification

This module computes objective, algorithmic speaking metrics from slide-indexed transcripts. No LLM calls, no network I/O. Pure computation.

Implemented as a Python module within the FastAPI application: `app/manual_analytics.py`

> **Note on logging:** The current implementation emits verbose `logger.warning("[PAUSE DIAG] ...")` lines for every word pair while computing pauses. These are debug-only diagnostics retained during calibration; they are scheduled to be removed or downgraded to `logger.debug` in a subsequent cleanup pass. They do not perform external I/O.

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
  "tone": "professional",
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

If `duration_seconds == 0` **or** `word_count == 0`, set `wpm` to `0.0`.

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
        continue  # skip bigram check so the same word is not reused
                  # as the first token of a multi-word filler

    # Check multi-word fillers (bigrams)
    if i + 1 < len(slide.words):
        bigram = normalized + " " + slide.words[i+1].word.lower().strip(punctuation)
        if bigram in MULTI_FILLERS:
            record filler instance (use first word's timestamp)
```

**Filler-bigram skip:** When a word matches a single-word filler, the loop `continue`s to the next iteration. This prevents the matched word from also being counted as the start of a multi-word filler bigram on the same step. The next word still gets its own independent check.

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
| professional | 2.0 seconds |
| conversational | 3.0 seconds |
| educational | 2.5 seconds |
| persuasive | 2.0 seconds |
| storytelling | 3.5 seconds |

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
- `duration_seconds` = `end - start`, rounded to 1 decimal place

**Rounding detail:** the implementation uses `math.floor((end - start) * 10 + 0.5) / 10` rather than Python's built-in `round()`. This avoids banker's rounding (round-half-to-even) and always rounds halves up. For positive durations the result is functionally equivalent to "round to 1 decimal place."

### 6. Repetition Detection

Find phrases (2-word and 3-word n-grams, exclusively — no other sizes) that appear 2 or more times within a slide.

**Algorithm:**

```
words_lower = [w.word.lower().strip(punctuation) for w in slide.words]
seen_phrases = set()

# Generate bigrams and trigrams (n=2 first, then n=3)
for n in [2, 3]:
    if len(words_lower) < n:
        continue
    ngrams = [" ".join(words_lower[i:i+n]) for i in range(len(words_lower) - n + 1)]
    counts = Counter(ngrams)

    for phrase, count in counts.items():
        if count >= 2 and not is_all_stop_words(phrase) and phrase not in seen_phrases:
            record repeated phrase
            seen_phrases.add(phrase)
```

**De-duplication across n:** The `seen_phrases` set is shared across the n=2 and n=3 passes. Because n=2 is processed first, any bigram already recorded at n=2 will not be recorded again at n=3 (this matters when a recorded bigram appears as a substring of a recorded trigram, or in any case where the same exact phrase string surfaces in both passes). Each unique phrase string is reported at most once with the count from the pass that first matched it.

**Stop words to exclude:**
`the`, `a`, `an`, `is`, `are`, `was`, `were`, `be`, `been`, `being`, `have`, `has`, `had`, `do`, `does`, `did`, `will`, `would`, `could`, `should`, `may`, `might`, `can`, `shall`, `to`, `of`, `in`, `for`, `on`, `with`, `at`, `by`, `from`, `it`, `its`, `this`, `that`, `and`, `or`, `but`, `not`, `no`, `if`, `then`, `than`, `so`, `as`

A phrase is excluded only if ALL words in it are stop words.

**Output per phrase:**
```json
{"phrase": "climate change", "count": 3}
```

### 7. Speaking Pace Classification

Compare computed WPM against tone-specific ranges. These ranges are calibrated for live presentations — **normal conversational pace is anchored at ~125 WPM**.

| Tone | Slow | Normal (inclusive) | Fast |
|------|------|--------|------|
| professional | < 100 | 100 ≤ WPM ≤ 135 | > 135 |
| conversational | < 100 | 100 ≤ WPM ≤ 140 | > 140 |
| educational | < 95 | 95 ≤ WPM ≤ 130 | > 130 |
| persuasive | < 110 | 110 ≤ WPM ≤ 150 | > 150 |
| storytelling | < 95 | 95 ≤ WPM ≤ 135 | > 135 |

If an unknown tone is supplied, the classifier falls back to the conversational range `(100, 140)`.

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

This module does no network or disk I/O. It is pure computation over in-memory data. Performance should not be a concern.

The pause-detection function currently emits per-word-pair `logger.warning("[PAUSE DIAG] ...")` diagnostic lines. These are intentional debug-only output retained during pace/pause calibration and are slated for removal or downgrade to `logger.debug` in a follow-up cleanup; they may affect log volume but do not constitute external I/O.

---

## Edge Cases

| Case | Handling |
|------|----------|
| Slide with 0 words (`word_count == 0`) | `word_count: 0`, `wpm: 0.0` (forced, regardless of duration), empty arrays for fillers/pauses/repeats, `pace` classified from `wpm=0` (typically `"slow"`) |
| Slide with 1 word | `word_count: 1`, compute WPM normally, no pauses possible, no bigrams |
| Duration of 0 seconds | `wpm: 0.0` |
| Either `duration_seconds == 0` or `word_count == 0` | `wpm: 0.0` (the WPM guard short-circuits on either condition) |
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
