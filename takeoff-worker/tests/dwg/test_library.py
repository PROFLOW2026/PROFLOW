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

    def run(library=None):
        return DwgEngine().analyze(
            str(p),
            "f1",
            kind="dxf",
            xref_paths={},
            options=JobOptions(renderPreview=False),
            library=library or [],
        )

    probed = run()
    shape = probed.detections[0].geometryHash
    assert shape
    lib = [
        SymbolLibraryEntry(
            id="1",
            plannerKey="p",
            signatureKind="dwg-block",
            signature="block:T20",
            geometryHash=shape,
            typeKey="light.recessed",
        )
    ]
    out = run(lib)
    assert out.detections[0].typeKey == "light.recessed"
    assert out.detections[0].classifiedBy == "library"
    corrected = [
        SymbolLibraryEntry(
            id="1",
            plannerKey="p",
            signatureKind="dwg-block",
            signature="block:T20",
            geometryHash=shape,
            typeKey="light.surface",
        )
    ]
    again = run(corrected)
    assert again.detections[0].typeKey == "light.surface"
    mismatched = [
        SymbolLibraryEntry(
            id="1",
            plannerKey="p",
            signatureKind="dwg-block",
            signature="block:T20",
            geometryHash="block:*geom:0000000000000000",
            typeKey="light.recessed",
        )
    ]
    blocked = run(mismatched)
    assert blocked.detections[0].typeKey is None