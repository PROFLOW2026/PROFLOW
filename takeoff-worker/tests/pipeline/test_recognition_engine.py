from __future__ import annotations

import numpy as np

from takeoff_worker.classify.confidence import calibrate_confidences
from takeoff_worker.classify.counting_policy import boq_count_summary, is_countable
from takeoff_worker.classify.legend_map import match_legend_text
from takeoff_worker.classify.pipeline_classify import classify_detections, classify_legend_entries
from takeoff_worker.data.catalog_loader import load_default_catalog
from takeoff_worker.models import WorkerDetection, WorkerLegendEntry
from takeoff_worker.pdf_engine.masks import MIN_SYMBOL_MASK_INK, is_drawing_noise_mask

_CONF_RANK = {"high": 0, "medium": 1, "low": 2, "none": 3}


def _conf_not_above(a: str, ceiling: str) -> bool:
    return _CONF_RANK[a] >= _CONF_RANK[ceiling]


def test_drawing_noise_mask_tagged_not_countable():
    mask = np.zeros((64, 64), dtype=np.uint8)
    mask[32, 32] = 1
    assert is_drawing_noise_mask(mask, 8.0, 8.0)
    assert mask.sum() < MIN_SYMBOL_MASK_INK

    det = WorkerDetection(
        id="n1",
        sheetKey="p1",
        fileId="f",
        source="pdf",
        x=0,
        y=0,
        w=2,
        h=2,
        signature="shape:noise",
        signatureKind="pdf-shape",
        rawClass="drawing_noise",
        typeKey=None,
        classifiedBy="none",
        confidence="none",
        reasons=["drawing_noise"],
    )
    assert "drawing_noise" in det.reasons
    assert not is_countable(det)

    catalog = load_default_catalog()
    out = classify_detections([det], catalog=catalog, library=[], legend=[])[0]
    assert out.typeKey is None
    assert out.confidence == "none"


def test_hebrew_sheket_maps_power_socket_catalog():
    catalog = load_default_catalog()
    m = match_legend_text("שקע", catalog)
    assert m is not None
    assert m.type_key == "power.socket.single"


def test_unmatched_shape_stays_unclassified_none_confidence():
    catalog = load_default_catalog()
    det = WorkerDetection(
        id="u1",
        sheetKey="p1",
        fileId="f",
        source="pdf",
        x=1,
        y=2,
        signature="shape:unknown",
        signatureKind="pdf-shape",
        rawClass="UNK",
        legendKey=None,
        typeKey=None,
        classifiedBy="none",
        confidence="none",
        reasons=["unclassified"],
    )
    out = classify_detections([det], catalog=catalog, library=[], legend=[])[0]
    assert out.typeKey is None
    assert out.confidence == "none"
    assert "unclassified" in out.reasons


def test_legend_catalog_propagates_shared_signature_synthetic():
    """Legend text -> catalog typeKey flows to plan symbols via legend key + mask signature."""
    catalog = load_default_catalog()
    shared_sig = "shape:sheket-koach-demo"

    legend_row = WorkerLegendEntry(
        key="L1",
        fileId="f",
        signature=shared_sig,
        signatureKind="pdf-shape",
        decodedText="שקע כוח",
        decodedBy="pdf_text",
    )
    legend = classify_legend_entries([legend_row], catalog)
    assert legend[0].typeKey == "power.outlet.commercial"
    assert legend[0].confidence in ("low", "medium", "high")
    legend_conf = legend[0].confidence or "none"

    paired = WorkerDetection(
        id="paired",
        sheetKey="p1",
        fileId="f",
        source="pdf",
        x=10,
        y=20,
        signature=shared_sig,
        signatureKind="pdf-shape",
        rawClass="L1",
        legendKey="L1",
        typeKey=None,
        classifiedBy="none",
        confidence="none",
        reasons=[],
    )
    alone = WorkerDetection(
        id="alone",
        sheetKey="p1",
        fileId="f",
        source="pdf",
        x=30,
        y=40,
        signature="shape:no-legend-match",
        signatureKind="pdf-shape",
        rawClass="UNK",
        legendKey=None,
        typeKey=None,
        classifiedBy="none",
        confidence="none",
        reasons=["unclassified"],
    )
    bare_dwg = WorkerDetection(
        id="dwg1",
        sheetKey="p1",
        fileId="f",
        source="dwg",
        x=0,
        y=0,
        signature="block:sw1",
        signatureKind="dwg-block",
        rawClass="sw1",
        blockName="sw1",
        layer="E-POWER",
        typeKey=None,
        classifiedBy="none",
        confidence="none",
    )

    dets = classify_detections([paired, alone, bare_dwg], catalog=catalog, library=[], legend=legend)
    dets = calibrate_confidences(dets, legend)

    by_id = {d.id: d for d in dets}
    assert by_id["paired"].typeKey == "power.outlet.commercial"
    assert by_id["paired"].classifiedBy == "legend_text"
    assert _conf_not_above(by_id["paired"].confidence, legend_conf)

    assert by_id["alone"].typeKey is None
    assert by_id["alone"].confidence == "none"
    assert "unclassified" in by_id["alone"].reasons

    assert by_id["dwg1"].typeKey is None
    assert by_id["dwg1"].confidence == "none"

    mask = np.zeros((64, 64), dtype=np.uint8)
    mask[32, 32] = 1
    assert is_drawing_noise_mask(mask, 8.0, 8.0)
    assert mask.sum() < MIN_SYMBOL_MASK_INK

    noise_like_count = 1 if is_countable(
        WorkerDetection(
            id="n",
            sheetKey="p1",
            fileId="f",
            source="pdf",
            x=0,
            y=0,
            signature="shape:scrap",
            signatureKind="pdf-shape",
            rawClass="scrap",
            typeKey=None,
            classifiedBy="none",
            confidence="none",
            reasons=["drawing_noise"],
        )
    ) else 0
    assert noise_like_count == 0
    boq = boq_count_summary(dets)
    assert boq["boq_excluded_drawing_noise"] == 0.0
    assert boq["boq_countable"] >= 1.0