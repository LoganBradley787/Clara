from app.manual_analytics import compute_manual_analytics
from app.models import SlideTranscript, WordTimestamp, Expectations, Tone


def _make_slide(words_data, start=0.0, end=10.0, index=0):
    """Helper to create a SlideTranscript from (word, start, end) tuples."""
    words = [WordTimestamp(word=w, start=s, end=e) for w, s, e in words_data]
    text = " ".join(w for w, _, _ in words_data)
    return SlideTranscript(
        slide_index=index, start_time=start, end_time=end,
        words=words, text=text,
    )


def _formal_expectations():
    return Expectations(tone=Tone.professional, expected_duration_minutes=10, context="test")


def test_word_count():
    slide = _make_slide([("hello", 0.0, 0.5), ("world", 1.0, 1.5)])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].word_count == 2


def test_duration():
    slide = _make_slide([], start=5.0, end=50.2)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].duration_seconds == 45.2


def test_wpm_basic():
    # 120 words in 60 seconds = 120 WPM
    words = [(f"word{i}", i * 0.5, i * 0.5 + 0.3) for i in range(120)]
    slide = _make_slide(words, start=0.0, end=60.0)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].wpm == 120.0


def test_wpm_zero_duration():
    slide = _make_slide([("hello", 0.0, 0.5)], start=0.0, end=0.0)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].wpm == 0


def test_wpm_rounded_to_one_decimal():
    # 11 words in 7.0 seconds = 11 / (7/60) = 94.28571... -> 94.3
    words = [(f"w{i}", i * 0.5, i * 0.5 + 0.3) for i in range(11)]
    slide = _make_slide(words, start=0.0, end=7.0)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].wpm == 94.3


def test_speaking_pace_formal_slow():
    # WPM < 90 for professional = slow
    words = [(f"w{i}", i * 0.5, i * 0.5 + 0.3) for i in range(70)]
    slide = _make_slide(words, start=0.0, end=60.0)  # 70 WPM
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].speaking_pace == "slow"


def test_speaking_pace_formal_normal():
    # 100 WPM is in professional normal range (90-130)
    words = [(f"w{i}", i * 0.5, i * 0.5 + 0.3) for i in range(100)]
    slide = _make_slide(words, start=0.0, end=60.0)  # 100 WPM
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].speaking_pace == "normal"


def test_speaking_pace_formal_fast():
    # WPM > 130 for professional = fast
    words = [(f"w{i}", i * 0.3, i * 0.3 + 0.2) for i in range(150)]
    slide = _make_slide(words, start=0.0, end=60.0)  # 150 WPM
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].speaking_pace == "fast"


def test_empty_slide():
    slide = _make_slide([], start=0.0, end=10.0)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    m = result["slide_0"]
    assert m.word_count == 0
    assert m.wpm == 0
    assert m.filler_words.count == 0
    assert m.pauses.count == 0
    assert len(m.repeated_phrases) == 0
    assert m.speaking_pace == "slow"


def test_single_filler_detection():
    slide = _make_slide([
        ("Hello", 0.0, 0.5), ("um", 1.0, 1.2), ("world", 2.0, 2.5)
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].filler_words.count == 1
    assert result["slide_0"].filler_words.instances[0].word == "um"
    assert result["slide_0"].filler_words.instances[0].timestamp == 1.0


def test_multi_word_filler():
    slide = _make_slide([
        ("you", 0.0, 0.3), ("know", 0.4, 0.7), ("stuff", 1.0, 1.5)
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].filler_words.count == 1
    assert result["slide_0"].filler_words.instances[0].word == "you know"


def test_filler_case_insensitive():
    slide = _make_slide([("BASICALLY", 0.0, 0.5), ("UM", 1.0, 1.2)])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].filler_words.count == 2


def test_pause_detected_formal():
    # Formal threshold = 2.0s. Gap of 2.5s should be detected.
    slide = _make_slide([
        ("hello", 0.0, 0.5), ("world", 3.0, 3.5)  # gap = 3.0 - 0.5 = 2.5s
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].pauses.count == 1
    assert result["slide_0"].pauses.instances[0].start == 0.5
    assert result["slide_0"].pauses.instances[0].end == 3.0


def test_pause_duration_rounded_to_one_decimal():
    # Gap: 3.15 - 0.5 = 2.65s -> should round to 2.7
    slide = _make_slide([
        ("hello", 0.0, 0.5), ("world", 3.15, 3.5)
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].pauses.count == 1
    assert result["slide_0"].pauses.instances[0].duration_seconds == 2.7


def test_pause_not_detected_below_threshold():
    # Gap of 1.5s < formal threshold 2.0s
    slide = _make_slide([
        ("hello", 0.0, 0.5), ("world", 2.0, 2.5)  # gap = 1.5s
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].pauses.count == 0


def test_pause_casual_higher_threshold():
    # Casual threshold = 3.0s. Gap of 2.5s should NOT be detected.
    slide = _make_slide([
        ("hello", 0.0, 0.5), ("world", 3.0, 3.5)  # gap = 2.5s
    ])
    casual = Expectations(tone=Tone.conversational, expected_duration_minutes=10, context="test")
    result = compute_manual_analytics({"slide_0": slide}, casual)
    assert result["slide_0"].pauses.count == 0


def test_repeated_bigram():
    slide = _make_slide([
        ("climate", 0.0, 0.5), ("change", 0.6, 1.0),
        ("is", 1.5, 1.7), ("real", 1.8, 2.0),
        ("climate", 2.5, 3.0), ("change", 3.1, 3.5),
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    phrases = {p.phrase for p in result["slide_0"].repeated_phrases}
    assert "climate change" in phrases


def test_stop_words_only_excluded():
    slide = _make_slide([
        ("it", 0.0, 0.3), ("is", 0.4, 0.6),
        ("good", 0.7, 1.0),
        ("it", 1.5, 1.7), ("is", 1.8, 2.0),
        ("bad", 2.1, 2.4),
    ])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    phrases = {p.phrase for p in result["slide_0"].repeated_phrases}
    assert "it is" not in phrases  # all stop words, excluded
