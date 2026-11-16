"""Block names stay untyped unless a legend row on the same drawing matches the catalog."""
from __future__ import annotations

from pathlib import Path

import ezdxf

from takeoff_worker.dwg_engine import DwgEngine
from takeoff_worker.classify.legend_map import is_socket_bank, stated_socket_count
from takeoff_worker.classify.text_norm import normalize_legend_text
from takeoff_worker.dwg_engine.legend_types import (
    accepted_legend_rows,
    socket_bank_signatures,
    type_map_from_legend_rows,
)
from takeoff_worker.data.catalog_loader import load_default_catalog
from takeoff_worker.models import JobOptions, SymbolLibraryEntry

_RANK = {"high": 0, "medium": 1, "low": 2, "none": 3}


def _sheet(doc, path: Path) -> None:
    lay = doc.layouts.new("Plan")
    lay.add_viewport(
        center=(200, 80),
        size=(500, 280),
        view_center_point=(160, 40),
        view_height=160,
        status=1,
    )
    doc.saveas(path)


def _analyze(path: Path, library=None):
    return DwgEngine().analyze(
        str(path),
        "f1",
        kind="dxf",
        xref_paths={},
        options=JobOptions(renderPreview=False),
        library=library or [],
    )


def test_short_block_names_stay_untyped(tmp_path: Path):
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add("S-LIGHT")
    for name in ("sw1", "l60", "l1", "parabolic", "elec-lum-11"):
        b = doc.blocks.new(name)
        b.add_circle((0, 0), 1)
        doc.modelspace().add_blockref(name, (30, 20), dxfattribs={"layer": "S-LIGHT"})
    p = tmp_path / "tags.dxf"
    _sheet(doc, p)
    out = _analyze(p)
    assert out.detections
    for det in out.detections:
        assert det.typeKey is None
        assert det.confidence == "none"
        assert det.classifiedBy == "none"
        assert det.signature.startswith("block:")


def test_legend_hebrew_assigns_type_and_leaves_unnamed_block(tmp_path: Path):
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add("S-LIGHT")
    doc.layers.add("ELC")
    doc.styles.add("HEB", font="heb.shx")
    msp = doc.modelspace()
    for name in ("SO1", "SW1", "LAMP", "BARE"):
        blk = doc.blocks.new(name)
        blk.add_circle((0, 0), 1)
    # Legend column. Text sits to the left, the way a Hebrew sheet is drawn.
    legend = [
        ("SO1", 20, "שקע כוח", "ELC"),
        ("SW1", 40, "מפסק יחיד", "S-LIGHT"),
        ("LAMP", 60, "גוף תאורה שקוע", "S-LIGHT"),
    ]
    for name, y, text, layer in legend:
        msp.add_blockref(name, (200, y), dxfattribs={"layer": layer})
        msp.add_text(
            text,
            height=3.5,
            dxfattribs={"insert": (150, y), "style": "HEB", "layer": "LGD", "height": 3.5},
        )
    # Plan copies, plus a tag the legend does not name.
    msp.add_blockref("SO1", (40, 20), dxfattribs={"layer": "ELC"})
    msp.add_blockref("SO1", (55, 20), dxfattribs={"layer": "ELC"})
    msp.add_blockref("SW1", (40, 40), dxfattribs={"layer": "S-LIGHT"})
    msp.add_blockref("LAMP", (40, 60), dxfattribs={"layer": "S-LIGHT"})
    msp.add_blockref("BARE", (70, 20), dxfattribs={"layer": "S-LIGHT"})
    p = tmp_path / "legend.dxf"
    _sheet(doc, p)
    out = _analyze(p)

    by_block: dict[str, list] = {}
    for det in out.detections:
        by_block.setdefault(det.blockName, []).append(det)

    assert len(by_block["SO1"]) == 2
    assert {d.typeKey for d in by_block["SO1"]} == {"power.outlet.commercial"}
    assert {d.classifiedBy for d in by_block["SO1"]} == {"legend_text"}
    assert len(by_block["SW1"]) == 1
    assert by_block["SW1"][0].typeKey == "control.switch.single"
    assert by_block["LAMP"][0].typeKey == "light.recessed"
    assert by_block["BARE"][0].typeKey is None
    assert by_block["BARE"][0].confidence == "none"
    assert by_block["BARE"][0].signature == "block:BARE"

    legend_by_sig = {row.signature: row for row in out.legend}
    for det in by_block["SO1"] + by_block["SW1"] + by_block["LAMP"]:
        ceiling = legend_by_sig[det.signature].confidence or "none"
        assert _RANK[det.confidence] >= _RANK[ceiling]


def test_library_wins_over_legend(tmp_path: Path):
    doc = ezdxf.new("R2010", setup=True)
    doc.layers.add("S-LIGHT")
    doc.styles.add("HEB", font="heb.shx")
    msp = doc.modelspace()
    for name in ("SO1", "SW1", "LAMP"):
        blk = doc.blocks.new(name)
        blk.add_circle((0, 0), 1)
        msp.add_blockref(name, (200, 20 if name == "SO1" else 40 if name == "SW1" else 60), dxfattribs={"layer": "S-LIGHT"})
    msp.add_text("שקע כוח", height=3.5, dxfattribs={"insert": (150, 20), "style": "HEB", "height": 3.5})
    msp.add_text("מפסק יחיד", height=3.5, dxfattribs={"insert": (150, 40), "style": "HEB", "height": 3.5})
    msp.add_text("גוף תאורה שקוע", height=3.5, dxfattribs={"insert": (150, 60), "style": "HEB", "height": 3.5})
    msp.add_blockref("SO1", (40, 20), dxfattribs={"layer": "S-LIGHT"})
    p = tmp_path / "lib.dxf"
    _sheet(doc, p)
    probed = _analyze(p)
    shape = next(d.geometryHash for d in probed.detections if d.blockName == "SO1")
    assert shape
    lib = [
        SymbolLibraryEntry(
            id="1",
            plannerKey="p",
            signatureKind="dwg-block",
            signature="block:SO1",
            geometryHash=shape,
            typeKey="light.recessed",
        )
    ]
    out = _analyze(p, library=lib)
    so = [d for d in out.detections if d.blockName == "SO1"]
    assert len(so) == 1
    assert so[0].typeKey == "light.recessed"
    assert so[0].classifiedBy == "library"
    other_planner_is_not_in_this_library = [
        SymbolLibraryEntry(
            id="2",
            plannerKey="someone-else",
            signatureKind="dwg-block",
            signature="block:SO1",
            geometryHash=shape,
            typeKey="fire.smoke_detector",
        )
    ]
    wrong_shape = [
        SymbolLibraryEntry(
            id="3",
            plannerKey="p",
            signatureKind="dwg-block",
            signature="block:SO1",
            geometryHash="block:*geom:0000000000000000",
            typeKey="light.recessed",
        )
    ]
    kept = _analyze(p, library=wrong_shape)
    kept_so = [d for d in kept.detections if d.blockName == "SO1"]
    assert kept_so[0].typeKey != "light.recessed"
    assert other_planner_is_not_in_this_library[0].plannerKey != lib[0].plannerKey


def test_single_phase_outlet_is_not_three_phase():
    catalog = load_default_catalog()

    def mapped(text: str) -> str | None:
        rows = [dict(signature="block:SO", rawText=text, decodedText=text, decodedBy=None)]
        hit = type_map_from_legend_rows(rows, catalog)
        return None if "block:SO" not in hit else hit["block:SO"][0]

    assert mapped("בית תקע חד פאזי") == "power.socket.single"
    assert mapped('ג"ת שקוע בהנמכת תקרה') == "light.recessed"
    assert mapped("נקודת מאור") == "light.point"
    assert mapped("נקודת בית-תקע אחרת") == "power.socket.single"
    assert mapped("תאורת חירום חד תכליתי") == "light.emergency"
    assert mapped("הכוונה דו תכליתי") == "light.emergency_combo"
    assert mapped("בית תקע הרמטי") == "power.socket.ip"
    # ב.ת is בית תקע. The dotted form must survive the second normalize.
    assert mapped("ב.ת בודד") == "power.socket.single"
    twice = normalize_legend_text(normalize_legend_text("ב.ת בודד"))
    assert "בית תקע" in twice and "בודד" in twice
    # A socket bank is not one socket, even when the SHX font stored final tsadi as ']'.
    assert mapped("מקבץ שקעים") is None
    assert mapped("מקבץ שקעי מסך") is None
    assert mapped("מקב] שקעים") is None
    assert is_socket_bank("מקבץ שקעים")
    assert is_socket_bank("מקבץ שקעי מסך")
    # 4 modules in a box, and model ג-17, are not a socket count.
    assert stated_socket_count('ב.ת בודד "בטיצינו לונה" בתיבה ל 4 מודולים עם') is None
    assert stated_socket_count('מקבץ שקעים דגם ג-17 "עדא פלסט" לפי פרט') is None
    assert stated_socket_count("מקבץ שקעי מסך לפי פרט") is None
    # A count the legend actually writes is read, and still does not become one single socket.
    assert stated_socket_count("מקבץ 4 שקעים") == 4
    assert mapped("מקבץ 4 שקעים") is None
    assert mapped("לוח ראשי") == "panel.main"
    assert mapped("לוח") is None
    assert mapped("לוח גנרטור") is None
    assert mapped("ראשי") is None
    notes = [
        dict(signature="block:s1", rawText="בקומות המבנה", decodedText="בקומות המבנה"),
        dict(signature="block:lt", rawText="לטבעת גישור", decodedText="לטבעת גישור"),
        dict(signature="block:da3", rawText="L53 לוח גנרטור", decodedText="L53 לוח גנרטור"),
    ]
    assert accepted_legend_rows(notes, catalog) == []
    assert "block:da3" not in type_map_from_legend_rows(notes, catalog)


def test_socket_bank_signature_is_review_not_a_type():
    catalog = load_default_catalog()
    rows = [
        dict(signature="block:L39", rawText="מקבץ שקעים", decodedText="מקבץ שקעים", decodedBy=None),
        dict(signature="block:SO1", rawText="ב.ת בודד", decodedText="ב.ת בודד", decodedBy=None),
    ]
    mapped = type_map_from_legend_rows(rows, catalog)
    banks = socket_bank_signatures(rows)
    assert "block:L39" in banks
    assert "block:L39" not in mapped
    assert mapped["block:SO1"][0] == "power.socket.single"


def test_conflicting_legend_text_does_not_invent_a_type():
    catalog = load_default_catalog()
    rows = [
        dict(signature="block:SO1", rawText="שקע כוח", decodedText="שקע כוח", decodedBy=None),
        dict(signature="block:SO1", rawText="מפסק יחיד", decodedText="מפסק יחיד", decodedBy=None),
    ]
    mapped = type_map_from_legend_rows(rows, catalog)
    assert "block:SO1" not in mapped
    assert "block:so1" not in mapped
