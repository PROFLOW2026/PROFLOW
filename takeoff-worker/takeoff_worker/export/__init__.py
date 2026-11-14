"""PDF exports (Agent 1)."""
from __future__ import annotations

import json
from typing import Any, Literal, Optional

from takeoff_worker.models import ExportAnnotatedPdfRequest, ExportBoqPdfRequest

from .annotated_pdf import export_annotated_pdf
from .boq_pdf import export_boq_pdf

__all__ = ["export_annotated_pdf", "export_boq_pdf", "export_for_request", "annotated_pdf", "boq_pdf"]


def export_for_request(
    kind: Literal["annotated-pdf", "boq-pdf"],
    payload: dict[str, Any] | ExportAnnotatedPdfRequest | ExportBoqPdfRequest,
    *,
    source_path: Optional[str] = None,
) -> bytes:
    """Thin wrapper for Agent 5 server: parse JSON dict or pydantic models."""
    if kind == "annotated-pdf":
        req = payload if isinstance(payload, ExportAnnotatedPdfRequest) else ExportAnnotatedPdfRequest(**payload)
        if not source_path:
            raise ValueError("export_for_request(annotated-pdf) requires source_path to the plan PDF")
        return export_annotated_pdf(req, source_path)
    req = payload if isinstance(payload, ExportBoqPdfRequest) else ExportBoqPdfRequest(**payload)
    return export_boq_pdf(req)


class _AnnotatedModule:
    @staticmethod
    def render(body: bytes) -> bytes:
        if not body:
            return export_boq_pdf(
                ExportBoqPdfRequest(
                    title="stub",
                    approved=False,
                    generatedAtIso="1970-01-01T00:00:00Z",
                    limitations=["stub"],
                    lines=[],
                )
            )
        data = json.loads(body.decode("utf-8"))
        path = data.pop("source_path", None)
        req = ExportAnnotatedPdfRequest(**data)
        if not path:
            raise ValueError("source_path required in annotated export JSON body")
        return export_annotated_pdf(req, path)


class _BoqModule:
    @staticmethod
    def render(body: bytes | dict) -> bytes:
        if isinstance(body, bytes):
            if not body:
                return export_boq_pdf(
                    ExportBoqPdfRequest(
                        title="stub",
                        approved=False,
                        generatedAtIso="1970-01-01T00:00:00Z",
                        limitations=["stub"],
                        lines=[],
                    )
                )
            data = json.loads(body.decode("utf-8"))
        else:
            data = body
        return export_boq_pdf(ExportBoqPdfRequest(**data))


# Server (Agent 5) currently: `from takeoff_worker.export import annotated_pdf; annotated_pdf.render(...)`
annotated_pdf = _AnnotatedModule()
boq_pdf = _BoqModule()