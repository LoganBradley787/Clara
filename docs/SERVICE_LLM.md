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

**Temperature:** 0.3 — low enough for consistency, high enough to avoid degenerate repetition.

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

## Prompt Structure

Each slide gets its own API call. The prompt includes:
1. Full presentation context (for cross-slide awareness)
2. The specific slide to analyze
3. Presentation expectations
4. Strict output format instructions

### System Prompt

```
You are a presentation speech analyst. Your role is to provide specific,
data-grounded feedback on speaking patterns observed in presentation transcripts.

Rules:
- Every comment MUST reference specific words, phrases, or patterns from the transcript
- Do NOT give generic advice like "try to be more engaging" or "good job"
- Do NOT rate the quality of the content or ideas
- Do NOT give encouragement or praise
- Focus ONLY on observable speaking behaviors: word choice, repetition, pacing patterns, clarity of phrasing, structural transitions
- Each comment must be under 200 characters
- Respond ONLY with valid JSON — no markdown, no explanation
```

### User Prompt Template

```
PRESENTATION CONTEXT:
- Tone: {tone}
- Expected duration: {expected_duration_minutes} minutes
- Context: {context}

FULL PRESENTATION TRANSCRIPT (for reference across slides):
{full_transcript}

SLIDE {slide_index + 1} OF {total_slides}:
Transcript: "{slide_text}"
Duration: {slide_duration} seconds
Word count: {slide_word_count}

Analyze ONLY Slide {slide_index + 1}. Consider repetition and patterns relative to the rest of the presentation.

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
  {
    "category": "repetition|clarity|diction|pacing|structure|timing",
    "comment": "specific observation under 200 characters",
    "severity": "observation|suggestion"
  }
]
```

---

## Slide-Focused Analysis

The LLM is called N times for N slides. Each call:

1. Receives the full presentation transcript as context
2. Is told to focus only on the current slide
3. Can reference patterns across slides (e.g., "the phrase X also appears on slides 2 and 5")

**Why per-slide calls instead of one bulk call:**
- Better focus and specificity per slide
- Avoids exceeding token limits for long presentations
- Allows structured output per slide
- Each slide's feedback is independent and parseable

---

## Repetition Detection Across Slides

The LLM has the full transcript, so it can identify:
- Phrases repeated on multiple slides (e.g., "as I mentioned earlier" used 4 times)
- Opening patterns that repeat (starting every slide with "So...")
- Structural repetition (same transition every time)

The system prompt explicitly asks for cross-slide awareness while focusing analysis on the current slide.

---

## Concise Feedback Format

Each feedback item:

| Field | Type | Constraints |
|-------|------|-------------|
| `category` | string | One of: `pacing`, `repetition`, `clarity`, `diction`, `structure`, `timing` |
| `comment` | string | Max 200 characters. Must reference specific transcript content. |
| `severity` | string | `observation` (neutral data point) or `suggestion` (actionable change) |

**Maximum 5 feedback items per slide.** If the LLM returns more, truncate to first 5.

---

## Structured Response Schema

The LLM must return a JSON array. Parse and validate:

```python
def parse_llm_response(raw_response: str) -> List[FeedbackItem]:
    # Strip any markdown code fences if present
    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]

    items = json.loads(cleaned)

    validated = []
    for item in items[:5]:  # Max 5
        if item.get("category") not in VALID_CATEGORIES:
            continue
        if item.get("severity") not in ["observation", "suggestion"]:
            item["severity"] = "observation"
        if len(item.get("comment", "")) > 200:
            item["comment"] = item["comment"][:197] + "..."
        validated.append(item)

    return validated
```

---

## Constraints to Avoid Generic AI Feedback

These constraints are enforced in the system prompt and validated post-response:

| Constraint | Enforcement |
|-----------|-------------|
| No praise or encouragement | System prompt rule. Filter responses containing "great", "excellent", "good job", "well done" |
| No content evaluation | System prompt rule. Filter responses about idea quality |
| Must reference transcript | System prompt rule. Flag comments that don't quote or reference specific words |
| No numerical quality scores | System prompt rule. The LLM should not output scores like "clarity: 7/10" |
| Under 200 characters | Post-processing truncation |
| Valid category | Post-processing validation |
| Max 5 per slide | Post-processing truncation |

**Post-processing filters:**

```python
BANNED_PHRASES = [
    "great job", "well done", "excellent", "good work",
    "nicely done", "impressive", "keep it up", "good job",
    "try to be more", "consider being more", "you should try"
]

def filter_generic(comment: str) -> bool:
    """Return True if comment should be kept."""
    lower = comment.lower()
    return not any(phrase in lower for phrase in BANNED_PHRASES)
```

---

## Deterministic Output Structure

The module returns a dict keyed by slide ID:

```python
def generate_llm_feedback(
    slide_transcript: Dict[str, SlideTranscript],
    expectations: Expectations,
    full_text: str
) -> Dict[str, SlideFeedback]:
```

**Output:**
```json
{
  "slide_0": {
    "feedback": [
      {
        "category": "repetition",
        "comment": "The phrase 'climate change' appears 3 times in 45 seconds.",
        "severity": "observation"
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
| LLM returns too many items | Truncate to 5 |
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

## Snowflake Compliance

- All LLM inference MUST go through Snowflake Cortex
- No direct calls to OpenAI, Anthropic, or other LLM providers for feedback generation
- OpenAI is used ONLY for Whisper transcription (separate concern, not LLM feedback)
- The Snowflake account, credentials, and model must be configurable via environment variables
- No Snowflake data is persisted — all calls are stateless inference requests
