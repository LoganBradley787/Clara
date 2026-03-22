# Clara — Snowflake LLM Service Specification

This module generates structured, per-slide speaking feedback using Snowflake Cortex REST API. It is the only component that makes LLM calls.

Implemented as a Python module within the FastAPI application: `app/llm_feedback.py`

---

## Snowflake Cortex Usage

### API Endpoint

Snowflake Cortex REST API — Complete endpoint.

**Base URL:**
```
https://<account>.snowflakecomputing.com/api/v2/cortex/inference:complete
```

**Authentication:** Bearer token (JWT or OAuth token from Snowflake)

**Required environment variables:**
```
SNOWFLAKE_ACCOUNT=<account_identifier>
SNOWFLAKE_USER=<username>
SNOWFLAKE_PASSWORD=<password>
SNOWFLAKE_ROLE=<role>        # e.g., CORTEX_USER_ROLE
SNOWFLAKE_WAREHOUSE=<warehouse>
```

### Request Format

```json
{
  "model": "mistral-large2",
  "messages": [
    {
      "role": "system",
      "content": "..."
    },
    {
      "role": "user",
      "content": "..."
    }
  ],
  "temperature": 0.3,
  "max_tokens": 1024
}
```

**Model selection:** Use `mistral-large2` or `llama3.1-70b` (available on Cortex). Prefer `mistral-large2` for better instruction following. Make model configurable via environment variable `CORTEX_MODEL`.

**Temperature:** 0.1 — very low for maximum consistency. Pre-computed evidence grounds the LLM so creativity is not needed.

### Authentication Flow

1. Generate a JWT token using Snowflake key-pair authentication, OR
2. Use username/password to get a session token via Snowflake's token endpoint

For hackathon simplicity, use the Snowflake Python connector to obtain a session token:

```python
import snowflake.connector
import requests

conn = snowflake.connector.connect(
    account=SNOWFLAKE_ACCOUNT,
    user=SNOWFLAKE_USER,
    password=SNOWFLAKE_PASSWORD,
    role=SNOWFLAKE_ROLE,
    warehouse=SNOWFLAKE_WAREHOUSE
)
token = conn.rest.token
```

Then use `Authorization: Bearer {token}` on Cortex REST calls.

---

## Purpose and Scope

The LLM exists to catch **language-level patterns that regex and counting cannot detect**. It does NOT duplicate the deterministic analytics layer (WPM, filler words, pauses, repeated phrases via n-gram counting). It does NOT provide subjective style critiques or encouragement.

---

## Allowed Flag Types

Exactly 4 flag types. No others are permitted.

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

Observations are holistic, slide-level assessments returned alongside flags. Currently only CONTENT_COVERAGE is supported. **Observations are optional** — most slides should have an empty array.

### CONTENT_COVERAGE
Speaker skipped significant concepts from the slide. **Requires PDF text (10+ words).** The LLM identifies covered and missed *concepts* semantically — synonyms and paraphrasing count as covered (e.g., "rocks" on slide + "gravel" in speech = covered). Returns structured evidence: `{"concepts_covered": [...], "concepts_missed": [...]}`.

**Constraints:**
- Maximum 1 observation per slide
- Empty array is the norm — observations are never forced
- No encouragement, praise, or subjective quality ratings

---

## Evidence-Grounded Prompt Architecture

The LLM is unreliable when asked to discover patterns from raw text alone. To ensure consistent, accurate output, the module pre-computes algorithmic evidence and provides it alongside the transcript, so the LLM's role is to **synthesize and interpret** pre-validated data rather than discover patterns unaided.

### Pre-Computation Phase (runs before any LLM call)

1. **Annotated Transcript**: The full transcript is formatted with `[Slide N]` markers so the LLM can see slide boundaries. This prevents the LLM from guessing where slides start and end.

2. **Cross-Slide N-gram Repetitions**: An algorithmic pass finds n-grams (3–6 words) that appear on 2+ distinct slides. These are provided as evidence for REPETITION flags. If no algorithmic repetitions are found, the LLM is explicitly told NOT to flag REPETITION.

3. **Transcript-to-Slide Similarity**: A word-overlap coefficient is computed between the spoken transcript and PDF slide text. SLIDE_READING is only enabled when similarity ≥ 0.5. Also gates CONTENT_COVERAGE — if no slide text is available, content coverage is not assessed.

### Post-Validation Phase (runs after each LLM response)

**Flags:**
1. **Quote Verification**: The `text` field must appear verbatim in the slide's transcript. Flags with fabricated quotes are silently dropped.
2. **REPETITION Verification**: The flagged phrase must match a pre-computed cross-slide n-gram. Hallucinated repetitions are dropped.
3. **SLIDE_READING Verification**: The similarity score must be ≥ 0.5 and slide text must be present. Otherwise the flag is dropped.

**Observations:**
4. **CONTENT_COVERAGE Verification**: Drop if no PDF text, slide has < 10 words of PDF text, evidence dict missing, or `concepts_missed` is empty.

### System Prompt

```
You are a precise presentation transcript analyzer. You identify specific
language-level patterns that a word-counting algorithm cannot detect.

## ALLOWED FLAG TYPES (only these four):

REPETITION — The same phrase or sentence structure appears across MULTIPLE slides
(not within one slide). You will be given pre-computed repeated n-grams as evidence.
Only flag REPETITION if the pre-computed data confirms the phrase appears on 2+ slides.
If no pre-computed repetitions are provided, do NOT flag REPETITION.

HEDGE_STACK — Three or more hedging words piled into the SAME sentence. Individual
hedges (one "maybe" or one "probably") are normal and must NOT be flagged.
Only flag when 3+ hedges cluster together. Examples of hedge words: maybe, probably,
sort of, kind of, I think, I guess, perhaps, might, could, somewhat, a little bit.

FALSE_START — Speaker starts a sentence, abandons it mid-thought, then restarts.
Must show a clear break and restart. Pausing is NOT a false start. Filler words
alone are NOT false starts. Look for interrupted syntax.

SLIDE_READING — Speaker reads the slide text nearly word-for-word. ONLY flag this
when slide text (from PDF) is explicitly provided AND a similarity score is given.
If no slide text is provided, NEVER flag SLIDE_READING. If the similarity score is
below 0.5, do NOT flag SLIDE_READING.

## RULES:
- Return at most 2 flags and at most 1 observation per slide.
- Empty arrays are expected for most slides. Never force output.
- The "text" field MUST contain an exact quote from the slide's transcript.
- Do NOT flag speaking pace, word count, duration, filler words, or pauses.
- Do NOT provide encouragement, praise, or suggestions.
- Do NOT flag grammar, vocabulary, or style choices.
- ONLY flag patterns with clear, specific evidence from the transcript.
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
Based ONLY on the evidence above, return a JSON object with two arrays for Slide {slide_number}.

{
  "flags": [...],
  "observations": [...]
}

FLAGS (language-level patterns):
- "type": one of REPETITION, HEDGE_STACK, FALSE_START, SLIDE_READING
- "text": exact quote from THIS slide's transcript
- "detail": explanation under 200 characters

OBSERVATIONS (holistic slide-level):
- "type": "CONTENT_COVERAGE"
- "detail": explanation under 250 characters
- "evidence": {"concepts_covered": [...], "concepts_missed": [...]}

If nothing qualifies, return: {"flags": [], "observations": []}
```

The `{evidence_section}` is dynamically built and includes:
- **Pre-computed cross-slide repetitions** relevant to this slide, or an explicit "None detected" message
- **Slide text + similarity score** (if PDF text available), or an explicit "Not available" message
- **Content coverage instructions** (if slide text available), telling the LLM to compare concepts semantically

**Note:** `slide_duration` and `slide_word_count` are intentionally excluded from the prompt to prevent the LLM from commenting on metrics.

### Temperature

`0.1` — lowered from 0.3 for maximum consistency. The pre-computed evidence reduces the need for LLM creativity.

---

## PDF Text Extraction

To support SLIDE_READING detection, the pipeline extracts text from each PDF slide page using PyMuPDF (`fitz`).

```python
import fitz  # PyMuPDF

def extract_slide_texts(pdf_path: str, total_slides: int) -> Dict[str, str]:
    doc = fitz.open(pdf_path)
    slide_texts = {}
    for i in range(min(total_slides, len(doc))):
        slide_texts[f"slide_{i}"] = doc[i].get_text().strip()
    doc.close()
    return slide_texts
```

This runs once per presentation before the analysis phase. The resulting dict is passed to `generate_llm_feedback()`.

---

## Slide-Focused Analysis

The LLM is called N times for N slides. Each call:

1. Receives the full annotated transcript (with `[Slide N]` markers) as context
2. Is told to focus only on the current slide
3. Receives pre-computed cross-slide n-gram repetitions relevant to this slide
4. Receives the PDF slide text and computed similarity score (if available)

**Why per-slide calls instead of one bulk call:**
- Better focus and specificity per slide
- Avoids exceeding token limits for long presentations
- Allows structured output per slide
- Each slide's feedback is independent and parseable

---

## Concise Feedback Format

Each feedback item:

| Field | Type | Constraints |
|-------|------|-------------|
| `type` | string | One of: `REPETITION`, `HEDGE_STACK`, `FALSE_START`, `SLIDE_READING` |
| `text` | string | The specific words or phrase flagged from the transcript. Max 200 chars. |
| `detail` | string | Brief explanation. Max 200 characters. |

**Maximum 2 feedback items per slide.** If the LLM returns more, truncate to first 2.

---

## Structured Response Schema

The LLM must return a JSON **object** with two arrays: `flags` and `observations`.

```json
{
  "flags": [
    {"type": "HEDGE_STACK", "text": "...", "detail": "..."}
  ],
  "observations": [
    {"type": "CONTENT_COVERAGE", "detail": "...", "evidence": {"concepts_covered": [...], "concepts_missed": [...]}}
  ]
}
```

Parse and validate each array independently. See `_parse_and_validate()` in `app/llm_feedback.py` for the full implementation.

---

## Constraints to Avoid Generic AI Feedback

These constraints are enforced through three layers: prompt design, pre-computed evidence, and post-validation.

### Layer 1: Prompt Design
| Constraint | Enforcement |
|-----------|-------------|
| No praise or encouragement | System prompt rule |
| No metrics commentary | System prompt rule. No duration, WPM, or word count observations |
| No grammar/style policing | System prompt rule. Only hedge stacking triggers language critique |
| Must reference transcript | System prompt rule. `text` field must contain actual words from transcript |
| Empty array for clean slides | System prompt rule. No forced feedback |

### Layer 2: Pre-Computed Evidence
| Constraint | Enforcement |
|-----------|-------------|
| REPETITION must be real | Pre-computed n-gram analysis confirms cross-slide repetitions before the LLM sees them. If none found, LLM is told "do NOT flag REPETITION" |
| SLIDE_READING must be real | Similarity score computed between transcript and slide text. If < 0.5, LLM is told "do NOT flag SLIDE_READING" |
| Slide boundaries are visible | Annotated transcript with `[Slide N]` markers prevents the LLM from guessing boundaries |

### Layer 3: Post-Validation
| Constraint | Enforcement |
|-----------|-------------|
| Quote exists in transcript | `text` field is checked against the normalized slide transcript. Fabricated quotes are dropped |
| REPETITION is confirmed | Flagged phrase must match a pre-computed cross-slide n-gram. Hallucinated repetitions are dropped |
| SLIDE_READING is confirmed | Similarity must be ≥ 0.5 and slide text must be present. Otherwise dropped |
| Only 4 flag types | Unknown types silently dropped |
| Under 200 characters | Post-processing truncation on both `text` and `detail` |
| Max 2 per slide | Post-processing truncation |
| No banned phrases | Responses containing "great job", "well done", "excellent", etc. are filtered |

**Post-processing filters:**

```python
BANNED_PHRASES = [
    "great job", "well done", "excellent", "good work",
    "nicely done", "impressive", "keep it up", "good job",
    "try to be more", "consider being more", "you should try"
]
```

---

## Deterministic Output Structure

The module returns a dict keyed by slide ID:

```python
async def generate_llm_feedback(
    slide_transcript: Dict[str, SlideTranscript],
    expectations: Expectations,
    full_text: str,
    slide_texts: Dict[str, str],
) -> Dict[str, SlideFeedback]:
```

**Output:**
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

Every slide in the input must have a corresponding entry in the output, even if `feedback` is empty.

---

## Error Handling

| Error | Handling |
|-------|----------|
| Cortex API returns non-200 | Retry once after 2 seconds. If still failing, raise exception (pipeline marks presentation as `failed`) |
| LLM returns invalid JSON | Retry once with same prompt. If still invalid, return empty feedback for that slide |
| LLM returns too many items | Truncate to 2 |
| LLM returns banned phrases | Filter them out silently |
| Cortex rate limit (429) | Wait 5 seconds, retry once |
| Empty slide (no transcript) | Skip LLM call, return `{"feedback": []}` |

---

## Performance Expectations

| Metric | Target |
|--------|--------|
| Per-slide API call | 2–10 seconds |
| 10-slide presentation | 20–100 seconds total (sequential) |
| Optimization | Consider parallel API calls if rate limits allow |

**Note:** For hackathon, sequential calls are acceptable. If time permits, use `asyncio.gather` with a semaphore to parallelize up to 3 concurrent calls.

---

## Coaching Summary Generation

After all per-slide feedback is generated and results are aggregated, a single additional Cortex call generates an overall coaching summary.

### Input
The full aggregated results: all slide transcripts, metrics, per-slide feedback, overall metrics, and expectations.

### Output
Exactly 3 coaching tips, each with:
- `title`: short actionable heading (max 100 chars)
- `explanation`: detailed guidance referencing specific data (max 300 chars)
- `slide_references`: list of slide IDs most relevant to the tip

### Prompt Design
The coaching summary prompt receives a structured summary of the entire presentation and asks the LLM to prioritize the 3 most impactful improvements. Rules:
- Tips must be specific and reference concrete data (slide numbers, word counts, specific phrases)
- No generic advice ("practice more", "be confident")
- No praise or encouragement
- Each tip should address a different aspect of the presentation

---

## Chat / Conversational Follow-Up

The chat endpoint allows users to ask follow-up questions about their presentation results. The LLM receives full presentation context as a system prompt and maintains conversation history per presentation.

### System Context
The chat system prompt includes:
- Full annotated transcript
- All per-slide metrics and feedback
- Overall metrics
- Coaching summary tips
- Presentation expectations (tone, context, duration)

### Conversation History
Maintained in-memory as a list of `{role, content}` dicts on the presentation record. History is included in each Cortex call so the LLM can maintain conversational coherence.

### Rules
- Reference specific transcript data when answering
- Don't repeat information already visible in the UI
- Stay focused on this presentation's data
- No generic self-help advice

---

## Snowflake Compliance

- All LLM inference MUST go through Snowflake Cortex
- No direct calls to OpenAI, Anthropic, or other LLM providers for feedback generation
- OpenAI is used ONLY for Whisper transcription (separate concern, not LLM feedback)
- The Snowflake account, credentials, and model must be configurable via environment variables
- No Snowflake data is persisted — all calls are stateless inference requests
