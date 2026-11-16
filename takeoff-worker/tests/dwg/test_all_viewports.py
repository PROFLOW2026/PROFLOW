"""One physical symbol is counted once, on every floor viewport and outside them."""
from __future__ import annotations

from pathlib import Path

import ezdxf

from takeoff_worker.dwg_engine import DwgEngine
from takeoff_worker.models import JobOptions


def _write(path: Path) -> None:
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add("S-LIGHT")
    doc.layers.add("WALL")
    lamp = doc.blocks.new("LAMP")
    lamp.add_circle((0, 0), 2)
    arch = doc.blocks.new("WALLBLK")
    arch.add_line((0, 0), (10, 0))
    msp = doc.modelspace()
    msp.add_blockref("LAMP", (0, 0), dxfattribs={"layer": "S-LIGHT"})
    msp.add_blockref("LAMP", (100, 0), dxfattribs={"layer": "S-LIGHT"})
    msp.add_blockref("LAMP", (500, 0), dxfattribs={"layer": "S-LIGHT"})
    msp.add_blockref("WALLBLK", (0, 20), dxfattribs={"layer": "WALL"})
    lay = doc.layouts.get("Layout1")
    lay.add_viewport(center=(40, 40), size=(80, 60), view_center_point=(0, 0), view_height=40, status=1)
    lay.add_viewport(center=(40, 40), size=(80, 60), view_center_point=(0, 0), view_height=40, status=1)
    lay.add_viewport(center=(40, 40), size=(80, 60), view_center_point=(100, 0), view_height=40, status=1)
    doc.saveas(path)


def test_every_floor_and_outside_symbol_is_counted_once(tmp_path: Path):
    path = tmp_path / "floors.dxf"
    _write(path)
    out = DwgEngine().analyze(
        str(path),
        "f1",
        kind="dxf",
        xref_paths={},
        options=JobOptions(renderPreview=False),
        library=[],
    )
    dets = [d for d in out.detections if d.sheetKey == "layout:Layout1"]
    assert len(dets) == 3
    assert len({(round(d.native.x, 1), round(d.native.y, 1)) for d in dets if d.native}) == 3
    assert all(d.typeKey is None for d in dets)
