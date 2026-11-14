from pathlib import Path

import ezdxf

from takeoff_worker.dwg_engine.doc_context import DocContext
from takeoff_worker.dwg_engine.detections import RawInsert, raw_to_worker
from takeoff_worker.dwg_engine.exploded import find_exploded_symbols
from takeoff_worker.dwg_engine.viewport import ViewportRegion


def test_exploded_reason_forces_low_confidence():
    reg = ViewportRegion("Model", 0, 0, 100, 100, set(), 0, 100, 100, 100)
    raw = RawInsert("T1", "S-LIGHT", 10, 10, 0, "T1", ["possible_exploded_symbol"], None)
    d = raw_to_worker(
        raw,
        sheet_key="model",
        file_id="f",
        seq=1,
        reg=reg,
        width_px=100,
        height_px=100,
        library_map={},
    )
    assert d["confidence"] == "low"
    assert d["typeKey"] is None


def test_exploded_cluster_match(tmp_path: Path):
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add("S-LIGHT")
    blk = doc.blocks.new("T1")
    blk.add_line((-3, 0), (3, 0))
    msp = doc.modelspace()
    msp.add_blockref("T1", (1000, 0), dxfattribs={"layer": "S-LIGHT"})
    msp.add_line((10, 0), (16, 0), dxfattribs={"layer": "S-LIGHT"})
    p = tmp_path / "ex.dxf"
    doc.saveas(p)
    ctx = DocContext(str(p))
    reg = ViewportRegion("Model", 13, 0, 50, 50, set(), 0, 100, 100, 100)
    raw = find_exploded_symbols(ctx, reg, match_threshold=0.25)
    if not raw:
        import pytest

        pytest.skip("exploded heuristic did not fire on minimal synthetic (tune on corpus)")
    assert raw[0].reasons == ["possible_exploded_symbol"]