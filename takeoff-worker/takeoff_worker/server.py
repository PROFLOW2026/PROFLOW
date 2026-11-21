"""HTTP worker for electrical takeoff jobs (Agent 5). Stateless; callbacks to the app."""
from __future__ import annotations

import argparse
import concurrent.futures
import hmac
import json
import logging
import os
import time
import shutil
import subprocess
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
import uvicorn

from takeoff_worker.callback_diag import format_callback_401, utc_now_iso
from takeoff_worker.models import WorkerJobRequest, ExportAnnotatedPdfRequest, ExportBoqPdfRequest

log = logging.getLogger("takeoff_worker.server")
app = FastAPI(title="ProjectFlow Takeoff Worker", version="1")
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=int(os.getenv("TAKEOFF_WORKER_CONCURRENCY", "2")))
_jobs: dict[str, dict[str, Any]] = {}
_cancelled: set[str] = set()
_lock = threading.Lock()

def _worker_secret() -> str:
    return os.getenv("TAKEOFF_WORKER_SECRET", "").strip()


def _verify_secret(x_takeoff_secret: str | None = Header(default=None)) -> None:
    secret = _worker_secret()
    if not secret or not x_takeoff_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    if not hmac.compare_digest(x_takeoff_secret.encode(), secret.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


def _log_callback_401(exc: urllib.error.HTTPError, *, job_id: str, kind: str) -> None:
    body = b""
    try:
        body = exc.read(180)
    except Exception:
        body = b""
    log.warning(
        format_callback_401(
            job_id=job_id,
            kind=kind,
            status=int(exc.code),
            headers=exc.headers,
            body=body,
            at_iso=utc_now_iso(),
        )
    )


def _post_json(
    url: str,
    token: str,
    payload: dict[str, Any],
    *,
    job_id: str = "",
    kind: str = "json",
    attempts: int = 3,
) -> None:
    data = json.dumps(payload).encode("utf-8")
    last: urllib.error.URLError | None = None
    for attempt in range(max(1, attempts)):
        try:
            req = urllib.request.Request(
                url,
                data=data,
                method="POST",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                resp.read()
            return
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                _log_callback_401(exc, job_id=job_id, kind=kind)
            last = exc
            time.sleep(0.5 * (attempt + 1))
        except urllib.error.URLError as exc:
            last = exc
            time.sleep(0.5 * (attempt + 1))
    if last:
        raise last


def _post_multipart(
    url: str,
    token: str,
    name: str,
    mime: str,
    body: bytes,
    *,
    job_id: str = "",
    kind: str = "artifact",
) -> None:
    boundary = b"----takeoffboundary"
    parts = [
        b"--" + boundary + b'\r\nContent-Disposition: form-data; name="name"\r\n\r\n' + name.encode() + b"\r\n",
        b"--" + boundary + b'\r\nContent-Disposition: form-data; name="mimeType"\r\n\r\n' + mime.encode() + b"\r\n",
        b"--" + boundary + b'\r\nContent-Disposition: form-data; name="file"; filename="' + name.encode() + b'"\r\nContent-Type: ' + mime.encode() + b"\r\n\r\n" + body + b"\r\n",
        b"--" + boundary + b"--\r\n",
    ]
    payload = b"".join(parts)
    req = urllib.request.Request(url, data=payload, method="POST", headers={"Authorization": f"Bearer {token}", "Content-Type": f"multipart/form-data; boundary={boundary.decode()}"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            _log_callback_401(exc, job_id=job_id, kind=kind)
        raise


def _download(url: str, token: str, dest: Path) -> Path:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            expected = resp.headers.get("Content-Length")
            expected_n = int(expected) if expected and str(expected).isdigit() else None
            provider_id = resp.headers.get("X-Provider-File-Id") or ""
            written = 0
            with dest.open("wb") as out:
                while True:
                    chunk = resp.read(256 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    written += len(chunk)
            if expected_n is not None and written < expected_n:
                raise OSError("partial download")
            if provider_id:
                dest.with_name(dest.name + ".xid").write_text(provider_id, encoding="utf-8")
    except urllib.error.HTTPError as exc:
        if dest.is_file():
            dest.unlink()
        raise OSError(f"download failed: HTTP {exc.code} for {url.split('?', 1)[0]}") from exc
    except Exception:
        if dest.is_file():
            dest.unlink()
        marker = dest.with_name(dest.name + ".xid")
        if marker.is_file():
            marker.unlink()
        raise
    return dest


def _libredwg_status() -> str:
    exe = shutil.which("dwg2dxf") or os.getenv("LIBREDWG_DWG2DXF")
    if not exe:
        return "missing"
    try:
        proc = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=8)
    except (OSError, subprocess.TimeoutExpired):
        return "missing"
    err = proc.stderr or ""
    if proc.returncode == 127 or "cannot open shared" in err or "not found" in err.lower():
        return "missing"
    return "ok"


WORKER_PROTOCOL = 1
WORKER_CAPABILITIES = ["xrefFetch", "xrefRefs"]


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    engines: dict[str, str] = {}
    for mod in ("pypdfium2", "ezdxf"):
        try:
            __import__(mod)
            engines[mod] = "ok"
        except Exception:
            engines[mod] = "missing"
    engines["libredwg_cli"] = _libredwg_status()
    return {
        "status": "ok",
        "engines": engines,
        "protocol": WORKER_PROTOCOL,
        "capabilities": WORKER_CAPABILITIES,
        "workerBuild": os.getenv("TAKEOFF_WORKER_BUILD", "unknown"),
    }


@app.post("/v1/jobs", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(_verify_secret)])
async def create_job(body: WorkerJobRequest) -> JSONResponse:
    job_id = body.jobId
    with _lock:
        _jobs[job_id] = {"status": "queued", "body": body.model_dump()}

    def run() -> None:
        workdir = Path(tempfile.mkdtemp(prefix="takeoff_job_"))
        token = body.callback.token

        def progress(stage: str, pct: float, msg: str | None = None) -> None:
            if job_id in _cancelled:
                raise RuntimeError("cancelled")
            try:
                _post_json(
                    body.callback.progressUrl,
                    token,
                    {"jobId": job_id, "stage": stage, "percent": int(pct), "message": msg},
                    job_id=job_id,
                    kind="progress",
                )
            except urllib.error.URLError as exc:
                log.warning("progress post failed: %s", exc)

        def put_artifact(name: str, data: bytes, mime: str) -> None:
            try:
                _post_multipart(body.callback.artifactUrl, token, name, mime, data, job_id=job_id, kind="artifact")
            except urllib.error.URLError as exc:
                log.warning("artifact post failed: %s", exc)

        def download(url: str, dest: Path) -> Path:
            return _download(url, token, dest)

        try:
            with _lock:
                if job_id in _cancelled:
                    return
                _jobs[job_id]["status"] = "running"
            from takeoff_worker.pipeline import run_job

            result = run_job(body, workdir, progress, put_artifact, download)
            dumped = result.model_dump()
            with _lock:
                _jobs[job_id]["result"] = dumped
                _jobs[job_id]["status"] = result.status
            try:
                _post_json(
                    body.callback.resultUrl,
                    token,
                    dumped,
                    job_id=job_id,
                    kind="result",
                    attempts=6,
                )
                with _lock:
                    _jobs[job_id]["callbackStatus"] = "delivered"
            except Exception:
                log.exception("result callback failed %s", job_id)
                with _lock:
                    _jobs[job_id]["callbackStatus"] = "failed"
        except Exception:
            log.exception("job failed %s", job_id)
            with _lock:
                _jobs[job_id]["status"] = "failed"
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    _executor.submit(run)
    return JSONResponse({"workerJobId": job_id}, status_code=status.HTTP_202_ACCEPTED)


@app.get("/v1/jobs/{job_id}", dependencies=[Depends(_verify_secret)])
def job_state(job_id: str) -> dict[str, Any]:
    with _lock:
        row = _jobs.get(job_id)
    if not row:
        raise HTTPException(status_code=404)
    return row


@app.delete("/v1/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(_verify_secret)])
def cancel_job(job_id: str) -> Response:
    with _lock:
        _cancelled.add(job_id)
        _jobs.pop(job_id, None)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/v1/export/annotated-pdf", dependencies=[Depends(_verify_secret)])
async def export_annotated(request: Request) -> Response:
    try:
        from takeoff_worker.export import export_for_request

        data = await request.json()
        bearer = str(data.pop("jobBearer", "") or request.headers.get("Authorization", "").replace("Bearer ", ""))
        file = data.get("file") or {}
        download_url = file.get("downloadUrl")
        if not download_url:
            raise HTTPException(status_code=400, detail="file.downloadUrl required")
        workdir = Path(tempfile.mkdtemp(prefix="takeoff_export_"))
        try:
            local = workdir / (file.get("name") or "source.pdf")
            _download(download_url, bearer, local)
            req = ExportAnnotatedPdfRequest.model_validate(data)
            pdf = export_for_request("annotated-pdf", req, source_path=str(local))
            return Response(content=pdf, media_type="application/pdf")
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("annotated-pdf export failed")
        raise HTTPException(status_code=501, detail=str(exc)) from exc


@app.post("/v1/export/boq-pdf", dependencies=[Depends(_verify_secret)])
async def export_boq(request: Request) -> Response:
    try:
        from takeoff_worker.export import export_for_request

        data = await request.json()
        pdf = export_for_request("boq-pdf", data)
        return Response(content=pdf, media_type="application/pdf")
    except Exception as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    # log_config=None — avoids uvicorn ColorFormatter calling isatty() when stdout is redirected (E2E log files).
    uvicorn.run(app, host=args.host, port=args.port, log_level="info", log_config=None)


if __name__ == "__main__":
    main()