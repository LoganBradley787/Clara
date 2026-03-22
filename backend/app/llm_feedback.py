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
    PresentationResults,
    SlideFeedback,
    SlideTranscript,
)

logger = logging.getLogger("clara.llm")

VALID_TYPES = {t.value for t in FeedbackType}

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


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are a precise presentation transcript analyzer. You identify specific \
language-level patterns that a word-counting algorithm cannot detect.

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

## RULES:
- If no patterns are found, return an EMPTY array []. Never force feedback.
- Return at most 2 flags per slide.
- The "text" field MUST contain an exact quote from the slide's transcript.
- Do NOT flag speaking pace, word count, duration, filler words, or pauses.
- Do NOT provide encouragement, praise, or suggestions.
- Do NOT flag grammar, vocabulary, or style choices.
- ONLY flag patterns with clear, specific evidence from the transcript.
- Respond ONLY with a valid JSON array. No markdown fences, no explanation."""

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
Based ONLY on the evidence above, return a JSON array of flags for Slide {slide_number}.

Each flag must have:
- "type": one of REPETITION, HEDGE_STACK, FALSE_START, SLIDE_READING
- "text": exact quote from THIS slide's transcript (Slide {slide_number})
- "detail": explanation under 200 characters

If nothing qualifies, return: []"""

# ---------------------------------------------------------------------------
# Evidence section builder
# ---------------------------------------------------------------------------


def _build_evidence_section(
    slide: SlideTranscript,
    cross_slide_reps: Dict[str, List[int]],
    slide_text: str,
    similarity: float,
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

    # Slide text + similarity for SLIDE_READING
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
    else:
        parts.append("")
        parts.append("SLIDE TEXT: Not available. Do NOT flag SLIDE_READING.")

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


def _parse_and_validate(
    raw: str,
    slide: SlideTranscript,
    cross_slide_reps: Dict[str, List[int]],
    slide_text: str,
    similarity: float,
) -> List[FeedbackItem]:
    """Parse LLM JSON response and apply strict post-validation."""
    json_str = _extract_json_array(raw)
    items = json.loads(json_str)

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

        # --- Post-validation per flag type ---

        text_norm = _normalize(text)

        # Verify the quoted text actually appears in this slide's transcript
        if text_norm and text_norm not in slide_text_norm:
            logger.info(
                "Dropping %s flag: quoted text '%s' not found in slide transcript",
                flag_type, text[:50],
            )
            continue

        if flag_type == "REPETITION":
            # Verify the phrase was actually pre-computed as cross-slide
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


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------


async def generate_llm_feedback(
    slide_transcript: Dict[str, SlideTranscript],
    expectations: Expectations,
    full_text: str,
    slide_texts: Dict[str, str],
) -> Dict[str, SlideFeedback]:
    """
    Generate per-slide LLM feedback via Snowflake Cortex.
    Uses pre-computed evidence to ground LLM analysis and post-validates output.
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

    conn = await asyncio.to_thread(_get_snowflake_connection)

    try:
        total_slides = len(slide_transcript)
        result: Dict[str, SlideFeedback] = {}

        for slide_id, slide in slide_transcript.items():
            if not slide.words:
                result[slide_id] = SlideFeedback(feedback=[])
                continue

            pdf_text = slide_texts.get(slide_id, "").strip()
            sim = similarities[slide_id]

            evidence_section = _build_evidence_section(
                slide, cross_slide_reps, pdf_text, sim,
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
                feedback_items = _parse_and_validate(
                    raw, slide, cross_slide_reps, pdf_text, sim
                )
            except (json.JSONDecodeError, KeyError, TypeError) as exc:
                logger.warning(
                    "LLM response parse failed for %s (attempt 1): %s", slide_id, exc
                )
                try:
                    raw = await asyncio.to_thread(
                        _call_cortex, conn, SYSTEM_PROMPT, user_prompt
                    )
                    feedback_items = _parse_and_validate(
                        raw, slide, cross_slide_reps, pdf_text, sim
                    )
                except Exception as retry_exc:
                    logger.warning(
                        "LLM response parse failed for %s (attempt 2): %s",
                        slide_id, retry_exc,
                    )
                    feedback_items = []

            result[slide_id] = SlideFeedback(feedback=feedback_items)
    finally:
        conn.close()

    return result


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
