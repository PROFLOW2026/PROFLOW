from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pytest

from takeoff_worker.data.catalog_loader import load_default_catalog
from takeoff_worker.engine_api import EngineOutput, ProgressFn
from takeoff_worker.models import (
    JobOptions,
    SymbolLibraryEntry,
    WorkerCallback,
    WorkerDetection,
    WorkerFile,
    WorkerJobRequest,
    WorkerSheet,
    WorkerWarning,
)
from takeoff_worker.pipeline import detect_file_kind, run_job


@dataclass
class FakePdfEngine:
    fail: bool = False

    def analyze(self, path, file_id, *, options, library, extra_templates=None, sheet_keys=None, progress=None) -> EngineOutput:
        if self.fail:
            raise RuntimeError("pdf failed")
        progress = progress or (lambda *a, **k: None)
        progress("extract", 50, "fake pdf")
        return EngineOutput(
            sheets=[
                WorkerSheet(
                    sheetKey="p1",
                    fileId=file_id,
                    name="plan",
                    kind="pdf_page",
                    index=0,
                    widthPx=800,
                    heightPx=600,
                )
            ],
            detections=[
                WorkerDetection(
                    id="p1#1",
                    sheetKey="p1",
                    fileId=file_id,
                    source="pdf",
                    x=10,
                    y=10,
                    signature="shape:x",
                    signatureKind="pdf-shape",
                    rawClass="L1",
                    typeKey=None,
                    classifiedBy="none",
                    confidence="none",
                )
            ],
            versions={"pdf": "fake"},
        )


@dataclass
class FakeDwgEngine:
    def analyze(self, path, file_id, *, kind, xref_paths, options, library, sheet_keys=None, progress=None) -> EngineOutput:
        return EngineOutput(
            detections=[
                WorkerDetection(
                    id="d1#1",
                    sheetKey="p1",
                    fileId=file_id,
                    source="dwg",
                    x=20,
                    y=20,
                    signature="block:s1",
                    signatureKind="dwg-block",
                    rawClass="S1",
                    blockName="S1",
                    typeKey=None,
                    classifiedBy="none",
                    confidence="none",
                )
            ],
            versions={"dwg": "fake"},
        )


def test_detect_magic_bytes(tmp_path: Path):
    p = tmp_path / "a.pdf"
    p.write_bytes(b"%PDF-1.4\n")
    assert detect_file_kind(p) == "pdf"


def test_pipeline_isolates_file_failure(tmp_path: Path):
    def dl(url: str, dest: Path) -> Path:
        dest.write_bytes(b"%PDF-1.4\ncontent")
        return dest

    class SelectivePdf(FakePdfEngine):
        def analyze(self, path, file_id, *, options, library, extra_templates=None, sheet_keys=None, progress=None):
            if file_id == "bad":
                raise RuntimeError("pdf failed")
            return super().analyze(path, file_id, options=options, library=library, extra_templates=extra_templates, sheet_keys=sheet_keys, progress=progress)

    req = WorkerJobRequest(
        jobId="j1",
        files=[
            WorkerFile(fileId="ok", name="a.pdf", kind="pdf", sizeBytes=10, downloadUrl="x"),
            WorkerFile(fileId="bad", name="b.pdf", kind="pdf", sizeBytes=10, downloadUrl="y"),
        ],
        catalog=load_default_catalog(),
        callback=WorkerCallback(progressUrl="p", resultUrl="r", artifactUrl="a", token="t"),
        options=JobOptions(),
    )

    res = run_job(
        req,
        tmp_path / "work",
        lambda *_a, **_k: None,
        lambda *_a, **_k: None,
        dl,
        pdf_engine=SelectivePdf(),
        dwg_engine=FakeDwgEngine(),
    )
    assert res.status == "partial"
    assert any(e.fileId == "bad" for e in res.errors)
    assert len(res.detections) >= 1


def test_merge_failure_keeps_detections(tmp_path: Path, monkeypatch):
    def dl(url: str, dest: Path) -> Path:
        dest.write_bytes(b"%PDF-1.4\ncontent")
        return dest

    def boom(*_a, **_k):
        raise IndexError("simulated merge")

    monkeypatch.setattr("takeoff_worker.pipeline.merge_pdf_dwg_pair", boom)

    from takeoff_worker.models import Pairing, SheetScale

    class DwgWithSheet(FakeDwgEngine):
        def analyze(self, path, file_id, *, kind, xref_paths, options, library, sheet_keys=None, progress=None):
            out = super().analyze(path, file_id, kind=kind, xref_paths=xref_paths, options=options, library=library, sheet_keys=sheet_keys, progress=progress)
            out.sheets = [
                WorkerSheet(
                    sheetKey="p1",
                    fileId=file_id,
                    name="plan",
                    kind="dwg_layout",
                    index=0,
                    widthPx=800,
                    heightPx=600,
                    scale=SheetScale(verified=True, source="none"),
                )
            ]
            return out

    req = WorkerJobRequest(
        jobId="j-merge",
        files=[
            WorkerFile(fileId="pdf", name="plan.pdf", kind="pdf", sizeBytes=10, downloadUrl="x"),
            WorkerFile(fileId="dwg", name="plan.dwg", kind="dwg", sizeBytes=10, downloadUrl="y"),
        ],
        pairing=[Pairing(pdfFileId="pdf", dwgFileId="dwg")],
        catalog=load_default_catalog(),
        callback=WorkerCallback(progressUrl="p", resultUrl="r", artifactUrl="a", token="t"),
        options=JobOptions(),
    )
    res = run_job(
        req,
        tmp_path,
        lambda *_a, **_k: None,
        lambda *_a, **_k: None,
        dl,
        pdf_engine=FakePdfEngine(),
        dwg_engine=DwgWithSheet(),
    )
    assert res.status != "failed"
    assert any(w.code == "merge_failed" for w in res.warnings)
    assert len(res.detections) >= 2


def test_ai_disabled_by_default():
    from takeoff_worker.ai.legend_reader import NullReader, get_legend_reader

    assert isinstance(get_legend_reader(False), NullReader)