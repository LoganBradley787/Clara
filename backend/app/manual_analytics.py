"""
Manual analytics module — pure computation, no I/O, no LLM calls.

Computes per-slide speaking metrics from word-level transcript data.
"""

import math
import string
from collections import Counter
from typing import Dict

from app.models import (
    Expectations,
    FillerInfo,
    FillerInstance,
    PauseInfo,
    PauseInstance,
    RepeatedPhrase,
    SlideMetrics,
    SlideTranscript,
    SpeakingPace,
)

# Tone-based WPM ranges: (low_inclusive, high_inclusive)
PACE_RANGES: Dict[str, tuple] = {
    "formal": (130, 160),
    "casual": (140, 180),
    "informative": (120, 150),
    "persuasive": (140, 170),
}

# Tone-based pause thresholds in seconds
PAUSE_THRESHOLDS: Dict[str, float] = {
    "formal": 2.0,
    "casual": 3.0,
    "informative": 2.5,
    "persuasive": 2.0,
}

# Filler words
SINGLE_FILLERS = {"um", "uh", "like", "basically", "actually", "literally", "right"}
MULTI_FILLERS = {"you know", "i mean", "kind of", "sort of"}

# Stop words for repetition detection
STOP_WORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "it", "its", "this", "that", "and",
    "or", "but", "not", "no", "if", "then", "than", "so", "as",
}


def _normalize(word: str) -> str:
    return word.lower().strip(string.punctuation)


def _classify_pace(wpm: float, tone: str) -> SpeakingPace:
    low, high = PACE_RANGES.get(tone, (130, 160))
    if wpm < low:
        return SpeakingPace.slow
    if wpm > high:
        return SpeakingPace.fast
    return SpeakingPace.normal


def _compute_filler_words(slide: SlideTranscript) -> FillerInfo:
    instances = []
    words = slide.words
    for i, w in enumerate(words):
        normalized = _normalize(w.word)

        if normalized in SINGLE_FILLERS:
            instances.append(FillerInstance(word=normalized, timestamp=w.start))
            continue  # don't double-count as part of a bigram on the same word

        if i + 1 < len(words):
            bigram = normalized + " " + _normalize(words[i + 1].word)
            if bigram in MULTI_FILLERS:
                instances.append(FillerInstance(word=bigram, timestamp=w.start))

    return FillerInfo(count=len(instances), instances=instances)


def _compute_pauses(slide: SlideTranscript, threshold: float) -> PauseInfo:
    instances = []
    words = slide.words
    for i in range(len(words) - 1):
        gap = words[i + 1].start - words[i].end
        if gap > threshold:
            pause_start = words[i].end
            pause_end = words[i + 1].start
            duration = math.floor((pause_end - pause_start) * 10 + 0.5) / 10
            instances.append(
                PauseInstance(start=pause_start, end=pause_end, duration_seconds=duration)
            )
    return PauseInfo(count=len(instances), instances=instances)


def _is_all_stop_words(phrase: str) -> bool:
    return all(token in STOP_WORDS for token in phrase.split())


def _compute_repeated_phrases(slide: SlideTranscript) -> list:
    words_lower = [_normalize(w.word) for w in slide.words]
    results = []
    seen_phrases = set()

    for n in [2, 3]:
        if len(words_lower) < n:
            continue
        ngrams = [" ".join(words_lower[i: i + n]) for i in range(len(words_lower) - n + 1)]
        counts = Counter(ngrams)
        for phrase, count in counts.items():
            if count >= 2 and not _is_all_stop_words(phrase) and phrase not in seen_phrases:
                results.append(RepeatedPhrase(phrase=phrase, count=count))
                seen_phrases.add(phrase)

    return results


def compute_manual_analytics(
    slide_transcript: Dict[str, SlideTranscript],
    expectations: Expectations,
) -> Dict[str, SlideMetrics]:
    """
    Compute objective speaking metrics for each slide.

    Args:
        slide_transcript: Slide-indexed transcript output from the Indexer.
        expectations: Presentation expectations including tone.

    Returns:
        Dict mapping slide IDs to SlideMetrics.
    """
    tone = expectations.tone.value
    pause_threshold = PAUSE_THRESHOLDS.get(tone, 2.0)
    results: Dict[str, SlideMetrics] = {}

    for slide_id, slide in slide_transcript.items():
        word_count = len(slide.words)
        duration_seconds = round(slide.end_time - slide.start_time, 10)

        if duration_seconds == 0 or word_count == 0:
            wpm = 0.0
        else:
            wpm = round(word_count / (duration_seconds / 60), 1)

        speaking_pace = _classify_pace(wpm, tone)
        filler_words = _compute_filler_words(slide)
        pauses = _compute_pauses(slide, pause_threshold)
        repeated_phrases = _compute_repeated_phrases(slide)

        results[slide_id] = SlideMetrics(
            word_count=word_count,
            wpm=wpm,
            duration_seconds=duration_seconds,
            filler_words=filler_words,
            pauses=pauses,
            repeated_phrases=repeated_phrases,
            speaking_pace=speaking_pace,
        )

    return results
