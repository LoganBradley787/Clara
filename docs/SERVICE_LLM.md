# Clara — LLM Service Specification

This module generates structured per-slide speaking feedback, a coaching summary, and chat responses using the OpenAI Chat Completions API. It is the only component that makes LLM calls.

Implemented as a Python module within the FastAPI application: `app/llm_feedback.py`

---

## OpenAI Chat Completions Usage

### API Client

All LLM calls go through the official `openai` Python SDK (`client.chat.completions.create`). A single shared client is constructed per call site via `_get_openai_client()`.

```python
import openai
client = openai.OpenAI(api_key=OPENAI_API_KEY)
```

**Required environment variables (defined in `app/config.py`):**

```
OPENAI_API_KEY=<key>              # shared with Whisper transcription
OPENAI_MODEL=gpt-5.4-mini         # default; override to switch model
```

No other environment variables are needed for this module.

### Request Format

```python
response = client.chat.completions.create(
    model=OPENAI_MODEL,
    messages=[
        {"role": "system", "content": "..."},
        {"role": "user", "content": "..."},
    ],
    temperature=0.1,
    max_completion_tokens=1024,
    response_format={"type": "json_object"},  # per-slide feedback only
)
content = response.choices[0].message.content
```

### Response Format

| Call type | `response_format` | Parsing |
|-----------|-------------------|---------|
| Per-slide feedback + observations | `{"type": "json_object"}` (JSON object mode) | `_extract_json_object` |
| Coaching summary | Plain text | `_extract_json_array` (custom JSON-array extractor that strips markdown fences and finds the outermost `[...]`) |
| Chat | Plain text | None — content returned as-is |

### Temperature and Tokens

| Call type | Temperature | max_completion_tokens |
|-----------|-------------|----------------------|
| Per-slide feedback | 0.1 | 1024 |
| Coaching summary | 0.1 | 1024 |
| Chat | 0.3 | 1024 |

> Newer OpenAI models (gpt-5.x and reasoning models like o1/o3) reject `max_tokens` — the parameter was renamed to `max_completion_tokens`. Clara passes `max_completion_tokens` exclusively. If you switch to a legacy model that only accepts `max_tokens`, you'll need to adapt the call wrapper.

The low temperatures for feedback and coaching reflect that pre-computed evidence grounds the LLM and creativity is not needed. Chat uses a slightly higher temperature to allow conversational variation.

### Call Wrappers

Two internal helpers wrap the SDK:

- `_call_llm(client, system_prompt, user_prompt, json_object=False)` — builds a two-message conversation.
- `_call_llm_messages(client, messages, max_completion_tokens=1024, temperature=0.1, json_object=False)` — accepts a full message list (used for chat with history).

Both are invoked from async code via `asyncio.to_thread(...)` because the SDK call is synchronous.

---

## Purpose and Scope

The LLM exists to catch **language-level patterns that regex and counting cannot detect**, and to produce holistic slide-level observations about content coverage. It does NOT duplicate the deterministic analytics layer (WPM, filler words, pauses, repeated phrases via n-gram counting). It does NOT provide subjective style critiques or encouragement.

---

## Allowed Flag Types

Exactly 4 flag types. No others are permitted. (Defined in `FeedbackType` in `app/models.py`.)

### REPETITION
The same phrase or sentence structure repeated **across slides** (not within a single slide — the deterministic n-gram counter handles intra-slide repetition). Example: "the key thing is" appears on slides 2, 4, and 6.

### HEDGE_STACK
Multiple hedging words piled into the **same sentence** (3 or more). Individual hedges ("maybe", "probably") are fine and not flagged. Example: "I sort of kind of think maybe we should probably consider this."

### FALSE_START
Speaker begins a sentence, abandons it, and restarts. Example: "So the architecture is — well actually the way we built it is — so basically the architecture..."

### SLIDE_READING
Transcript closely matches the slide text verbatim. Only flag this if slide text (from PDF extraction) is provided in the input. Compare the transcript segment to the slide text and flag if the speaker is clearly just reading the slide word-for-word.

### Killed Flag Types

These are **permanently removed** and must never appear:

- ~~CLARITY~~ — too subjective, LLM invents problems
- ~~DICTION~~ — style policing nobody asked for
- ~~TIMING~~ — restates duration stat from metrics
- ~~PACING~~ — restates WPM stat from metrics
- Any positive feedback, encouragement, or "good job" comments

---

## Observation Types

Observations are holistic, slide-level assessments returned alongside flags. Currently only `CONTENT_COVERAGE` is supported. **Observations are optional** — most slides should have an empty array.

### CONTENT_COVERAGE
Speaker skipped significant concepts from the slide. **Requires PDF text (10+ normalized words).** The LLM identifies covered and missed *concepts* semantically — synonyms and paraphrasing count as covered (e.g., "rocks" on slide + "gravel" in speech = covered). Returns structured evidence: `{"concepts_covered": [...], "concepts_missed": [...]}`.

**Constraints:**
- Maximum 1 observation per slide
- Empty array is the norm — observations are never forced
- No encouragement, praise, or subjective quality ratings

---

## Evidence-Grounded Prompt Architecture

The LLM is unreliable when asked to discover patterns from raw text alone. To ensure consistent, accurate output, the module pre-computes algorithmic evidence and provides it alongside the transcript, so the LLM's role is to **synthesize and interpret** pre-validated data rather than discover patterns unaided.

### Pre-Computation Phase (runs before any LLM call)

1. **Annotated Transcript**: The full transcript is formatted with `[Slide N]` markers (1-indexed in the prompt) so the LLM can see slide boundaries. See `_build_annotated_transcript`.

2. **Cross-Slide N-gram Repetitions**: `_find_cross_slide_repetitions` finds n-grams of length 3–6 words that appear on 2+ distinct slides. Substring duplicates that share the same slide set are removed (if "the key thing is" repeats on slides {2,4}, "key thing is" with the same slide set is dropped). Results are passed as evidence for REPETITION flags. If no algorithmic repetitions are found, the LLM is explicitly told NOT to flag REPETITION.

3. **Transcript-to-Slide Similarity**: `_compute_text_similarity` computes the word-overlap coefficient (`|intersection| / min(|t_words|, |s_words|)`) between the spoken transcript and PDF slide text. SLIDE_READING is only enabled when similarity ≥ 0.5. Also gates CONTENT_COVERAGE — if no slide text is available, content coverage is not assessed.

### Post-Validation Phase (runs after each LLM response)

**Flags (`_validate_flags`):**
1. Unknown `type` values are dropped.
2. `text` must be non-empty; `text` and `detail` are truncated to 200 chars.
3. `detail` containing any banned phrase (see below) is dropped.
4. `text` (normalized) must appear in the slide's normalized transcript. Fabricated quotes are dropped.
5. REPETITION: the flagged phrase must overlap with a pre-computed cross-slide n-gram on this slide. Otherwise dropped.
6. SLIDE_READING: requires `slide_text` present and `similarity >= 0.5`. Otherwise dropped.
7. Truncated to the first 2 valid items.

**Observations (`_validate_observations`):**
1. Only `CONTENT_COVERAGE` is accepted.
2. `detail` must be non-empty; truncated to 250 chars; banned-phrase check applied.
3. Requires `slide_text` and `pdf_word_count >= 10`.
4. `evidence` must be a dict containing a non-empty `concepts_missed` list.
5. `concepts_covered` and `concepts_missed` are sanitized to lists of strings, each capped at 10 entries.
6. Truncated to the first 1 valid item.

### System Prompt

```
You are a precise presentation transcript analyzer. You identify specific language-level patterns that a word-counting algorithm cannot detect, and you assess holistic slide-level issues like content coverage and transitions.

## ALLOWED FLAG TYPES (only these four):

REPETITION — The same phrase or sentence structure appears across MULTIPLE slides (not within one slide). You will be given pre-computed repeated n-grams as evidence. Only flag REPETITION if the pre-computed data confirms the phrase appears on 2+ slides. If no pre-computed repetitions are provided, do NOT flag REPETITION.

HEDGE_STACK — Three or more hedging words piled into the SAME sentence. Individual hedges (one "maybe" or one "probably") are normal and must NOT be flagged. Only flag when 3+ hedges cluster together. Examples of hedge words: maybe, probably, sort of, kind of, I think, I guess, perhaps, might, could, somewhat, a little bit.

FALSE_START — Speaker starts a sentence, abandons it mid-thought, then restarts. Must show a clear break and restart. Pausing is NOT a false start. Filler words alone are NOT false starts. Look for interrupted syntax: "So the plan is — well actually what we — the plan is to..."

SLIDE_READING — Speaker reads the slide text nearly word-for-word. ONLY flag this when slide text (from PDF) is explicitly provided AND a similarity score is given. If no slide text is provided, NEVER flag SLIDE_READING. If the similarity score is below 0.5, do NOT flag SLIDE_READING.

## ALLOWED OBSERVATION TYPES:

CONTENT_COVERAGE — Speaker skipped significant concepts from the slide. ONLY when slide text (from PDF) is provided. Identify concepts semantically — synonyms and paraphrasing count as covered (e.g., "rocks" on slide + "gravel" in speech = covered). Return evidence with "concepts_covered" and "concepts_missed" arrays. If all concepts were addressed, do NOT observe CONTENT_COVERAGE.

## RULES:
- Return a JSON object: {"flags": [...], "observations": [...]}
- Return at most 2 flags and at most 1 observation per slide.
- Empty arrays are expected for most slides. Never force output.
- Flag "text" fields MUST contain an exact quote from the slide's transcript.
- Do NOT flag speaking pace, word count, duration, filler words, or pauses.
- Do NOT provide encouragement, praise, or suggestions.
- Do NOT flag grammar, vocabulary, or style choices.
- Respond ONLY with a valid JSON object. No markdown fences, no explanation.
```

### User Prompt Template

```
PRESENTATION CONTEXT:
- Tone: {tone}
- Context: {context}

FULL PRESENTATION TRANSCRIPT (with slide boundaries):
{annotated_transcript}

---

ANALYZING SLIDE {slide_number} OF {total_slides}:
Transcript: "{slide_transcript}"
{evidence_section}
Based ONLY on the evidence above, return a JSON object for Slide {slide_number}:

{
  "flags": [
    {"type": "REPETITION|HEDGE_STACK|FALSE_START|SLIDE_READING", "text": "exact quote", "detail": "under 200 chars"}
  ],
  "observations": [
    {"type": "CONTENT_COVERAGE", "detail": "under 250 chars", "evidence": {"concepts_covered": [...], "concepts_missed": [...]}}
  ]
}

If nothing qualifies: {"flags": [], "observations": []}
```

The `{evidence_section}` is built dynamically by `_build_evidence_section` and includes:

- **Pre-computed cross-slide repetitions** relevant to this slide (up to 5), formatted as `"<gram>" appears on slides: N, M`, with a softening note. If none, an explicit `"None detected. Do NOT flag REPETITION."` line.
- **Slide text and similarity score** (if PDF text is present and similarity > 0), followed by either an "OK to flag if reading verbatim" note (similarity ≥ 0.5) or a "Do NOT flag SLIDE_READING" note.
- **Content-coverage instructions** when slide text is available, telling the LLM to compare concepts semantically. If no slide text, an explicit `"SLIDE TEXT: Not available. Do NOT flag SLIDE_READING. Do NOT observe CONTENT_COVERAGE."` line.

**Note:** `slide_duration` and `slide_word_count` are intentionally excluded from the prompt to prevent the LLM from commenting on metrics.

---

## PDF Text Extraction

PDF slide text is **not** extracted inside this module. The pipeline pre-extracts it upstream in `gateway._extract_slide_texts` using PyMuPDF (`fitz`) and passes the resulting `Dict[str, str]` (keyed by `slide_0`, `slide_1`, ...) to `generate_llm_feedback` as the `slide_texts` argument.

This module just reads from that dict via `slide_texts.get(slide_id, "").strip()`.

---

## Slide-Focused Analysis

The LLM is called once per slide. Each call:

1. Receives the full annotated transcript (with `[Slide N]` markers) as context
2. Is told to focus only on the current slide
3. Receives pre-computed cross-slide n-gram repetitions relevant to this slide
4. Receives the PDF slide text and computed similarity score (if available)

**Why per-slide calls instead of one bulk call:**
- Better focus and specificity per slide
- Avoids exceeding token limits for long presentations
- Allows structured per-slide JSON output that round-trips through validation independently

Slides whose `words` list is empty are skipped entirely — no API call is made, and the result entries are `SlideFeedback(feedback=[])` and `SlideObservations(observations=[])`.

---

## Feedback Item Schema

Each feedback item:

| Field | Type | Constraints |
|-------|------|-------------|
| `type` | string | One of: `REPETITION`, `HEDGE_STACK`, `FALSE_START`, `SLIDE_READING` |
| `text` | string | Exact quote from the slide's transcript. Max 200 chars (truncated with `...`). |
| `detail` | string | Brief explanation. Max 200 chars (truncated with `...`). |

Each observation item:

| Field | Type | Constraints |
|-------|------|-------------|
| `type` | string | `CONTENT_COVERAGE` |
| `detail` | string | Max 250 chars (truncated with `...`). |
| `evidence` | object | `{"concepts_covered": [str, ...], "concepts_missed": [str, ...]}`, each list capped at 10 strings. `concepts_missed` must be non-empty. |

**Maximum 2 flags and 1 observation per slide.** Excess items are truncated.

---

## Banned Phrases

Detail strings containing any of these (case-insensitive substring match) are dropped during post-validation:

```python
BANNED_PHRASES = [
    "great job", "well done", "excellent", "good work",
    "nicely done", "impressive", "keep it up", "good job",
    "try to be more", "consider being more", "you should try",
]
```

---

## Public Interface

```python
async def generate_llm_feedback(
    slide_transcript: Dict[str, SlideTranscript],
    expectations: Expectations,
    full_text: str,
    slide_texts: Dict[str, str],
) -> Tuple[Dict[str, SlideFeedback], Dict[str, SlideObservations]]:
    ...
```

Returns a **tuple** `(feedback_dict, observations_dict)`. Every slide ID in the input appears in both dicts, even if its lists are empty.

**Example output:**

```python
(
    {
        "slide_0": SlideFeedback(feedback=[
            FeedbackItem(type="REPETITION", text="you know", detail="Phrase 'you know' appears on slides 2, 5, 7"),
        ]),
        "slide_1": SlideFeedback(feedback=[]),
    },
    {
        "slide_0": SlideObservations(observations=[
            ObservationItem(
                type="CONTENT_COVERAGE",
                detail="Speaker addressed encryption but skipped the key-rotation and audit-logging points listed on the slide.",
                evidence={
                    "concepts_covered": ["encryption", "TLS"],
                    "concepts_missed": ["key rotation", "audit logging"],
                },
            ),
        ]),
        "slide_1": SlideObservations(observations=[]),
    },
)
```

---

## Coaching Summary

After per-slide feedback is generated and the per-slide results are aggregated, `generate_coaching_summary(results: PresentationResults)` makes one additional OpenAI call to produce up to 3 prioritized coaching tips.

### Input

A structured context string built by `_build_coaching_context` from the full `PresentationResults`: overall metrics, a per-slide line containing WPM / pace / filler count / pause count / feedback summaries, and the full per-slide transcripts with `[Slide N]` headers.

### Output

A list of up to 3 `CoachingTip`:

| Field | Type | Constraints |
|-------|------|-------------|
| `title` | string | Verb-first action item. Max 100 chars (truncated with `...`). |
| `explanation` | string | References specific data. Max 300 chars (truncated with `...`). |
| `slide_references` | list[str] | `slide_N` IDs; filtered to only IDs that exist in the results. |

Both `title` and `explanation` are post-processed by `_humanize_slide_refs`, which rewrites `slide_N` → `Slide N+1` so end users see `Slide 1` rather than `slide_0`. `slide_references` itself is left in the canonical `slide_N` form.

### Call Details

- Plain-text response (not JSON object mode).
- Parsing is done by `_parse_coaching_tips`, which uses `_extract_json_array` to find the outermost `[...]`, then `json.loads`.
- Temperature 0.1, max_completion_tokens 1024.

### COACHING_SYSTEM_PROMPT

```
You are a presentation coach providing a post-practice debrief. Based on the complete analytics below, provide exactly 3 specific, actionable coaching tips prioritized by impact.

RULES:
- Return exactly 3 tips as a JSON array.
- Each tip: {"title": "...", "explanation": "...", "slide_references": ["slide_0", ...]}
- "title": max 100 characters, a clear action item (verb-first).
- "explanation": max 300 characters, reference specific data (slide numbers, word counts, specific phrases from the transcript).
- "slide_references": the slide IDs most relevant to this tip.
- Each tip must address a DIFFERENT aspect of the presentation.
- Be concrete: "Replace 'kind of' with a deliberate pause" not "reduce filler words".
- No praise, no encouragement, no generic advice like "practice more".
- Respond ONLY with a valid JSON array. No markdown fences, no explanation.
```

---

## Chat / Conversational Follow-Up

`generate_chat_response(results, chat_history, user_message)` answers user follow-up questions about a completed presentation.

### Conversation History

History is a `List[Dict[str, str]]` of `{"role": ..., "content": ...}` pairs. **It is owned and persisted by the gateway**, not by this module. The function simply receives the full history on each call, prepends a system message, appends the new user message, and sends the entire list to OpenAI.

### System Prompt

Built from `CHAT_SYSTEM_TEMPLATE` with `{context}` filled by the same `_build_coaching_context(results)` used for coaching tips:

```
You are Clara, an AI presentation coach. A student just finished a practice presentation and is reviewing their analytics. Answer their questions about their performance using the data below.

{context}

RULES:
- Reference specific slides, timestamps, and phrases from the transcript.
- Be direct, specific, and concise (under 250 words).
- Add insight beyond what the raw numbers show — explain WHY a pattern matters.
- If they ask about a specific slide, quote relevant parts of their transcript.
- Don't repeat data they can already see. Add interpretation and actionable advice.
- Stay focused on this presentation's data. No generic self-help.
- No praise or encouragement. Just coaching.
```

### Call Details

- Plain-text response (no JSON parsing).
- Temperature 0.3, max_completion_tokens 1024.
- The raw stripped string is returned to the caller.

---

## Error Handling

| Error | Handling |
|-------|----------|
| Per-slide JSON parse failure (`JSONDecodeError`, `KeyError`, `TypeError`) | Retry the call once with the same prompt. If the retry also fails, log a warning and return empty feedback and observations for that slide. The rest of the presentation continues. |
| Per-slide OpenAI SDK exception (network, auth, rate limit, etc.) | Not caught — bubbles up to the gateway, which marks the presentation as `failed`. |
| LLM returns extra flag/observation items | Truncated to 2 flags / 1 observation. |
| LLM returns banned phrases in `detail` | Item silently dropped. |
| Quote not found in slide transcript | Flag silently dropped. |
| REPETITION not in pre-computed grams | Flag silently dropped. |
| SLIDE_READING with low similarity or no slide text | Flag silently dropped. |
| CONTENT_COVERAGE without PDF text / `concepts_missed` | Observation silently dropped. |
| Empty slide (no `words`) | Skip the OpenAI call; return empty feedback and observations. |
| Coaching summary call failure (any `Exception`) | Caught at the call site; logged and an empty `List[CoachingTip]` is returned. The presentation still completes. |
| Chat call failure (any `Exception`) | Caught, logged, and re-raised so the gateway returns HTTP 500 to the client. |

---

## Provider Notes

- All LLM inference (per-slide feedback, coaching summary, chat) goes through OpenAI Chat Completions.
- OpenAI is also used for Whisper transcription elsewhere in the pipeline; both share `OPENAI_API_KEY`.
- The model and API key are configurable via environment variables (`OPENAI_MODEL`, `OPENAI_API_KEY`).
- No LLM data is persisted — all calls are stateless inference requests. Chat history persistence lives in the gateway's in-memory presentation record.
