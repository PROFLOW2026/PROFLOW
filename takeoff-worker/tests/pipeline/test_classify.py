from __future__ import annotations

import json
from pathlib import Path

from takeoff_worker.classify.legend_map import match_legend_text
from takeoff_worker.classify.pipeline_classify import classify_detections, classify_legend_entries, legend_key_signature
from takeoff_worker.classify.symbol_groups import assign_symbol_group_labels
from takeoff_worker.data.catalog_loader import load_default_catalog
from takeoff_worker.models import SymbolLibraryEntry, WorkerDetection, WorkerLegendEntry

FIX = Path(__file__).resolve().parents[3] / "docs/audits/blueprint-takeoff-research-2026-11/phase2/outputs/dwg_legend_descriptions_7155.json"


def test_hebrew_legend_phrases_from_7155():
    catalog = load_default_catalog()
    if not FIX.is_file():
        return
    rows = json.loads(FIX.read_text(encoding="utf-8"))
    point = match_legend_text("נקודת מאור", catalog)
    assert point is not None and point.type_key == "light.point"
    assert match_legend_text("נקודת מאור מפסק יחיד", catalog) is None
    for row in rows[:12]:
        match_legend_text(row["desc"], catalog)


def test_library_does_not_override_current_legend_conflict():
    catalog = load_default_catalog()
    det = WorkerDetection(
        id="d1",
        sheetKey="p1",
        fileId="f",
        source="dwg",
        x=1,
        y=2,
        signature="block:36e",
        signatureKind="dwg-block",
        rawClass="36e",
        blockName="36e",
        geometryHash="block:*geom:aaaaaaaaaaaaaaaa",
        typeKey=None,
        classifiedBy="none",
        confidence="none",
        legendRowIds=["row:aaaa", "row:bbbb"],
    )
    lib = [
        SymbolLibraryEntry(
            id="lib1",
            plannerKey="test",
            signatureKind="dwg-block",
            signature="block:36e",
            geometryHash="block:*geom:aaaaaaaaaaaaaaaa",
            typeKey="light.recessed",
        )
    ]
    legend = [
        WorkerLegendEntry(
            key="row:aaaa",
            fileId="f",
            signature="block:36e",
            signatureKind="dwg-block",
            decodedText="נקודת מאור חירום",
            typeKey="light.emergency",
            confidence="medium",
        ),
        WorkerLegendEntry(
            key="row:bbbb",
            fileId="f",
            signature="block:36e",
            signatureKind="dwg-block",
            decodedText="גוף תאורה שקוע",
            typeKey="light.recessed",
            confidence="medium",
        ),
    ]
    out = classify_detections([det], catalog=catalog, library=lib, legend=legend)[0]
    assert out.typeKey is None
    assert out.classifiedBy == "none"
    assert "type_ambiguous" in out.reasons


def test_library_precedence():
    catalog = load_default_catalog()
    det = WorkerDetection(
        id="d1",
        sheetKey="p1",
        fileId="f",
        source="dwg",
        x=1,
        y=2,
        signature="block:t20",
        signatureKind="dwg-block",
        rawClass="T20",
        blockName="T20",
        geometryHash="block:*geom:aaaaaaaaaaaaaaaa",
        typeKey=None,
        classifiedBy="none",
        confidence="none",
    )
    lib = [
        SymbolLibraryEntry(
            id="lib1",
            plannerKey="test",
            signatureKind="dwg-block",
            signature="block:t20",
            geometryHash="block:*geom:aaaaaaaaaaaaaaaa",
            typeKey="power.socket.ip",
        )
    ]
    legend = {
        "L1": WorkerLegendEntry(
            key="L1",
            fileId="f",
            signature="legend:x",
            signatureKind="legend-key",
            typeKey="power.socket.single",
            confidence="medium",
        )
    }
    legend_list = list(legend.values())
    out = classify_detections([det], catalog=catalog, library=lib, legend=legend_list)[0]
    assert out.typeKey == "power.socket.ip"
    assert out.classifiedBy == "library"
    det.geometryHash = "block:*geom:bbbbbbbbbbbbbbbb"
    changed = classify_detections([det], catalog=catalog, library=lib, legend=legend_list)[0]
    assert changed.typeKey is None
    assert changed.classifiedBy == "none"


def test_legend_key_library_labels_every_occurrence():
    catalog = load_default_catalog()
    sig = legend_key_signature("L6")
    lib = [
        SymbolLibraryEntry(
            id="lib-l6",
            plannerKey="test",
            signatureKind="legend-key",
            signature=sig,
            typeKey="light.recessed",
        )
    ]
    dets = [
        WorkerDetection(
            id=f"p1#{i}",
            sheetKey="p1",
            fileId="f",
            source="pdf",
            x=float(i),
            y=1,
            signature=f"shape:unique-{i}",
            signatureKind="pdf-shape",
            rawClass="L6",
            legendKey="L6",
            typeKey=None,
            classifiedBy="none",
            confidence="none",
        )
        for i in (1, 2)
    ]
    out = classify_detections(dets, catalog=catalog, library=lib, legend=[])
    assert [d.typeKey for d in out] == ["light.recessed", "light.recessed"]
    assert {d.classifiedBy for d in out} == {"library"}


def test_undecodable_legend_skips_catalog_match():
    catalog = load_default_catalog()
    row = WorkerLegendEntry(
        key="Lx",
        fileId="f",
        signature="legend:1",
        signatureKind="legend-key",
        rawText="garbageglyph",
        reasons=["legend_text_undecodable"],
    )
    out = classify_legend_entries([row], catalog)[0]
    assert out.typeKey is None
    assert out.confidence == "none"


def test_pdf_legend_key_propagates_row_type():
    catalog = load_default_catalog()
    row = WorkerLegendEntry(
        key="L2",
        fileId="f",
        signature="shape:x",
        signatureKind="pdf-shape",
        decodedText='גוף תאורה שקוע',
        decodedBy="pdf_text",
        typeKey="light.recessed",
        confidence="medium",
    )
    det = WorkerDetection(
        id="d1",
        sheetKey="p1",
        fileId="f",
        source="pdf",
        x=1,
        y=2,
        signature="shape:y",
        signatureKind="pdf-shape",
        rawClass="L2",
        legendKey="L2",
        typeKey=None,
        classifiedBy="none",
        confidence="medium",
    )
    out = classify_detections([det], catalog=catalog, library=[], legend=[row])[0]
    assert out.typeKey == "light.recessed"
    assert out.classifiedBy == "legend_text"


def test_symbol_group_labels():
    dets = [
        WorkerDetection(
            id="a",
            sheetKey="p1",
            fileId="f",
            source="pdf",
            x=0,
            y=0,
            signature="sig-a",
            signatureKind="pdf-shape",
            rawClass="x",
            typeKey=None,
            classifiedBy="none",
            confidence="none",
            reasons=["unclassified"],
        ),
        WorkerDetection(
            id="b",
            sheetKey="p1",
            fileId="f",
            source="pdf",
            x=1,
            y=1,
            signature="sig-a",
            signatureKind="pdf-shape",
            rawClass="x",
            typeKey=None,
            classifiedBy="none",
            confidence="none",
            reasons=["unclassified"],
        ),
    ]
    n = assign_symbol_group_labels(dets)
    assert n == 1
    assert dets[0].tagText == "סמל ללא סווג"
    assert "symbol_group_candidate" in dets[0].reasons