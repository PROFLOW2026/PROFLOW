"""Synthetic feature checks for lighting points, sockets, and the sheet frame."""
from __future__ import annotations

import pytest

from takeoff_worker.pdf_engine.fixture_marks import (
    LightingPointFeatures,
    SocketSymbolFeatures,
    lighting_point,
    on_sheet_border,
    socket_symbol,
)


def _light(**overrides: object) -> LightingPointFeatures:
    features = LightingPointFeatures(
        extent=16.0,
        aspect=1.0,
        gray_inside=0,
        inner_mark=False,
        word_inside=False,
        has_stem=False,
        in_arrow_fan=False,
        on_sheet_border=False,
    )
    if not overrides:
        return features
    return LightingPointFeatures(**{**features.__dict__, **overrides})


def _socket(**overrides: object) -> SocketSymbolFeatures:
    features = SocketSymbolFeatures(
        arch=True,
        stem=True,
        on_sheet_border=False,
        in_arrow_fan=False,
    )
    if not overrides:
        return features
    return SocketSymbolFeatures(**{**features.__dict__, **overrides})


def test_lighting_point_accepts_empty_open_ring():
    assert lighting_point(_light())
    assert lighting_point(_light(extent=12.0, aspect=0.82, gray_inside=3))
    assert lighting_point(_light(extent=20.0, aspect=1.22))


def test_lighting_point_rejects_stem():
    assert not lighting_point(_light(has_stem=True))


def test_lighting_point_rejects_gray_fill():
    assert not lighting_point(_light(gray_inside=4))
    assert not lighting_point(_light(gray_inside=9))


def test_lighting_point_rejects_letter():
    assert not lighting_point(_light(word_inside=True))


def test_lighting_point_rejects_inner_ring():
    assert not lighting_point(_light(inner_mark=True))


def test_lighting_point_rejects_arrow_fan():
    assert not lighting_point(_light(in_arrow_fan=True))


def test_lighting_point_rejects_sheet_border():
    assert not lighting_point(_light(on_sheet_border=True))


def test_lighting_point_rejects_size_outside_the_open_ring_window():
    assert not lighting_point(_light(extent=11.9))
    assert not lighting_point(_light(extent=20.1))
    assert not lighting_point(_light(aspect=0.81))
    assert not lighting_point(_light(aspect=1.23))


def test_socket_symbol_accepts_arch_and_one_stem():
    assert socket_symbol(_socket())


def test_socket_symbol_rejects_full_circle():
    assert not socket_symbol(_socket(arch=False))


def test_socket_symbol_rejects_arch_without_stem():
    assert not socket_symbol(_socket(stem=False))


def test_socket_symbol_rejects_sheet_border():
    assert not socket_symbol(_socket(on_sheet_border=True))


def test_socket_symbol_rejects_arrow_fan():
    assert not socket_symbol(_socket(in_arrow_fan=True))


@pytest.mark.parametrize(
    ("cx", "cy"),
    [
        (20.0, 500.0),
        (980.0, 500.0),
        (500.0, 20.0),
        (500.0, 980.0),
        (0.0, 500.0),
        (1000.0, 500.0),
    ],
)
def test_on_sheet_border_accepts_frame_ink_on_each_edge(cx: float, cy: float):
    assert on_sheet_border(cx, cy, 1000.0, 1000.0, True)


def test_on_sheet_border_includes_the_two_and_a_half_percent_line():
    page = 1000.0
    edge = 0.025 * page
    assert on_sheet_border(edge, 500.0, page, page, True)
    assert not on_sheet_border(edge + page * 0.01, 500.0, page, page, True)


def test_on_sheet_border_exterior_wall_without_frame_ink_is_false():
    assert not on_sheet_border(20.0, 500.0, 1000.0, 1000.0, False)
    assert not on_sheet_border(60.0, 500.0, 1000.0, 1000.0, True)


def test_on_sheet_border_ignores_a_vertical_band_through_the_middle():
    page_w, page_h = 1000.0, 800.0
    for cy in (120.0, 400.0, 680.0):
        assert not on_sheet_border(page_w * 0.5, cy, page_w, page_h, True)
        assert not on_sheet_border(page_w * 0.4, cy, page_w, page_h, True)


def test_on_sheet_border_rejects_a_degenerate_page():
    assert not on_sheet_border(0.0, 0.0, 0.0, 0.0, True)
    assert not on_sheet_border(0.0, 0.0, -100.0, 100.0, True)
