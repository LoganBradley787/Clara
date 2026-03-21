from app.aggregator import aggregate_results
from app.models import (
    SlideTranscript, SlideMetrics, SlideFeedback, FeedbackItem,
    WordTimestamp, FillerInfo, PauseInfo, Expectations, Tone,
    FeedbackCategory, Severity, SpeakingPace,
)


def _make_transcript():
    return {
        "slide_0": SlideTranscript(
            slide_index=0, start_time=0.0, end_time=30.0,
            words=[WordTimestamp(word="hello", start=0.0, end=0.5)],
            text="hello",
        ),
        "slide_1": SlideTranscript(
            slide_index=1, start_time=30.0, end_time=60.0,
            words=[WordTimestamp(word="world", start=30.0, end=30.5)],
            text="world",
        ),
    }


def _make_metrics():
    def m(wc, dur):
        return SlideMetrics(
            word_count=wc, wpm=round(wc / (dur / 60), 1) if dur > 0 else 0,
            duration_seconds=dur,
            filler_words=FillerInfo(count=1, instances=[]),
            pauses=PauseInfo(count=2, instances=[]),
            repeated_phrases=[], speaking_pace=SpeakingPace.normal,
        )
    return {"slide_0": m(50, 30.0), "slide_1": m(60, 30.0)}


def _make_feedback():
    return {
        "slide_0": SlideFeedback(feedback=[
            FeedbackItem(category=FeedbackCategory.pacing, comment="test", severity=Severity.observation)
        ]),
        "slide_1": SlideFeedback(feedback=[]),
    }


def _make_expectations():
    return Expectations(tone=Tone.formal, expected_duration_minutes=1, context="test")


def test_text_renamed_to_transcript():
    result = aggregate_results(
        _make_transcript(), _make_metrics(), _make_feedback(),
        _make_expectations(), total_duration=60.0,
    )
    assert result.slides["slide_0"].transcript == "hello"


def test_duration_promoted_to_slide_level():
    result = aggregate_results(
        _make_transcript(), _make_metrics(), _make_feedback(),
        _make_expectations(), total_duration=60.0,
    )
    assert result.slides["slide_0"].duration_seconds == 30.0
    assert "duration_seconds" not in result.slides["slide_0"].metrics


def test_overall_metrics():
    result = aggregate_results(
        _make_transcript(), _make_metrics(), _make_feedback(),
        _make_expectations(), total_duration=60.0,
    )
    om = result.overall_metrics
    assert om.total_word_count == 110  # 50 + 60
    assert om.average_wpm == 110.0     # 110 / (60/60) = 110.0
    assert om.total_filler_count == 2  # 1 + 1
    assert om.total_pause_count == 4   # 2 + 2
    assert om.expected_duration_seconds == 60.0  # 1 min * 60
    assert om.actual_duration_seconds == 60.0
    assert om.duration_deviation_seconds == 0.0


def test_total_slides_and_duration():
    result = aggregate_results(
        _make_transcript(), _make_metrics(), _make_feedback(),
        _make_expectations(), total_duration=60.0,
    )
    assert result.total_slides == 2
    assert result.total_duration_seconds == 60.0
