"""A plan switch is the legend's circle-plus-stem, even when the stem is longer."""
from __future__ import annotations

import math

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from takeoff_worker.classify.pipeline_classify import classify_detections, classify_legend_entries
from takeoff_worker.data.catalog_loader import load_default_catalog
from takeoff_worker.models import JobOptions
from takeoff_worker.pdf_engine.engine import PdfVectorEngine

pdfmetrics.registerFont(TTFont("ArialHeb", r"C:\Windows\Fonts\arial.ttf"))


def _lollipop(c: canvas.Canvas, x: float, y: float, radius: float, stem: float, gap: float) -> None:
    c.circle(x, y, radius, stroke=1, fill=0)
    x0 = x + radius + gap
    c.line(x0, y, x0 + stem, y)
    c.line(x0 + stem, y - 3, x0 + stem, y + 3)


def _sheet(path) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4
    c.setStrokeColorRGB(0, 0, 0)
    c.setFillColorRGB(0, 0, 0)
    c.setLineWidth(0.8)
    # Walls, so the sheet is a black plan rather than a legend page.
    for x in (40, 70, 280, 310):
        c.line(x, 80, x, h - 80)
    for y in (90, 120, h - 90):
        c.line(40, y, 320, y)

    # Plan lights: plain circles. Plan switches: same head as the legend, longer stem, small gap.
    for i, y in enumerate((700, 620, 540)):
        c.circle(110, y, 8, stroke=1, fill=0)
        _lollipop(c, 210, y, 5, stem=16, gap=2.4)

    # Legend column to the right of a tall rule. Labels sit to the left of the symbol.
    c.setLineWidth(1.0)
    c.line(500, 200, 500, 680)
    c.setFont("ArialHeb", 9)
    rows = [
        (640, "circle", "נקודת מאור"),
        (600, "switch", "מפסק יחיד"),
        (560, "box", "ארון"),
        (520, "cross", "צלב"),
        (480, "diamond", "מעוין"),
        (440, "bars", "סורג"),
        (400, "wave", "גל"),
        (360, "plus", "פלוס"),
    ]
    for y, kind, label in rows:
        c.setFont("ArialHeb", 9)
        c.drawRightString(488, y - 3, label)
        c.setLineWidth(0.8)
        if kind == "circle":
            c.circle(530, y, 6, stroke=1, fill=0)
        elif kind == "switch":
            _lollipop(c, 528, y, 4, stem=7, gap=0)
        elif kind == "box":
            c.rect(522, y - 5, 12, 12, stroke=1, fill=0)
        elif kind == "cross":
            c.line(522, y - 5, 534, y + 6)
            c.line(522, y + 6, 534, y - 5)
        elif kind == "diamond":
            c.line(528, y - 6, 536, y)
            c.line(536, y, 528, y + 6)
            c.line(528, y + 6, 520, y)
            c.line(520, y, 528, y - 6)
        elif kind == "bars":
            c.line(520, y - 4, 536, y - 4)
            c.line(520, y, 536, y)
            c.line(520, y + 4, 536, y + 4)
        elif kind == "wave":
            c.line(520, y, 524, y + 4)
            c.line(524, y + 4, 528, y - 4)
            c.line(528, y - 4, 532, y + 4)
            c.line(532, y + 4, 536, y)
        else:
            c.line(522, y, 534, y)
            c.line(528, y - 6, 528, y + 6)
    c.save()


def test_plan_switch_matches_legend_stem_not_the_plain_circle(tmp_path):
    pdf = tmp_path / "stem.pdf"
    _sheet(pdf)
    out = PdfVectorEngine().analyze(str(pdf), "f1", options=JobOptions(renderPreview=False), library=[])
    catalog = load_default_catalog()
    legend = classify_legend_entries(out.legend, catalog)
    dets = classify_detections(out.detections, catalog=catalog, library=[], legend=legend)
    plan = [d for d in dets if "legend_zone" not in d.reasons]
    by_key = {row.key: row for row in legend}
    lights = [d for d in plan if d.typeKey == "light.point"]
    switches = [d for d in plan if d.typeKey == "control.switch.single"]
    assert len(lights) >= 3
    assert len(switches) >= 3
    assert all(by_key[d.legendKey].typeKey == "light.point" for d in lights if d.legendKey)
    assert all(by_key[d.legendKey].typeKey == "control.switch.single" for d in switches if d.legendKey)
    # The legend column itself is not an apartment device.
    assert all("legend_zone" in d.reasons for d in dets if d.x > 450)


def _sheet_with_caption_and_cross(path) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4
    c.setStrokeColorRGB(0, 0, 0)
    c.setFillColorRGB(0, 0, 0)
    c.setLineWidth(0.8)
    for x in (40, 70, 360, 390):
        c.line(x, 80, x, h - 80)
    for y in (90, 120, h - 90):
        c.line(40, y, 400, y)

    # Plain light, light with a caption, light touched by short clutter, switch, crossed circle.
    c.circle(110, 700, 8, stroke=1, fill=0)
    c.circle(110, 600, 8, stroke=1, fill=0)
    c.setFont("ArialHeb", 8)
    c.drawString(104, 616, "2א")
    c.circle(110, 500, 8, stroke=1, fill=0)
    for ang in range(0, 360, 45):
        rad = ang * math.pi / 180
        x0 = 110 + 8 * math.cos(rad)
        y0 = 500 + 8 * math.sin(rad)
        c.line(x0, y0, x0 + 4 * math.cos(rad), y0 + 4 * math.sin(rad))
    _lollipop(c, 220, 700, 5, stem=16, gap=2.4)
    c.circle(220, 560, 8, stroke=1, fill=0)
    c.line(214, 554, 226, 566)
    c.line(214, 566, 226, 554)

    c.setLineWidth(1.0)
    c.line(500, 200, 500, 680)
    c.setFont("ArialHeb", 9)
    rows = [
        (640, "circle", "נקודת מאור"),
        (600, "switch", "מפסק יחיד"),
        (560, "box", "ארון"),
        (520, "cross", "צלב"),
        (480, "diamond", "מעוין"),
        (440, "bars", "סורג"),
        (400, "wave", "גל"),
        (360, "plus", "פלוס"),
    ]
    for y, kind, label in rows:
        c.setFont("ArialHeb", 9)
        c.drawRightString(488, y - 3, label)
        c.setLineWidth(0.8)
        if kind == "circle":
            c.circle(530, y, 6, stroke=1, fill=0)
        elif kind == "switch":
            _lollipop(c, 528, y, 4, stem=7, gap=0)
        elif kind == "box":
            c.rect(522, y - 5, 12, 12, stroke=1, fill=0)
        elif kind == "cross":
            c.line(522, y - 5, 534, y + 6)
            c.line(522, y + 6, 534, y - 5)
        elif kind == "diamond":
            c.line(528, y - 6, 536, y)
            c.line(536, y, 528, y + 6)
            c.line(528, y + 6, 520, y)
            c.line(520, y, 528, y - 6)
        elif kind == "bars":
            c.line(520, y - 4, 536, y - 4)
            c.line(520, y, 536, y)
            c.line(520, y + 4, 536, y + 4)
        elif kind == "wave":
            c.line(520, y, 524, y + 4)
            c.line(524, y + 4, 528, y - 4)
            c.line(528, y - 4, 532, y + 4)
            c.line(532, y + 4, 536, y)
        else:
            c.line(522, y, 534, y)
            c.line(528, y - 6, 528, y + 6)
    c.save()


def test_open_circle_stays_a_light_when_a_caption_or_clutter_touches_it(tmp_path):
    pdf = tmp_path / "open.pdf"
    _sheet_with_caption_and_cross(pdf)
    out = PdfVectorEngine().analyze(str(pdf), "f1", options=JobOptions(renderPreview=False), library=[])
    catalog = load_default_catalog()
    legend = classify_legend_entries(out.legend, catalog)
    dets = classify_detections(out.detections, catalog=catalog, library=[], legend=legend)
    plan = [d for d in dets if "legend_zone" not in d.reasons]
    lights = [d for d in plan if d.typeKey == "light.point"]
    switches = [d for d in plan if d.typeKey == "control.switch.single"]
    # Plain circle, captioned circle, and the circle under the radial ticks.
    assert len(lights) >= 3
    assert len(switches) >= 1
    # The crossed circle and the switch head are not lighting points.
    assert all(d.x < 180 for d in lights)
    assert all(d.x > 180 for d in switches)


def _legend(c: canvas.Canvas) -> None:
    c.setStrokeColorRGB(0, 0, 0)
    c.setFillColorRGB(0, 0, 0)
    c.setLineWidth(1.0)
    c.line(500, 200, 500, 680)
    rows = [
        (640, "circle", "נקודת מאור"),
        (600, "switch", "מפסק יחיד"),
        (560, "box", "ארון"),
        (520, "cross", "צלב"),
        (480, "diamond", "מעוין"),
        (440, "bars", "סורג"),
        (400, "wave", "גל"),
        (360, "plus", "פלוס"),
    ]
    for y, kind, label in rows:
        c.setFont("ArialHeb", 9)
        c.drawRightString(488, y - 3, label)
        c.setLineWidth(0.8)
        if kind == "circle":
            c.circle(530, y, 6, stroke=1, fill=0)
        elif kind == "switch":
            _lollipop(c, 528, y, 4, stem=7, gap=0)
        elif kind == "box":
            c.rect(522, y - 5, 12, 12, stroke=1, fill=0)
        elif kind == "cross":
            c.line(522, y - 5, 534, y + 6)
            c.line(522, y + 6, 534, y - 5)
        elif kind == "diamond":
            c.line(528, y - 6, 536, y)
            c.line(536, y, 528, y + 6)
            c.line(528, y + 6, 520, y)
            c.line(520, y, 528, y - 6)
        elif kind == "bars":
            c.line(520, y - 4, 536, y - 4)
            c.line(520, y, 536, y)
            c.line(520, y + 4, 536, y + 4)
        elif kind == "wave":
            c.line(520, y, 524, y + 4)
            c.line(524, y + 4, 528, y - 4)
            c.line(528, y - 4, 532, y + 4)
            c.line(532, y + 4, 536, y)
        else:
            c.line(522, y, 534, y)
            c.line(528, y - 6, 528, y + 6)


def _sheet_with_arrow_tip(path) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setStrokeColorRGB(0, 0, 0)
    c.setFillColorRGB(0, 0, 0)
    c.setLineWidth(0.8)
    for x in (40, 70, 360, 390):
        c.line(x, 80, x, 760)
    for y in (90, 120, 760):
        c.line(40, y, 400, y)
    # A real switch, and a stair-arrow tip: the same ring and a stroke, filled with gray.
    _lollipop(c, 220, 700, 5, stem=16, gap=2.4)
    c.setStrokeColorRGB(0, 0, 0)
    c.setFillColorRGB(0, 0, 0)
    c.circle(140, 400, 7, stroke=1, fill=0)
    c.line(147, 400, 160, 400)
    c.setFillColorRGB(0.55, 0.55, 0.55)
    for dx, dy in ((-2, -2), (2, -2), (-2, 2), (2, 2), (0, 0), (0, 3)):
        c.rect(140 + dx, 400 + dy, 1.2, 1.2, stroke=0, fill=1)
    _legend(c)
    c.save()


def _sheet_switch_geometry(path) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setStrokeColorRGB(0, 0, 0)
    c.setFillColorRGB(0, 0, 0)
    c.setLineWidth(0.8)
    for x in (40, 70, 360, 390):
        c.line(x, 80, x, 760)
    for y in (90, 120, 760):
        c.line(40, y, 400, y)
    # Round head and one short stem.
    _lollipop(c, 230, 700, 5, stem=16, gap=2.4)
    # Filled tip: a ring, a stroke, and gray fill. Not an empty head.
    c.circle(150, 520, 7, stroke=1, fill=0)
    c.line(157, 520, 170, 520)
    c.setFillColorRGB(0.55, 0.55, 0.55)
    for dx, dy in ((-2, -2), (2, -2), (-2, 2), (2, 2), (0, 0), (0, 3)):
        c.rect(150 + dx, 520 + dy, 1.2, 1.2, stroke=0, fill=1)
    c.setFillColorRGB(0, 0, 0)
    # Lines that meet at a tip. No round head.
    c.line(310, 520, 324, 528)
    c.line(310, 520, 324, 512)
    c.line(310, 520, 296, 520)
    # A circle crossed by a line that runs through the head. The line is not a stem.
    c.circle(110, 420, 6, stroke=1, fill=0)
    c.line(101, 420, 119, 420)
    # The same crossing, plus a real stem. The wall is ignored and the stem remains.
    c.circle(180, 300, 6, stroke=1, fill=0)
    c.line(168, 300, 192, 300)
    c.line(186, 300, 186, 316)
    # A plain circle touched by a wall made of short colinear pieces. Not a switch.
    c.circle(280, 300, 6, stroke=1, fill=0)
    for x0 in range(250, 330, 8):
        c.line(x0, 306, x0 + 8, 306)
    _legend(c)
    c.save()


def test_switch_is_one_empty_head_and_one_short_stem(tmp_path):
    pdf = tmp_path / "geometry.pdf"
    _sheet_switch_geometry(pdf)
    out = PdfVectorEngine().analyze(str(pdf), "f1", options=JobOptions(renderPreview=False), library=[])
    catalog = load_default_catalog()
    legend = classify_legend_entries(out.legend, catalog)
    dets = classify_detections(out.detections, catalog=catalog, library=[], legend=legend)
    plan = [d for d in dets if "legend_zone" not in d.reasons]
    switches = [d for d in plan if d.typeKey == "control.switch.single"]
    assert any(abs(d.x - 230) < 30 for d in switches)
    assert any(abs(d.x - 180) < 25 for d in switches)
    assert all(abs(d.x - 150) > 25 for d in switches)
    assert all(abs(d.x - 310) > 25 for d in switches)
    assert all(abs(d.x - 110) > 25 for d in switches)
    assert all(abs(d.x - 280) > 20 for d in switches)


def test_stair_arrow_tip_is_not_a_switch(tmp_path):
    pdf = tmp_path / "arrow.pdf"
    _sheet_with_arrow_tip(pdf)
    out = PdfVectorEngine().analyze(str(pdf), "f1", options=JobOptions(renderPreview=False), library=[])
    catalog = load_default_catalog()
    legend = classify_legend_entries(out.legend, catalog)
    dets = classify_detections(out.detections, catalog=catalog, library=[], legend=legend)
    plan = [d for d in dets if "legend_zone" not in d.reasons]
    switches = [d for d in plan if d.typeKey == "control.switch.single"]
    # The gray-filled arrow tip sits at x=140. The real lollipop sits at x=220.
    assert switches
    assert all(d.x > 180 for d in switches)
    assert any(abs(d.x - 220) < 40 for d in switches)
