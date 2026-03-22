import asyncio
import json
import logging
import re
import snowflake.connector
from collections import Counter, defaultdict
from typing import Dict, List, Optional, Set, Tuple

from app.config import (
    SNOWFLAKE_ACCOUNT,
    SNOWFLAKE_USER,
    SNOWFLAKE_PASSWORD,
    SNOWFLAKE_ROLE,
    SNOWFLAKE_WAREHOUSE,
    CORTEX_MODEL,
)
from app.models import (
    CoachingTip,
    Expectations,
    FeedbackItem,
    FeedbackType,
    ObservationItem,
    ObservationType,
    PresentationResults,
    SlideFeedback,
    SlideObservations,
    SlideTranscript,
)

logger = logging.getLogger("clara.llm")

VALID_TYPES = {t.value for t in FeedbackType}
VALID_OBSERVATION_TYPES = {t.value for t in ObservationType}

BANNED_PHRASES = [
    "great job",
    "well done",
    "excellent",
    "good work",
    "nicely done",
    "impressive",
    "keep it up",
    "good job",
    "try to be more",
    "consider being more",
    "you should try",
]

# ---------------------------------------------------------------------------
# Pre-computation helpers
# ---------------------------------------------------------------------------


def _normalize(text: str) -> str:
    return re.sub(r"[^\w\s]", "", text.lower()).strip()


def _extract_ngrams(text: str, n: int) -> List[str]:
    words = _normalize(text).split()
    if len(words) < n:
        return []
    return [" ".join(words[i : i + n]) for i in range(len(words) - n + 1)]


def _build_annotated_transcript(
    slide_transcript: Dict[str, SlideTranscript],
) -> str:
    """Build a full transcript with [Slide N] markers so the LLM can see boundaries."""
    parts = []
    for slide_id in sorted(slide_transcript, key=lambda s: slide_transcript[s].slide_index):
        slide = slide_transcript[slide_id]
        label = f"[Slide {slide.slide_index + 1}]"
        text = slide.text.strip() if slide.text else "(no speech)"
        parts.append(f"{label}: {text}")
    return "\n\n".join(parts)


def _find_cross_slide_repetitions(
    slide_transcript: Dict[str, SlideTranscript],
    min_n: int = 3,
    max_n: int = 6,
) -> Dict[str, List[int]]:
    """
    Find n-grams that appear on 2+ distinct slides.
    Returns {ngram: [slide_index, ...]} sorted by frequency.
    """
    ngram_to_slides: Dict[str, Set[int]] = defaultdict(set)

    for slide_id, slide in slide_transcript.items():
        if not slide.text:
            continue
        seen_on_this_slide: Set[str] = set()
        for n in range(min_n, max_n + 1):
            for gram in _extract_ngrams(slide.text, n):
                if gram not in seen_on_this_slide:
                    ngram_to_slides[gram].add(slide.slide_index)
                    seen_on_this_slide.add(gram)

    repeated = {
        gram: sorted(slides)
        for gram, slides in ngram_to_slides.items()
        if len(slides) >= 2
    }

    # De-duplicate substrings: if "the key thing is" repeats, don't also report "key thing is"
    to_remove: Set[str] = set()
    grams_by_len = sorted(repeated.keys(), key=lambda g: len(g), reverse=True)
    for i, longer in enumerate(grams_by_len):
        for shorter in grams_by_len[i + 1 :]:
            if shorter in longer and repeated[shorter] == repeated[longer]:
                to_remove.add(shorter)

    for gram in to_remove:
        repeated.pop(gram, None)

    return repeated


def _compute_text_similarity(transcript: str, slide_text: str) -> float:
    """
    Compute word-overlap coefficient between the spoken transcript and slide text.
    Returns a value in [0.0, 1.0].
    """
    if not transcript or not slide_text:
        return 0.0

    t_words = set(_normalize(transcript).split())
    s_words = set(_normalize(slide_text).split())

    if not s_words:
        return 0.0

    overlap = t_words & s_words
    # Overlap coefficient: |intersection| / |smaller set|
    denominator = min(len(t_words), len(s_words))
    if denominator == 0:
        return 0.0
    return len(overlap) / denominator


def _compute_depth_ratios(
    slide_transcript: Dict[str, SlideTranscript],
    slide_texts: Dict[str, str],
    min_pdf_words: int = 30,
) -> Dict[str, Optional[Dict[str, float]]]:
    """
    Compute depth ratios for DEPTH_IMBALANCE detection.
    Returns {slide_id: {"content_pct": float, "time_pct": float}} for imbalanced slides,
    or None for slides that don't qualify.
    """
    total_duration = sum(
        s.end_time - s.start_time for s in slide_transcript.values()
    )
    if total_duration <= 0:
        return {sid: None for sid in slide_transcript}

    # Count meaningful PDF words per slide (only slides with 30+ words)
    pdf_word_counts: Dict[str, int] = {}
    for slide_id, text in slide_texts.items():
        words = _normalize(text).split()
        pdf_word_counts[slide_id] = len(words)

    total_pdf_words = sum(
        c for sid, c in pdf_word_counts.items()
        if c >= min_pdf_words
    )
    if total_pdf_words <= 0:
        return {sid: None for sid in slide_transcript}

    result: Dict[str, Optional[Dict[str, float]]] = {}
    for slide_id, slide in slide_transcript.items():
        wc = pdf_word_counts.get(slide_id, 0)
        if wc < min_pdf_words:
            result[slide_id] = None
            continue

        duration = slide.end_time - slide.start_time
        time_pct = (duration / total_duration) * 100
        content_pct = (wc / total_pdf_words) * 100

        # Check for significant divergence (> 2.5x ratio)
        if content_pct > 0 and time_pct > 0:
            ratio = time_pct / content_pct
            if ratio > 2.5 or ratio < 0.4:
                result[slide_id] = {
                    "content_pct": round(content_pct, 1),
                    "time_pct": round(time_pct, 1),
                }
            else:
                result[slide_id] = None
        else:
            result[slide_id] = None

    return result


def _extract_first_sentence(text: str) -> str:
    """Extract the first sentence from a transcript."""
    if not text:
        return ""
    # Split on sentence-ending punctuation
    match = re.search(r"[.!?]", text)
    if match:
        return text[: match.end()].strip()
    # No punctuation — return first 100 chars
    return text[:100].strip()


def _extract_last_sentence(text: str) -> str:
    """Extract the last sentence from a transcript."""
    if not text:
        return ""
    # Find all sentence boundaries
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return sentences[-1].strip() if sentences else text[:100].strip()


def _build_transition_context(
    slide_transcript: Dict[str, SlideTranscript],
) -> Dict[str, Optional[Dict[str, str]]]:
    """
    Build transition context for ABRUPT_TRANSITION detection.
    Returns {slide_id: {"prev_last": str, "curr_first": str}} or None.
    """
    sorted_slides = sorted(
        slide_transcript.items(),
        key=lambda x: x[1].slide_index,
    )
    result: Dict[str, Optional[Dict[str, str]]] = {}

    for i, (slide_id, slide) in enumerate(sorted_slides):
        if i == 0:
            result[slide_id] = None
            continue

        prev_slide = sorted_slides[i - 1][1]
        prev_text = prev_slide.text.strip() if prev_slide.text else ""
        curr_text = slide.text.strip() if slide.text else ""

        if not prev_text or not curr_text:
            result[slide_id] = None
            continue

        result[slide_id] = {
            "prev_last": _extract_last_sentence(prev_text),
            "curr_first": _extract_first_sentence(curr_text),
        }

    return result


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are a precise presentation transcript analyzer. You identify specific \
language-level patterns that a word-counting algorithm cannot detect, and \
you assess holistic slide-level issues like content coverage and transitions.

## ALLOWED FLAG TYPES (only these four):

REPETITION — The same phrase or sentence structure appears across MULTIPLE slides \
(not within one slide). You will be given pre-computed repeated n-grams as evidence. \
Only flag REPETITION if the pre-computed data confirms the phrase appears on 2+ slides. \
If no pre-computed repetitions are provided, do NOT flag REPETITION.

HEDGE_STACK — Three or more hedging words piled into the SAME sentence. Individual \
hedges (one "maybe" or one "probably") are normal and must NOT be flagged. \
Only flag when 3+ hedges cluster together. Examples of hedge words: maybe, probably, \
sort of, kind of, I think, I guess, perhaps, might, could, somewhat, a little bit.

FALSE_START — Speaker starts a sentence, abandons it mid-thought, then restarts. \
Must show a clear break and restart. Pausing is NOT a false start. Filler words \
alone are NOT false starts. Look for interrupted syntax: "So the plan is — well \
actually what we — the plan is to..."

SLIDE_READING — Speaker reads the slide text nearly word-for-word. ONLY flag this \
when slide text (from PDF) is explicitly provided AND a similarity score is given. \
If no slide text is provided, NEVER flag SLIDE_READING. If the similarity score is \
below 0.5, do NOT flag SLIDE_READING.

## ALLOWED OBSERVATION TYPES:

CONTENT_COVERAGE — Speaker skipped significant concepts from the slide. ONLY when \
slide text (from PDF) is provided. Identify concepts semantically — synonyms and \
paraphrasing count as covered (e.g., "rocks" on slide + "gravel" in speech = covered). \
Return evidence with "concepts_covered" and "concepts_missed" arrays. If all concepts \
were addressed, do NOT observe CONTENT_COVERAGE.

TANGENT — Speaker went off-topic from the slide content. ONLY when slide text is \
provided. The "text" field must contain an exact quote of the tangent passage.

ABRUPT_TRANSITION — No topical bridge from the previous slide. You will be given \
the last sentence of the previous slide and the first sentence of the current slide. \
The "text" field must quote the opening of the current slide.

## RULES:
- Return a JSON object: {{"flags": [...], "observations": [...]}}
- Return at most 2 flags and at most 2 observations per slide.
- Empty arrays are expected for most slides. Never force output.
- Flag "text" fields MUST contain an exact quote from the slide's transcript.
- Observation "text" fields (TANGENT, ABRUPT_TRANSITION) must also be exact quotes.
- Do NOT flag speaking pace, word count, duration, filler words, or pauses.
- Do NOT provide encouragement, praise, or suggestions.
- Do NOT flag grammar, vocabulary, or style choices.
- Respond ONLY with a valid JSON object. No markdown fences, no explanation."""

USER_PROMPT_TEMPLATE = """\
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

{{
  "flags": [
    {{"type": "REPETITION|HEDGE_STACK|FALSE_START|SLIDE_READING", "text": "exact quote", "detail": "under 200 chars"}}
  ],
  "observations": [
    {{"type": "CONTENT_COVERAGE", "detail": "under 250 chars", "evidence": {{"concepts_covered": [...], "concepts_missed": [...]}}}},
    {{"type": "TANGENT|ABRUPT_TRANSITION", "detail": "under 250 chars", "text": "exact quote"}}
  ]
}}

If nothing qualifies: {{"flags": [], "observations": []}}"""

# ---------------------------------------------------------------------------
# Evidence section builder
# ---------------------------------------------------------------------------


def _build_evidence_section(
    slide: SlideTranscript,
    cross_slide_reps: Dict[str, List[int]],
    slide_text: str,
    similarity: float,
    transition_ctx: Optional[Dict[str, str]],
) -> str:
    """
    Build the evidence block for the user prompt.
    Only includes sections where pre-computed data provides grounding.
    """
    parts: List[str] = []

    # Cross-slide repetitions relevant to this slide
    relevant_reps: List[Tuple[str, List[int]]] = []
    slide_norm = _normalize(slide.text)
    for gram, slide_indices in cross_slide_reps.items():
        if slide.slide_index in slide_indices and gram in slide_norm:
            relevant_reps.append((gram, slide_indices))

    if relevant_reps:
        parts.append("PRE-COMPUTED CROSS-SLIDE REPETITIONS (algorithmically detected):")
        for gram, slide_indices in relevant_reps[:5]:
            slide_nums = [str(i + 1) for i in slide_indices]
            parts.append(f'  - "{gram}" appears on slides: {", ".join(slide_nums)}')
        parts.append(
            "Only flag REPETITION for these phrases if they represent a meaningful "
            "repeated pattern (not just common transitional language)."
        )
    else:
        parts.append(
            "PRE-COMPUTED CROSS-SLIDE REPETITIONS: None detected. Do NOT flag REPETITION."
        )

    # Slide text + similarity for SLIDE_READING, CONTENT_COVERAGE, TANGENT
    if slide_text and similarity > 0.0:
        parts.append("")
        parts.append(f'SLIDE TEXT (from PDF): "{slide_text}"')
        parts.append(f"COMPUTED SIMILARITY SCORE: {similarity:.2f}")
        if similarity >= 0.5:
            parts.append(
                "Similarity is high. Flag SLIDE_READING only if the speaker is clearly "
                "reading the slide text nearly verbatim (not just sharing some keywords)."
            )
        else:
            parts.append(
                "Similarity is low. Do NOT flag SLIDE_READING."
            )
        parts.append("")
        parts.append(
            "CONTENT COVERAGE: Compare the slide text concepts against the transcript. "
            "Use semantic matching — synonyms and paraphrasing count as covered. "
            "Only observe CONTENT_COVERAGE if significant concepts were missed."
        )
        parts.append(
            "TANGENT DETECTION: If the transcript contains a passage unrelated to "
            "the slide text or adjacent slides, observe TANGENT with an exact quote."
        )
    else:
        parts.append("")
        parts.append(
            "SLIDE TEXT: Not available. Do NOT flag SLIDE_READING. "
            "Do NOT observe CONTENT_COVERAGE or TANGENT."
        )

    # Transition context for ABRUPT_TRANSITION
    if transition_ctx:
        parts.append("")
        parts.append("TRANSITION CONTEXT:")
        parts.append(f'  Previous slide ended with: "{transition_ctx["prev_last"]}"')
        parts.append(f'  This slide begins with: "{transition_ctx["curr_first"]}"')
        parts.append(
            "Observe ABRUPT_TRANSITION only if there is NO topical connection "
            "between these sentences. Normal topic shifts are fine."
        )
    else:
        parts.append("")
        parts.append("TRANSITION CONTEXT: Not available (first slide or empty neighbor). "
                      "Do NOT observe ABRUPT_TRANSITION.")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Snowflake connection
# ---------------------------------------------------------------------------


def _get_snowflake_connection() -> snowflake.connector.SnowflakeConnection:
    return snowflake.connector.connect(
        account=SNOWFLAKE_ACCOUNT,
        user=SNOWFLAKE_USER,
        password=SNOWFLAKE_PASSWORD,
        role=SNOWFLAKE_ROLE,
        warehouse=SNOWFLAKE_WAREHOUSE,
    )


# ---------------------------------------------------------------------------
# Cortex SQL call
# ---------------------------------------------------------------------------


def _call_cortex(
    conn: snowflake.connector.SnowflakeConnection,
    system_prompt: str,
    user_prompt: str,
) -> str:
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    return _call_cortex_messages(conn, messages)


def _call_cortex_messages(
    conn: snowflake.connector.SnowflakeConnection,
    messages: List[Dict],
    max_tokens: int = 1024,
    temperature: float = 0.1,
) -> str:
    options = {"temperature": temperature, "max_tokens": max_tokens}

    query = "SELECT SNOWFLAKE.CORTEX.COMPLETE(%(model)s, PARSE_JSON(%(messages)s), PARSE_JSON(%(options)s))"
    cursor = conn.cursor()
    try:
        cursor.execute(
            query,
            {
                "model": CORTEX_MODEL,
                "messages": json.dumps(messages),
                "options": json.dumps(options),
            },
        )
        row = cursor.fetchone()
    finally:
        cursor.close()

    if row is None:
        raise RuntimeError("Cortex COMPLETE returned no result")

    result = row[0]
    if isinstance(result, str):
        parsed = json.loads(result)
    else:
        parsed = result

    return parsed["choices"][0]["messages"]


# ---------------------------------------------------------------------------
# Response parsing + post-validation
# ---------------------------------------------------------------------------


def _extract_json_array(raw: str) -> str:
    """Extract a JSON array from an LLM response that may contain extra text."""
    cleaned = raw.strip()

    # Strip markdown fences
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    # Find the outermost [ ... ] bracket pair
    start = cleaned.find("[")
    if start == -1:
        return "[]"

    depth = 0
    for i in range(start, len(cleaned)):
        if cleaned[i] == "[":
            depth += 1
        elif cleaned[i] == "]":
            depth -= 1
            if depth == 0:
                return cleaned[start : i + 1]

    return "[]"


def _extract_json_object(raw: str) -> Dict:
    """Extract a JSON object from an LLM response that may contain extra text."""
    cleaned = raw.strip()

    # Strip markdown fences
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    # Find the outermost { ... } bracket pair
    start = cleaned.find("{")
    if start == -1:
        return {"flags": [], "observations": []}

    depth = 0
    for i in range(start, len(cleaned)):
        if cleaned[i] == "{":
            depth += 1
        elif cleaned[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(cleaned[start : i + 1])
                except json.JSONDecodeError:
                    return {"flags": [], "observations": []}

    return {"flags": [], "observations": []}


def _validate_flags(
    items: List,
    slide: SlideTranscript,
    cross_slide_reps: Dict[str, List[int]],
    slide_text: str,
    similarity: float,
) -> List[FeedbackItem]:
    """Validate flag items from LLM response."""
    if not isinstance(items, list):
        return []

    slide_text_norm = _normalize(slide.text)
    validated: List[FeedbackItem] = []

    for item in items[:2]:
        if not isinstance(item, dict):
            continue

        flag_type = item.get("type")
        if flag_type not in VALID_TYPES:
            continue

        text = str(item.get("text", "")).strip()
        detail = str(item.get("detail", "")).strip()

        if not text:
            continue

        if len(text) > 200:
            text = text[:197] + "..."
        if len(detail) > 200:
            detail = detail[:197] + "..."

        lower_detail = detail.lower()
        if any(phrase in lower_detail for phrase in BANNED_PHRASES):
            continue

        text_norm = _normalize(text)

        # Verify the quoted text actually appears in this slide's transcript
        if text_norm and text_norm not in slide_text_norm:
            logger.info(
                "Dropping %s flag: quoted text '%s' not found in slide transcript",
                flag_type, text[:50],
            )
            continue

        if flag_type == "REPETITION":
            found_in_reps = any(
                text_norm in gram or gram in text_norm
                for gram in cross_slide_reps
                if slide.slide_index in cross_slide_reps[gram]
            )
            if not found_in_reps:
                logger.info(
                    "Dropping REPETITION flag: '%s' not confirmed in pre-computed repetitions",
                    text[:50],
                )
                continue

        if flag_type == "SLIDE_READING":
            if not slide_text or similarity < 0.5:
                logger.info(
                    "Dropping SLIDE_READING flag: similarity=%.2f below threshold",
                    similarity,
                )
                continue

        validated.append(
            FeedbackItem(
                type=FeedbackType(flag_type),
                text=text,
                detail=detail,
            )
        )

    return validated


def _validate_observations(
    items: List,
    slide: SlideTranscript,
    slide_text: str,
    transition_ctx: Optional[Dict[str, str]],
) -> List[ObservationItem]:
    """Validate observation items from LLM response."""
    if not isinstance(items, list):
        return []

    slide_text_norm = _normalize(slide.text)
    pdf_word_count = len(_normalize(slide_text).split()) if slide_text else 0
    validated: List[ObservationItem] = []

    for item in items[:2]:
        if not isinstance(item, dict):
            continue

        obs_type = item.get("type")
        if obs_type not in VALID_OBSERVATION_TYPES:
            continue

        detail = str(item.get("detail", "")).strip()
        text = item.get("text")
        if text is not None:
            text = str(text).strip()
        evidence = item.get("evidence")

        if not detail:
            continue
        if len(detail) > 250:
            detail = detail[:247] + "..."

        lower_detail = detail.lower()
        if any(phrase in lower_detail for phrase in BANNED_PHRASES):
            continue

        # --- Post-validation per observation type ---

        if obs_type == "CONTENT_COVERAGE":
            if not slide_text or pdf_word_count < 10:
                logger.info("Dropping CONTENT_COVERAGE: no PDF text or < 10 words")
                continue
            # Validate evidence structure
            if not isinstance(evidence, dict):
                logger.info("Dropping CONTENT_COVERAGE: missing evidence dict")
                continue
            concepts_missed = evidence.get("concepts_missed", [])
            if not isinstance(concepts_missed, list) or len(concepts_missed) == 0:
                logger.info("Dropping CONTENT_COVERAGE: no concepts_missed")
                continue
            concepts_covered = evidence.get("concepts_covered", [])
            if not isinstance(concepts_covered, list):
                concepts_covered = []
            # Sanitize evidence to only contain string lists
            evidence = {
                "concepts_covered": [str(c) for c in concepts_covered[:10]],
                "concepts_missed": [str(c) for c in concepts_missed[:10]],
            }
            text = None  # CONTENT_COVERAGE has no transcript quote

        elif obs_type == "TANGENT":
            if not slide_text:
                logger.info("Dropping TANGENT: no PDF text available")
                continue
            if not text:
                logger.info("Dropping TANGENT: no text quote provided")
                continue
            if len(text) > 200:
                text = text[:197] + "..."
            text_norm = _normalize(text)
            if text_norm and text_norm not in slide_text_norm:
                logger.info("Dropping TANGENT: quoted text not found in transcript")
                continue
            evidence = None

        elif obs_type == "ABRUPT_TRANSITION":
            if not transition_ctx:
                logger.info("Dropping ABRUPT_TRANSITION: no transition context")
                continue
            if not text:
                logger.info("Dropping ABRUPT_TRANSITION: no text quote provided")
                continue
            if len(text) > 200:
                text = text[:197] + "..."
            text_norm = _normalize(text)
            if text_norm and text_norm not in slide_text_norm:
                logger.info("Dropping ABRUPT_TRANSITION: quoted text not found in transcript")
                continue
            evidence = None

        else:
            # DEPTH_IMBALANCE is handled deterministically, not via LLM
            continue

        validated.append(
            ObservationItem(
                type=ObservationType(obs_type),
                detail=detail,
                text=text,
                evidence=evidence,
            )
        )

    return validated


def _parse_and_validate(
    raw: str,
    slide: SlideTranscript,
    cross_slide_reps: Dict[str, List[int]],
    slide_text: str,
    similarity: float,
    transition_ctx: Optional[Dict[str, str]],
) -> Tuple[List[FeedbackItem], List[ObservationItem]]:
    """Parse LLM JSON response and apply strict post-validation for both flags and observations."""
    parsed = _extract_json_object(raw)

    flags = _validate_flags(
        parsed.get("flags", []),
        slide, cross_slide_reps, slide_text, similarity,
    )
    observations = _validate_observations(
        parsed.get("observations", []),
        slide, slide_text, transition_ctx,
    )

    return flags, observations


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------


async def generate_llm_feedback(
    slide_transcript: Dict[str, SlideTranscript],
    expectations: Expectations,
    full_text: str,
    slide_texts: Dict[str, str],
) -> Tuple[Dict[str, SlideFeedback], Dict[str, SlideObservations]]:
    """
    Generate per-slide LLM feedback and observations via Snowflake Cortex.
    Uses pre-computed evidence to ground LLM analysis and post-validates output.
    Returns (feedback_dict, observations_dict).
    """
    # Pre-compute cross-slide repeated n-grams
    cross_slide_reps = _find_cross_slide_repetitions(slide_transcript)
    logger.info(
        "Pre-computed %d cross-slide repeated phrases", len(cross_slide_reps)
    )

    # Build annotated transcript with slide markers
    annotated = _build_annotated_transcript(slide_transcript)

    # Pre-compute similarity scores for all slides
    similarities: Dict[str, float] = {}
    for slide_id, slide in slide_transcript.items():
        pdf_text = slide_texts.get(slide_id, "").strip()
        similarities[slide_id] = _compute_text_similarity(slide.text, pdf_text)

    # Pre-compute transition context
    transition_contexts = _build_transition_context(slide_transcript)

    # Pre-compute depth ratios (deterministic, no LLM)
    depth_ratios = _compute_depth_ratios(slide_transcript, slide_texts)

    conn = await asyncio.to_thread(_get_snowflake_connection)

    try:
        total_slides = len(slide_transcript)
        feedback_result: Dict[str, SlideFeedback] = {}
        obs_result: Dict[str, SlideObservations] = {}

        for slide_id, slide in slide_transcript.items():
            if not slide.words:
                feedback_result[slide_id] = SlideFeedback(feedback=[])
                obs_result[slide_id] = SlideObservations(observations=[])
                continue

            pdf_text = slide_texts.get(slide_id, "").strip()
            sim = similarities[slide_id]
            t_ctx = transition_contexts.get(slide_id)

            evidence_section = _build_evidence_section(
                slide, cross_slide_reps, pdf_text, sim, t_ctx,
            )

            user_prompt = USER_PROMPT_TEMPLATE.format(
                tone=expectations.tone.value,
                context=expectations.context,
                annotated_transcript=annotated,
                slide_number=slide.slide_index + 1,
                total_slides=total_slides,
                slide_transcript=slide.text,
                evidence_section=evidence_section,
            )

            try:
                raw = await asyncio.to_thread(
                    _call_cortex, conn, SYSTEM_PROMPT, user_prompt
                )
                feedback_items, obs_items = _parse_and_validate(
                    raw, slide, cross_slide_reps, pdf_text, sim, t_ctx
                )
            except (json.JSONDecodeError, KeyError, TypeError) as exc:
                logger.warning(
                    "LLM response parse failed for %s (attempt 1): %s", slide_id, exc
                )
                try:
                    raw = await asyncio.to_thread(
                        _call_cortex, conn, SYSTEM_PROMPT, user_prompt
                    )
                    feedback_items, obs_items = _parse_and_validate(
                        raw, slide, cross_slide_reps, pdf_text, sim, t_ctx
                    )
                except Exception as retry_exc:
                    logger.warning(
                        "LLM response parse failed for %s (attempt 2): %s",
                        slide_id, retry_exc,
                    )
                    feedback_items = []
                    obs_items = []

            # Append deterministic DEPTH_IMBALANCE if applicable
            depth_data = depth_ratios.get(slide_id)
            if depth_data and len(obs_items) < 2:
                content_pct = depth_data["content_pct"]
                time_pct = depth_data["time_pct"]
                obs_items.append(
                    ObservationItem(
                        type=ObservationType.depth_imbalance,
                        detail=(
                            f"This slide has {content_pct:.0f}% of total slide content "
                            f"but received {time_pct:.0f}% of total speaking time"
                        ),
                        text=None,
                        evidence=depth_data,
                    )
                )

            feedback_result[slide_id] = SlideFeedback(feedback=feedback_items)
            obs_result[slide_id] = SlideObservations(observations=obs_items)
    finally:
        conn.close()

    return feedback_result, obs_result


# ---------------------------------------------------------------------------
# Coaching summary
# ---------------------------------------------------------------------------

COACHING_SYSTEM_PROMPT = """\
You are a presentation coach providing a post-practice debrief. \
Based on the complete analytics below, provide exactly 3 specific, \
actionable coaching tips prioritized by impact.

RULES:
- Return exactly 3 tips as a JSON array.
- Each tip: {"title": "...", "explanation": "...", "slide_references": ["slide_0", ...]}
- "title": max 100 characters, a clear action item (verb-first).
- "explanation": max 300 characters, reference specific data (slide numbers, \
  word counts, specific phrases from the transcript).
- "slide_references": the slide IDs most relevant to this tip.
- Each tip must address a DIFFERENT aspect of the presentation.
- Be concrete: "Replace 'kind of' with a deliberate pause" not "reduce filler words".
- No praise, no encouragement, no generic advice like "practice more".
- Respond ONLY with a valid JSON array. No markdown fences, no explanation."""


def _build_coaching_context(results: PresentationResults) -> str:
    om = results.overall_metrics
    lines = [
        "PRESENTATION OVERVIEW:",
        f"- Total slides: {results.total_slides}",
        f"- Duration: {om.actual_duration_seconds:.0f}s (expected {om.expected_duration_seconds:.0f}s, deviation {om.duration_deviation_seconds:+.0f}s)",
        f"- Average WPM: {om.average_wpm:.0f}",
        f"- Total filler words: {om.total_filler_count}",
        f"- Total pauses: {om.total_pause_count}",
        "",
        "PER-SLIDE BREAKDOWN:",
    ]
    for slide_id in sorted(results.slides, key=lambda s: results.slides[s].slide_index):
        s = results.slides[slide_id]
        m = s.metrics
        fb_strs = []
        for fb in s.feedback:
            fb_strs.append(f'{fb.type}: "{fb.text}"')
        fb_line = "; ".join(fb_strs) if fb_strs else "none"
        lines.append(
            f"  {slide_id} (slide {s.slide_index + 1}): "
            f"wpm={m.get('wpm', 0)}, pace={m.get('speaking_pace', '?')}, "
            f"fillers={m.get('filler_words', {}).get('count', 0)}, "
            f"pauses={m.get('pauses', {}).get('count', 0)}, "
            f"feedback=[{fb_line}]"
        )
    lines.append("")
    lines.append("FULL TRANSCRIPT:")
    for slide_id in sorted(results.slides, key=lambda s: results.slides[s].slide_index):
        s = results.slides[slide_id]
        lines.append(f"  [Slide {s.slide_index + 1}]: {s.transcript}")

    return "\n".join(lines)


async def generate_coaching_summary(
    results: PresentationResults,
) -> List[CoachingTip]:
    """Generate 3 prioritized coaching tips from the full presentation results."""
    context = _build_coaching_context(results)
    conn = await asyncio.to_thread(_get_snowflake_connection)
    try:
        raw = await asyncio.to_thread(
            _call_cortex, conn, COACHING_SYSTEM_PROMPT, context
        )
        return _parse_coaching_tips(raw, results)
    except Exception as exc:
        logger.warning("Coaching summary generation failed: %s", exc)
        return []
    finally:
        conn.close()


def _humanize_slide_refs(text: str) -> str:
    """Replace slide_N references in text with human-friendly 'Slide N+1'."""
    return re.sub(
        r"slide_(\d+)",
        lambda m: f"Slide {int(m.group(1)) + 1}",
        text,
    )


def _parse_coaching_tips(raw: str, results: PresentationResults) -> List[CoachingTip]:
    json_str = _extract_json_array(raw)
    items = json.loads(json_str)
    if not isinstance(items, list):
        return []

    valid_slide_ids = set(results.slides.keys())
    tips: List[CoachingTip] = []

    for item in items[:3]:
        if not isinstance(item, dict):
            continue
        title = _humanize_slide_refs(str(item.get("title", "")).strip())
        explanation = _humanize_slide_refs(str(item.get("explanation", "")).strip())
        refs = item.get("slide_references", [])

        if not title or not explanation:
            continue
        if len(title) > 100:
            title = title[:97] + "..."
        if len(explanation) > 300:
            explanation = explanation[:297] + "..."

        if not isinstance(refs, list):
            refs = []
        refs = [r for r in refs if isinstance(r, str) and r in valid_slide_ids]

        tips.append(CoachingTip(
            title=title,
            explanation=explanation,
            slide_references=refs,
        ))

    return tips


# ---------------------------------------------------------------------------
# Chat with AI coach
# ---------------------------------------------------------------------------

CHAT_SYSTEM_TEMPLATE = """\
You are Clara, an AI presentation coach. A student just finished a practice \
presentation and is reviewing their analytics. Answer their questions about \
their performance using the data below.

{context}

RULES:
- Reference specific slides, timestamps, and phrases from the transcript.
- Be direct, specific, and concise (under 250 words).
- Add insight beyond what the raw numbers show — explain WHY a pattern matters.
- If they ask about a specific slide, quote relevant parts of their transcript.
- Don't repeat data they can already see. Add interpretation and actionable advice.
- Stay focused on this presentation's data. No generic self-help.
- No praise or encouragement. Just coaching."""


async def generate_chat_response(
    results: PresentationResults,
    chat_history: List[Dict[str, str]],
    user_message: str,
) -> str:
    """Generate a chat response using full presentation context + conversation history."""
    context = _build_coaching_context(results)
    system_prompt = CHAT_SYSTEM_TEMPLATE.format(context=context)

    messages: List[Dict[str, str]] = [
        {"role": "system", "content": system_prompt},
    ]
    for msg in chat_history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})

    conn = await asyncio.to_thread(_get_snowflake_connection)
    try:
        raw = await asyncio.to_thread(
            _call_cortex_messages, conn, messages, max_tokens=1024, temperature=0.3
        )
        return raw.strip()
    except Exception as exc:
        logger.warning("Chat response generation failed: %s", exc)
        raise
    finally:
        conn.close()
