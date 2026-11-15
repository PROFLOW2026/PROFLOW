"""Visual context confirms or rejects a legend proposal. It does not invent one."""
from takeoff_worker.pdf_engine.visual_context import VisualReading, decide_with_context, visual_context_enabled


def test_no_reading_keeps_the_legend_proposal():
    assert decide_with_context("light", None, geometry_candidate=True).keep is True
    assert decide_with_context("switch", None, geometry_candidate=True).x2 is False
    assert decide_with_context(None, None, geometry_candidate=True).keep is False


def test_low_confidence_does_not_override():
    reading = VisualReading(kind="other", confidence="low", x2=True)
    decision = decide_with_context("socket", reading, geometry_candidate=True)
    assert decision.keep is True
    assert decision.x2 is False


def test_high_confidence_other_drops_a_lookalike():
    reading = VisualReading(kind="other", confidence="high")
    assert decide_with_context("light", reading, geometry_candidate=True).keep is False
    assert decide_with_context("socket", reading, geometry_candidate=True).keep is False


def test_disagreement_with_the_legend_drops_the_mark():
    reading = VisualReading(kind="switch", confidence="high")
    assert decide_with_context("light", reading, geometry_candidate=True).keep is False


def test_switch_needs_a_geometric_candidate():
    reading = VisualReading(kind="switch", confidence="high")
    assert decide_with_context(None, reading, geometry_candidate=False).keep is False
    assert decide_with_context(None, reading, geometry_candidate=True).keep is True


def test_x2_counts_only_on_a_kept_socket():
    reading = VisualReading(kind="socket", confidence="high", x2=True)
    assert decide_with_context("socket", reading, geometry_candidate=True).x2 is True
    light = VisualReading(kind="light", confidence="high", x2=True)
    assert decide_with_context("light", light, geometry_candidate=True).x2 is False


def test_vision_stays_off_without_a_provider(monkeypatch):
    monkeypatch.delenv("TAKEOFF_AI_VISION", raising=False)
    monkeypatch.delenv("TAKEOFF_AI_API_KEY", raising=False)
    assert visual_context_enabled() is False
    monkeypatch.setenv("TAKEOFF_AI_VISION", "1")
    assert visual_context_enabled() is False
