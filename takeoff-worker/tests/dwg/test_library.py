from pathlib import Path

import ezdxf

from takeoff_worker.dwg_engine import DwgEngine
from takeoff_worker.models import JobOptions, SymbolLibraryEntry


def test_library_sets_type_key(tmp_path: Path):
    p = tmp_path / "lib.dxf"
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add("S-LIGHT")
    b = doc.blocks.new("T20")
    b.add_circle((0, 0), 1)
    doc.modelspace().add_blockref("T20", (0, 0), dxfattribs={"layer": "S-LIGHT"})
    doc.saveas(p)
    lib = [
        SymbolLibraryEntry(
            id="1",
            plannerKey="p",
            signatureKind="dwg-block",
            signature="block:T20",
            typeKey="light.recessed",
        )
    ]
    out = DwgEngine().analyze(
        str(p),
        "f1",
        kind="dxf",
        xref_paths={},
        options=JobOptions(renderPreview=False),
        library=lib,
    )
    assert out.detections[0].typeKey == "light.recessed"
    assert out.detections[0].classifiedBy == "library"