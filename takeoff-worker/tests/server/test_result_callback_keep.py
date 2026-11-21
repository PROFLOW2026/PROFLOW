from __future__ import annotations

import os
import sys
import time
import urllib.error
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("TAKEOFF_WORKER_SECRET", "unit-test-takeoff-worker-secret!!!!")

from takeoff_worker.models import WorkerResult  # noqa: E402
from takeoff_worker.server import _jobs, app  # noqa: E402


def test_result_callback_401_keeps_pipeline_result(monkeypatch) -> None:
    secret = os.environ["TAKEOFF_WORKER_SECRET"]

    def fake_run_job(body, workdir, progress, put_artifact, download):  # noqa: ANN001
        return WorkerResult(
            contractVersion=2,
            jobId=body.jobId,
            status="succeeded",
            startedAtIso="2026-11-21T10:00:00+00:00",
            finishedAtIso="2026-11-21T10:02:00+00:00",
        )

    def boom(*_args, **_kwargs):  # noqa: ANN001
        raise urllib.error.HTTPError("http://example.test/result", 401, "Unauthorized", hdrs=None, fp=None)

    monkeypatch.setattr("takeoff_worker.pipeline.run_job", fake_run_job)
    monkeypatch.setattr("takeoff_worker.server._post_json", boom)

    body = {
        "contractVersion": 2,
        "jobId": "job-keep-result",
        "plannerKey": "unknown",
        "files": [],
        "callback": {
            "progressUrl": "http://example.test/progress",
            "resultUrl": "http://example.test/result",
            "artifactUrl": "http://example.test/artifact",
            "token": "token",
        },
    }
    client = TestClient(app)
    res = client.post("/v1/jobs", headers={"x-takeoff-secret": secret}, json=body)
    assert res.status_code == 202

    deadline = time.time() + 5
    row = None
    while time.time() < deadline:
        row = _jobs.get("job-keep-result")
        if row and row.get("callbackStatus") == "failed" and row.get("result"):
            break
        time.sleep(0.05)

    assert row is not None
    assert row["status"] == "succeeded"
    assert row["callbackStatus"] == "failed"
    assert row["result"]["status"] == "succeeded"
    assert row["result"]["jobId"] == "job-keep-result"
