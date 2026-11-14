"""Emit minimal WorkerResult JSON with null on every Optional field (fuzz fixture for TS ingest)."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, get_args, get_origin

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pydantic import BaseModel  # noqa: E402

from takeoff_worker.models import (  # noqa: E402
    WorkerDetection,
    WorkerLegendEntry,
    WorkerLinear,
    WorkerResult,
    WorkerSheet,
    WorkerWarning,
    WorkerError,
    SheetScale,
    XrefMissing,
)


def _scalar(kind: Any) -> Any:
    if kind is str:
        return ""
    if kind is int:
        return 0
    if kind is float:
        return 0.0
    if kind is bool:
        return False
    return None


def _fill(model: type[BaseModel]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for name, field in model.model_fields.items():
        ann = field.annotation
        origin = get_origin(ann)
        if origin is list:
            item = get_args(ann)[0]
            if isinstance(item, type) and issubclass(item, BaseModel):
                out[name] = [_fill(item)]
            else:
                out[name] = []
            continue
        if origin is dict:
            out[name] = {}
            continue
        if isinstance(ann, type) and issubclass(ann, BaseModel):
            out[name] = _fill(ann)
            continue
        if get_origin(ann) is type(None):
            out[name] = None
            continue
        args = get_args(ann)
        if type(None) in args:
            out[name] = None
            continue
        if args and all(a is str for a in args):
            out[name] = args[0]
            continue
        out[name] = _scalar(ann)
    return out


def main() -> None:
    out_path = ROOT.parent / "tests" / "fixtures" / "electrical-takeoff" / "worker-result-null-filled.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet = _fill(WorkerSheet)
    sheet.update(
        {
            "sheetKey": "p1",
            "fileId": "f1",
            "name": "n",
            "kind": "pdf_page",
            "index": 0,
            "widthPx": 100,
            "heightPx": 100,
            "scale": {**_fill(SheetScale), "source": "none", "verified": False, "ratio": None, "metersPerPreviewPx": None, "note": None},
            "analyzed": "full",
            "xrefsMissing": [{"name": "x", "path": None}],
        }
    )
    det = _fill(WorkerDetection)
    det.update(
        {
            "id": "p1#1",
            "sheetKey": "p1",
            "fileId": "f1",
            "source": "pdf",
            "x": 1,
            "y": 2,
            "w": 1,
            "h": 1,
            "signature": "sig",
            "signatureKind": "pdf-shape",
            "rawClass": "L1",
            "classifiedBy": "none",
            "confidence": "none",
            "typeKey": None,
            "legendKey": None,
            "angleDeg": None,
            "native": None,
        }
    )
    leg = _fill(WorkerLegendEntry)
    leg.update(
        {
            "key": "L1",
            "fileId": "f1",
            "signature": "sig",
            "signatureKind": "pdf-shape",
            "decodedBy": None,
            "textBox": None,
            "previewArtifact": None,
            "typeKey": None,
            "confidence": None,
            "count": None,
        }
    )
    body = _fill(WorkerResult)
    body.update(
        {
            "contractVersion": 2,
            "jobId": "null-fuzz",
            "status": "succeeded",
            "startedAtIso": "2026-01-01T00:00:00.000Z",
            "finishedAtIso": "2026-01-01T00:00:01.000Z",
            "sheets": [sheet],
            "detections": [det],
            "legend": [leg],
            "linear": [_fill(WorkerLinear) | {"id": "l1", "sheetKey": "p1", "fileId": "f1", "points": [[0, 0], [1, 1]], "lengthPreviewPx": 1.0, "lengthMeters": None, "scaleVerified": False, "typeKey": None, "layer": None}],
            "warnings": [{"code": "x", "severity": "warning", "message": "m", "fileId": None, "sheetKey": None}],
            "errors": [_fill(WorkerError) | {"code": "e", "message": "m", "fileId": None, "sheetKey": None}],
            "stats": {"n": 1.0},
            "engineVersions": {"engine": "0"},
        }
    )
    wire = json.dumps(body, ensure_ascii=False, indent=2)
    out_path.write_text(wire, encoding="utf-8")
    WorkerResult.model_validate(json.loads(wire))
    print(out_path)


if __name__ == "__main__":
    main()