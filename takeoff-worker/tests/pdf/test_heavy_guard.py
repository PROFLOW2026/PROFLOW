"""Heavy-plan guards (memory-safe defaults)."""
from __future__ import annotations

import glob
import os

import pytest
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from takeoff_worker.models import JobOptions
from takeoff_worker.pdf_engine.engine import PdfVectorEngine
from takeoff_worker.pdf_engine.heavy_guard import HeavyBudget, assess_sheet_heavy


def _busy_pdf(tmp_path, n_circles: int) -> str:
    p = tmp_path / "busy.pdf"
    c = canvas.Canvas(str(p), pagesize=A4)
    w, h = A4
    for i in range(n_circles):
        c.setFillColor(colors.Color((i % 7) / 7, 0.2, 0.5))
        c.circle(40 + (i % 20) * 22, h - 60 - (i // 20) * 28, 8, stroke=0, fill=1)
    c.save()
    return str(p)


def test_assess_hard_threshold(monkeypatch):
    monkeypatch.setenv("PDF_MAX_PATH_OBJECTS_HARD", "1000")
    b = HeavyBudget.from_env()
    a = assess_sheet_heavy({"paths": 5000, "images": 0}, 4800, 1000, 1000, b)
    assert a.exceeds_hard
    assert not assess_sheet_heavy({"paths": 50, "images": 0}, 40, 1000, 1000, b).exceeds_hard


def test_engine_hard_budget_partial(monkeypatch, tmp_path):
    monkeypatch.setenv("PDF_MAX_PATH_OBJECTS_HARD", "30")
    monkeypatch.setenv("PDF_MAX_PATH_OBJECTS", "20")
    path = _busy_pdf(tmp_path, 45)
    out = PdfVectorEngine().analyze(path, "f", options=JobOptions(renderPreview=False), library=[])
    codes = {w.code for w in out.warnings}
    assert "pdf_plan_too_heavy" in codes
    assert out.sheets[0].analyzed == "partial"


@pytest.mark.skipif(
    not glob.glob(os.path.expanduser(r"~/Downloads/FW__*/**/7155-A1-תאורה ג.pdf"), recursive=True),
    reason="7155 corpus missing",
)
def _print_7155_arrow_switches(plan_path: str, out, templates) -> None:
    """Say whether a stemmed legend mark sits on a filled tip. Not an accuracy check."""
    import pypdfium2 as pdfium

    from takeoff_worker.pdf_engine.geometry import media_size_from_view, rotation_matrix
    from takeoff_worker.pdf_engine.monochrome import _filled_tip, _round_head
    from takeoff_worker.pdf_engine.pdfium_extract import extract_page_drawings
    from takeoff_worker.pdf_engine.symbol_match import stemmed_templates
    from takeoff_worker.pdf_engine.templates import comp_from_legend_template

    stem_keys = set(stemmed_templates([(t.key, comp_from_legend_template(t)) for t in templates]).keys)
    switches = [
        d
        for d in out.detections
        if d.legendKey in stem_keys and "legend_zone" not in (d.reasons or [])
    ]
    doc = pdfium.PdfDocument(plan_path)
    page = doc[0]
    rot = int(page.get_rotation() or 0) % 360
    vis_w, vis_h = float(page.get_width()), float(page.get_height())
    pw, ph = media_size_from_view(rot, vis_w, vis_h)
    matrix = rotation_matrix(rot, pw, ph)
    drawings, _seconds = extract_page_drawings(page, rot, vis_w, vis_h)
    filled = []
    for drawing in drawings:
        head = _round_head(drawing, matrix)
        if head is None:
            continue
        cx, cy, rad = head
        if _filled_tip(drawings, matrix, drawing, cx, cy, rad):
            filled.append((cx, cy, rad))
    on_tip = 0
    for det in switches:
        for cx, cy, rad in filled:
            if (det.x - cx) ** 2 + (det.y - cy) ** 2 <= (rad + 4.0) ** 2:
                on_tip += 1
                break
    print(
        f"7155 stemmed-legend marks {len(switches)}; of those, sitting on a filled tip {on_tip}"
    )


def test_7155_not_marked_partial_default_guard():
    for k in list(os.environ.keys()):
        if k.startswith("PDF_MAX_"):
            os.environ.pop(k, None)
    plan = glob.glob(os.path.expanduser(r"~/Downloads/FW__*/**/7155-A1-תאורה ג.pdf"), recursive=True)[0]
    leg = glob.glob(os.path.expanduser(r"~/Downloads/FW__*/**/7155-A1-מקרא.pdf"), recursive=True)[0]
    from takeoff_worker.pdf_engine.legend import build_legend_templates

    eng = PdfVectorEngine()
    opt = JobOptions(renderPreview=False)
    legend_out = eng.analyze(leg, "l", options=opt, library=[])
    tpls = build_legend_templates(legend_out)
    out = eng.analyze(plan, "lg", options=opt, library=[], extra_templates=tpls)
    assert out.sheets[0].analyzed == "full"
    assert "pdf_plan_too_heavy" not in {w.code for w in out.warnings}
    # 248 is the previous engine output, not a manual count of devices.
    # The bounds catch a collapse or a doubling only. They are not an accuracy proof.
    previous = 248
    count = len(out.detections)
    print(f"7155 detections {count} (previous engine output {previous}, delta {count - previous:+d})")
    assert previous // 2 < count < previous * 2
    _print_7155_arrow_switches(plan, out, tpls)