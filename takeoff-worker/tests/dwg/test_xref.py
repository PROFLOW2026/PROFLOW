"""Synthetic host + xref DXF pair."""
from __future__ import annotations

from pathlib import Path

import ezdxf

from takeoff_worker.dwg_engine import DwgEngine
from takeoff_worker.models import JobOptions


def test_xref_merge_when_file_provided(tmp_path: Path):
    xdoc = ezdxf.new("R2010", setup=True)
    xdoc.layers.add("S-LIGHT")
    blk = xdoc.blocks.new("T1")
    blk.add_circle((0, 0), 2)
    xdoc.modelspace().add_blockref("T1", (100, 100), dxfattribs={"layer": "S-LIGHT"})
    xref_path = tmp_path / "xref.dxf"
    xdoc.saveas(xref_path)

    hdoc = ezdxf.new("R2010", setup=True)
    hdoc.layers.add("S-LIGHT")
    sym = hdoc.blocks.new("T1")
    sym.add_circle((0, 0), 2)
    bxref = hdoc.blocks.new("XREF_PLAN", dxfattribs={"flags": 4})
    bxref.block.dxf.xref_path = "xref.dxf"
    hdoc.modelspace().add_blockref("XREF_PLAN", (0, 0), dxfattribs={"layer": "S-LIGHT"})
    host_path = tmp_path / "host.dxf"
    hdoc.saveas(host_path)

    out_no = DwgEngine().analyze(
        str(host_path),
        "h",
        kind="dxf",
        xref_paths={},
        options=JobOptions(renderPreview=False),
        library=[],
    )
    out_yes = DwgEngine().analyze(
        str(host_path),
        "h",
        kind="dxf",
        xref_paths={"XREF_PLAN": str(xref_path)},
        options=JobOptions(renderPreview=False),
        library=[],
    )
    assert len(out_yes.detections) >= len(out_no.detections) + 1
    assert any(w.code == "xref_missing" for w in out_no.warnings)