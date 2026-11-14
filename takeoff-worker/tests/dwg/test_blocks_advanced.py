"""Nested wrapper, dynamic-like anonymous, duplicate stacked inserts."""
from __future__ import annotations

from pathlib import Path

import ezdxf

from takeoff_worker.dwg_engine import DwgEngine
from takeoff_worker.models import JobOptions


def _build(path: Path) -> None:
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add("S-SW")
    leaf = doc.blocks.new("LU24")
    leaf.add_circle((0, 0), 1)
    wrapper = doc.blocks.new("*U99")
    wrapper.add_blockref("LU24", (0, 0))
    msp = doc.modelspace()
    msp.add_blockref("*U99", (10, 10), dxfattribs={"layer": "S-SW"})
    msp.add_blockref("LU24", (20, 10), dxfattribs={"layer": "S-SW"})
    msp.add_blockref("LU24", (30, 10), dxfattribs={"layer": "S-SW"})
    ins = msp.add_blockref("LU24", (40, 10), dxfattribs={"layer": "S-SW"})
    ins2 = msp.add_blockref("LU24", (40, 10), dxfattribs={"layer": "S-SW", "rotation": 0})
    ins2  # duplicate stack
    doc.saveas(path)


def test_wrapper_dynamic_duplicate(tmp_path: Path):
    p = tmp_path / "adv.dxf"
    _build(p)
    out = DwgEngine().analyze(
        str(p),
        "f",
        kind="dxf",
        xref_paths={},
        options=JobOptions(renderPreview=False),
        library=[],
    )
    sigs = [d.signature for d in out.detections]
    assert sum(1 for s in sigs if s == "block:LU24") >= 3
    assert any("possible_duplicate" in d.reasons for d in out.detections)
    assert any("dynamic_block_unresolved" in d.reasons for d in out.detections) or any(
        d.rawClass == "LU24" for d in out.detections
    )