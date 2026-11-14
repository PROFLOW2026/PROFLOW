from __future__ import annotations

from pathlib import Path

from takeoff_worker.data.catalog_loader import load_default_catalog
from takeoff_worker.models import JobOptions, WorkerCallback, WorkerFile, WorkerJobRequest
from takeoff_worker.pipeline import run_job
from tests.pipeline.test_pipeline import FakePdfEngine


def test_use_ai_without_env_emits_ai_unavailable(tmp_path: Path):
    def dl(url: str, dest: Path) -> Path:
        dest.write_bytes(b"%PDF-1.4\n")
        return dest

    req = WorkerJobRequest(
        jobId="ai",
        files=[WorkerFile(fileId="ok", name="a.pdf", kind="pdf", sizeBytes=10, downloadUrl="x")],
        catalog=load_default_catalog(),
        callback=WorkerCallback(progressUrl="x", resultUrl="x", artifactUrl="x", token="x"),
        options=JobOptions(useAi=True),
    )
    res = run_job(req, tmp_path, lambda *_a, **_k: None, lambda *_a, **_k: None, dl, pdf_engine=FakePdfEngine())
    assert any(w.code == "ai_unavailable" for w in res.warnings)