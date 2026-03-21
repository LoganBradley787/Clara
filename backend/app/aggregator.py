from typing import Dict
from app.models import (
    SlideTranscript, SlideMetrics, SlideFeedback, Expectations,
    AggregatedSlide, OverallMetrics, PresentationResults,
)


def aggregate_results(
    transcripts: Dict[str, SlideTranscript],
    metrics: Dict[str, SlideMetrics],
    feedback: Dict[str, SlideFeedback],
    expectations: Expectations,
    total_duration: float,
    presentation_id: str = "",
) -> PresentationResults:
    slides = {}
    total_word_count = 0
    total_filler_count = 0
    total_pause_count = 0

    for slide_id in transcripts:
        t = transcripts[slide_id]
        m = metrics[slide_id]
        f = feedback.get(slide_id, SlideFeedback(feedback=[]))

        # Build metrics dict WITHOUT duration_seconds (promoted to slide top level)
        metrics_dict = m.model_dump(exclude={"duration_seconds"})

        slides[slide_id] = AggregatedSlide(
            slide_index=t.slide_index,
            start_time=t.start_time,
            end_time=t.end_time,
            duration_seconds=m.duration_seconds,  # promoted from metrics
            transcript=t.text,                    # renamed from text
            words=t.words,
            metrics=metrics_dict,
            feedback=f.feedback,
        )

        total_word_count += m.word_count
        total_filler_count += m.filler_words.count
        total_pause_count += m.pauses.count

    expected_secs = expectations.expected_duration_minutes * 60
    avg_wpm = round(total_word_count / (total_duration / 60), 1) if total_duration > 0 else 0

    return PresentationResults(
        presentation_id=presentation_id,
        total_slides=len(transcripts),
        total_duration_seconds=total_duration,
        overall_metrics=OverallMetrics(
            total_word_count=total_word_count,
            average_wpm=avg_wpm,
            total_filler_count=total_filler_count,
            total_pause_count=total_pause_count,
            expected_duration_seconds=expected_secs,
            actual_duration_seconds=total_duration,
            duration_deviation_seconds=round(total_duration - expected_secs, 1),
        ),
        slides=slides,
    )
