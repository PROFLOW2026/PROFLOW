"""Synthetic DXF fixtures — deterministic detection counts."""
from __future__ import annotations

import math
import tempfile
from pathlib import Path

import ezdxf
import pytest

from takeoff_worker.dwg_engine import DwgEngine
from takeoff_worker.models import JobOptions


def _write_sym_dxf(path: Path) -> None:
    doc = ezdxf.new("R2010", setup=True)
    doc.header["$INSUNITS"] = 6
    doc.layers.add("S-LIGHT")
    doc.layers.add("S-FROZEN")
    doc.layers.add("S-LINE")
    blk = doc.blocks.new("LAMP1")
    blk.add_line((-5, 0), (5, 0))
    blk.add_circle((0, 0), 3)
    wrap = doc.blocks.new("WRAP-L")
    wrap.add_blockref("LAMP1", (0, 0))
    msp = doc.modelspace()
    msp.add_blockref("LAMP1", (10, 10), dxfattribs={"layer": "S-LIGHT"})
    msp.add_blockref("WRAP-L", (30, 10), dxfattribs={"layer": "S-LIGHT"})
    ins = msp.add_blockref("LAMP1", (50, 10), dxfattribs={"layer": "S-LIGHT"})
    ins.dxf.row_count = 2
    ins.dxf.column_count = 2
    ins.dxf.row_spacing = 10
    ins.dxf.column_spacing = 10
    msp.add_blockref("LAMP1", (10, 10), dxfattribs={"layer": "S-LIGHT", "rotation": 0})
    msp.add_blockref("LAMP1", (80, 10), dxfattribs={"layer": "S-FROZEN"})
    msp.add_line((0, 0), (100, 0), dxfattribs={"layer": "S-LINE"})
    doc.saveas(path)


def _write_layout_dxf(path: Path) -> None:
    doc = ezdxf.new("R2010", setup=True)
    doc.header["$INSUNITS"] = 4
    doc.layers.add("S-LIGHT")
    blk = doc.blocks.new("T1")
    blk.add_circle((0, 0), 2)
    msp = doc.modelspace()
    msp.add_blockref("T1", (0, 0), dxfattribs={"layer": "S-LIGHT"})
    msp.add_blockref("T1", (5, 0), dxfattribs={"layer": "S-LIGHT"})
    lay = doc.layouts.new("PlanA")
    lay.add_viewport(
        center=(150, 100),
        size=(200, 150),
        view_center_point=(2.5, 0),
        view_height=10,
        status=1,
    )
    doc.saveas(path)


def test_synthetic_flat_nested_minsert_dedup(tmp_path: Path):
    p = tmp_path / "sym.dxf"
    _write_sym_dxf(p)
    eng = DwgEngine()
    out = eng.analyze(
        str(p),
        "f1",
        kind="dxf",
        xref_paths={},
        options=JobOptions(renderPreview=False),
        library=[],
    )
    assert len(out.sheets) == 1
    # 1 direct + 1 wrapper + 4 minsert; stacked duplicate at (10,10) collapsed
    assert len(out.detections) == 6
    dups = [d for d in out.detections if "possible_duplicate" in d.reasons]
    assert len(dups) == 1


def test_frozen_layer_hidden_in_viewport(tmp_path: Path):
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add("S-LIGHT")
    blk = doc.blocks.new("L1")
    blk.add_circle((0, 0), 2)
    msp = doc.modelspace()
    msp.add_blockref("L1", (0, 0), dxfattribs={"layer": "S-LIGHT"})
    lay = doc.layouts.new("PlanFrozen")
    vp = lay.add_viewport(
        center=(150, 100),
        size=(200, 150),
        view_center_point=(0, 0),
        view_height=20,
        status=1,
    )
    vp.frozen_layers.append("S-LIGHT")
    p = tmp_path / "frozen.dxf"
    doc.saveas(p)
    out = DwgEngine().analyze(
        str(p),
        "f1",
        kind="dxf",
        xref_paths={},
        options=JobOptions(renderPreview=False),
        library=[],
        sheet_keys={"layout:PlanFrozen"},
    )
    sh = next(s for s in out.sheets if s.sheetKey == "layout:PlanFrozen")
    assert sh.hiddenByLayers >= 1
    assert len([d for d in out.detections if d.sheetKey == sh.sheetKey]) == 0


def test_layout_viewport_sheet(tmp_path: Path):
    p = tmp_path / "plan.dxf"
    _write_layout_dxf(p)
    out = DwgEngine().analyze(
        str(p),
        "f1",
        kind="dxf",
        xref_paths={},
        options=JobOptions(renderPreview=False),
        library=[],
        sheet_keys={"layout:PlanA"},
    )
    sk = [s for s in out.sheets if s.sheetKey == "layout:PlanA"]
    assert sk
    dets = [d for d in out.detections if d.sheetKey == "layout:PlanA"]
    assert len(dets) == 2