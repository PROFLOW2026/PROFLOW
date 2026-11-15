"""Synthetic geometric identity for switch heads."""

from __future__ import annotations

import pytest

from takeoff_worker.pdf_engine.switch_identity import (
    SwitchMark,
    collapse_same_head,
    same_head,
)


def test_centers_one_radius_apart_collapse_to_one():
    first = SwitchMark(0.0, 0.0, 4.8)
    second = SwitchMark(4.6, 0.0, 4.8)
    assert same_head(first, second)
    kept = collapse_same_head([first, second])
    assert kept == [first]
    assert kept[0] is first


def test_centers_with_a_gap_stay_two():
    left = SwitchMark(0.0, 0.0, 4.4)
    right = SwitchMark(12.0, 0.0, 4.4)
    assert not same_head(left, right)
    assert collapse_same_head([left, right]) == [left, right]


def test_three_heads_in_a_row_stay_three():
    radius = 5.0
    gap = 14.0
    marks = [SwitchMark(1.0 + gap * i, 3.0, radius) for i in range(3)]
    assert [marks[i + 1].x - marks[i].x for i in range(2)] == [gap, gap]
    assert collapse_same_head(marks) == marks
    assert all(kept is original for kept, original in zip(collapse_same_head(marks), marks))


def test_two_overlapping_pairs_with_a_gap_stay_two_clusters():
    first_pair = (SwitchMark(0.0, 0.0, 5.0), SwitchMark(4.0, 0.0, 5.0))
    second_pair = (SwitchMark(18.0, 0.0, 5.0), SwitchMark(22.0, 0.0, 5.0))
    marks = [*first_pair, *second_pair]
    assert same_head(*first_pair)
    assert same_head(*second_pair)
    assert not any(same_head(a, b) for a in first_pair for b in second_pair)
    kept = collapse_same_head(marks)
    assert kept == [first_pair[0], second_pair[0]]
    assert kept[0] is first_pair[0]
    assert kept[1] is second_pair[0]


def test_overlap_chain_collapses_transitively_to_one():
    marks = [
        SwitchMark(0.0, 7.0, 5.0),
        SwitchMark(6.0, 7.0, 5.0),
        SwitchMark(12.0, 7.0, 5.0),
    ]
    assert same_head(marks[0], marks[1])
    assert same_head(marks[1], marks[2])
    assert not same_head(marks[0], marks[2])
    kept = collapse_same_head(marks)
    assert kept == [marks[0]]
    assert kept[0] is marks[0]


def test_opposite_stems_at_an_overlapping_distance_stay_two():
    left = SwitchMark(0.0, 0.0, 4.0, stem=(1.0, 0.0))
    right = SwitchMark(3.0, 0.0, 4.0, stem=(-1.0, 0.0))
    assert same_head(left, right)
    assert collapse_same_head([left, right]) == [left, right]


def test_missing_stem_falls_back_to_distance():
    with_stem = SwitchMark(0.0, 0.0, 4.0, stem=(1.0, 0.0))
    without_stem = SwitchMark(3.0, 0.0, 4.0, stem=None)
    assert same_head(with_stem, without_stem)
    kept = collapse_same_head([with_stem, without_stem])
    assert kept == [with_stem]
    assert kept[0] is with_stem


def test_aligned_stems_on_one_head_collapse():
    first = SwitchMark(0.0, 4.0, 4.0, stem=(2.0, 0.0))
    second = SwitchMark(3.0, 4.0, 4.0, stem=(5.0, 0.0))
    kept = collapse_same_head([first, second])
    assert kept == [first]
    assert kept[0] is first


def test_perpendicular_stems_stay_two():
    left = SwitchMark(0.0, 4.0, 4.0, stem=(1.0, 0.0))
    right = SwitchMark(3.0, 4.0, 4.0, stem=(0.0, 2.0))
    assert same_head(left, right)
    assert collapse_same_head([left, right]) == [left, right]


def test_larger_head_is_kept_without_averaging():
    left = SwitchMark(0.0, 0.0, 4.0)
    larger = SwitchMark(5.0, 0.0, 7.0)
    right = SwitchMark(9.0, 1.0, 4.0)
    kept = collapse_same_head([left, larger, right])
    assert len(kept) == 1
    assert kept[0] is larger


def test_distance_at_the_overlap_limit_stays_two():
    radius = 5.0
    limit = 0.85 * (radius + radius)
    left = SwitchMark(0.0, 0.0, radius)
    right = SwitchMark(limit, 0.0, radius)
    assert not same_head(left, right)
    assert collapse_same_head([left, right]) == [left, right]


def test_zero_length_stem_falls_back_to_distance():
    origin = SwitchMark(0.0, 0.0, 4.0, stem=(0.0, 0.0))
    other = SwitchMark(3.0, 0.0, 4.0, stem=(-1.0, 0.0))
    kept = collapse_same_head([origin, other])
    assert kept == [origin]
    assert kept[0] is origin


def test_head_radius_must_be_positive():
    with pytest.raises(ValueError):
        SwitchMark(0.0, 0.0, 0.0)
    with pytest.raises(ValueError):
        SwitchMark(0.0, 0.0, -1.0)
