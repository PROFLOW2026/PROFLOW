"""Location match: correct, missed, and false. Synthetic points only."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from location_match import Mark, match_locations


def test_pairs_the_near_mark_and_leaves_the_far_one():
    manual = [Mark("m1", 0, 0), Mark("m2", 30, 0)]
    found = [Mark("f1", 2, 1), Mark("f2", 80, 0)]
    result = match_locations(manual, found, limit=8)
    assert result.correct == (("m1", "f1"),)
    assert result.missed == ("m2",)
    assert result.false == ("f2",)


def test_one_found_mark_cannot_cover_two_manual_marks():
    manual = [Mark("near", 0, 0), Mark("farther", 5, 0)]
    found = [Mark("only", 1, 0)]
    result = match_locations(manual, found, limit=8)
    assert result.correct == (("near", "only"),)
    assert result.missed == ("farther",)
    assert result.false == ()


def test_two_found_marks_on_one_survey_leave_the_extra_false():
    manual = [Mark("m", 0, 0)]
    found = [Mark("a", 1, 0), Mark("b", 3, 0)]
    result = match_locations(manual, found, limit=8)
    assert result.correct == (("m", "a"),)
    assert result.missed == ()
    assert result.false == ("b",)
