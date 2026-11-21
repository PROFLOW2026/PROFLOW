from __future__ import annotations

import logging
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from takeoff_worker.callback_diag import format_callback_401, sanitize_callback_body
from takeoff_worker.server import _post_json, _post_multipart


def test_sanitize_redacts_bearer_and_skips_binary() -> None:
    assert sanitize_callback_body(b'{"error":"ok"}', "application/json") == '{"error":"ok"}'
    assert sanitize_callback_body(b"Authorization: Bearer abc.def", "text/plain") == "<redacted>"
    assert sanitize_callback_body(b"cookie=abc", "text/html") == "<redacted>"
    assert sanitize_callback_body(b"\x00\x01\x02", "application/octet-stream").startswith("<binary")


def test_format_callback_401_omits_sensitive_headers() -> None:
    line = format_callback_401(
        job_id="job-1",
        kind="progress",
        status=401,
        headers={
            "content-type": "text/plain",
            "x-vercel-id": "fra1::abc",
            "x-vercel-mitigate": "challenge",
            "authorization": "Bearer secret-token",
            "set-cookie": "sid=1",
        },
        body=b"Authentication Required",
        at_iso="2026-11-21T01:00:00+00:00",
    )
    assert "jobId=job-1" in line
    assert "kind=progress" in line
    assert "status=401" in line
    assert "contentType=text/plain" in line
    assert "vercelId=fra1::abc" in line
    assert "mitigate=challenge" in line
    assert "Authentication Required" in line
    assert "secret-token" not in line
    assert "sid=1" not in line
    assert "Bearer" not in line


class _AuthCounter:
    def __init__(self) -> None:
        self.requests = 0
        self.saw_authorization = False


def _start_401_server(counter: _AuthCounter, body: bytes, extra: dict[str, str]) -> tuple[HTTPServer, str]:
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            counter.requests += 1
            if self.headers.get("Authorization", "").startswith("Bearer "):
                counter.saw_authorization = True
            length = int(self.headers.get("Content-Length") or 0)
            if length:
                self.rfile.read(length)
            self.send_response(401)
            self.send_header("Content-Type", extra.get("content-type", "text/plain"))
            self.send_header("x-vercel-id", extra.get("x-vercel-id", "test-id"))
            if extra.get("x-vercel-mitigate"):
                self.send_header("x-vercel-mitigate", extra["x-vercel-mitigate"])
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt: str, *args: object) -> None:
            return

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    return server, f"http://{host}:{port}/callback"


def test_post_json_401_logs_safe_fields_and_keeps_three_retries(caplog: pytest.LogCaptureFixture) -> None:
    counter = _AuthCounter()
    server, url = _start_401_server(
        counter,
        b"Authentication Required",
        {"content-type": "text/plain", "x-vercel-id": "fra1::diag", "x-vercel-mitigate": "bot"},
    )
    caplog.set_level(logging.WARNING, logger="takeoff_worker.server")
    try:
        with pytest.raises(Exception):
            _post_json(url, "super-secret-bearer", {"jobId": "job-diag", "stage": "extract", "percent": 11}, job_id="job-diag", kind="progress")
    finally:
        server.shutdown()
    assert counter.requests == 3
    assert counter.saw_authorization is True
    joined = "\n".join(r.getMessage() for r in caplog.records)
    assert joined.count("callback 401") == 3
    assert "kind=progress" in joined
    assert "jobId=job-diag" in joined
    assert "vercelId=fra1::diag" in joined
    assert "mitigate=bot" in joined
    assert "super-secret-bearer" not in joined
    assert "Authorization" not in joined


def test_post_json_204_does_not_log_401(caplog: pytest.LogCaptureFixture) -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("Content-Length") or 0)
            if length:
                self.rfile.read(length)
            self.send_response(204)
            self.end_headers()

        def log_message(self, fmt: str, *args: object) -> None:
            return

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    caplog.set_level(logging.WARNING, logger="takeoff_worker.server")
    try:
        host, port = server.server_address
        _post_json(f"http://{host}:{port}/ok", "secret", {"jobId": "job-ok"}, job_id="job-ok", kind="result")
    finally:
        server.shutdown()
    assert not any("callback 401" in r.getMessage() for r in caplog.records)


def test_post_multipart_401_logs_artifact_kind(caplog: pytest.LogCaptureFixture) -> None:
    counter = _AuthCounter()
    server, url = _start_401_server(counter, b"nope", {"content-type": "text/plain", "x-vercel-id": "art-1"})
    caplog.set_level(logging.WARNING, logger="takeoff_worker.server")
    try:
        with pytest.raises(Exception):
            _post_multipart(url, "artifact-secret", "preview.png", "image/png", b"png", job_id="job-art", kind="artifact")
    finally:
        server.shutdown()
    assert counter.requests == 1
    joined = "\n".join(r.getMessage() for r in caplog.records)
    assert "kind=artifact" in joined
    assert "jobId=job-art" in joined
    assert "artifact-secret" not in joined
