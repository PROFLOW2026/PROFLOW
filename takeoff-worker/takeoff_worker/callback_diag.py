"""Safe, redacted diagnostics for takeoff callback HTTP 401s. Never logs secrets."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Mapping

_UNSAFE_BODY = re.compile(
    r"authorization|bearer\s+|cookie|set-cookie|secret|api[_-]?key|x-takeoff-secret|\btoken\b",
    re.IGNORECASE,
)
_SAFE_BODY_TYPES = ("json", "html", "text", "xml", "javascript")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sanitize_callback_body(raw: bytes, content_type: str | None) -> str:
    if not raw:
        return ""
    ctype = (content_type or "").lower()
    if ctype and not any(part in ctype for part in _SAFE_BODY_TYPES):
        return f"<binary len={len(raw)}>"
    text = raw.decode("utf-8", "replace")[:180]
    if _UNSAFE_BODY.search(text):
        return "<redacted>"
    return " ".join(text.split())


def format_callback_401(
    *,
    job_id: str,
    kind: str,
    status: int,
    headers: Mapping[str, str] | None,
    body: bytes = b"",
    at_iso: str | None = None,
) -> str:
    hdrs = headers or {}
    content_type = hdrs.get("content-type") or hdrs.get("Content-Type") or ""
    vercel_id = hdrs.get("x-vercel-id") or hdrs.get("X-Vercel-Id") or ""
    mitigate = hdrs.get("x-vercel-mitigate") or hdrs.get("X-Vercel-Mitigate") or ""
    snippet = sanitize_callback_body(body, content_type)
    return (
        "callback 401"
        f" jobId={job_id}"
        f" kind={kind}"
        f" at={at_iso or utc_now_iso()}"
        f" status={status}"
        f" contentType={content_type or '-'}"
        f" vercelId={vercel_id or '-'}"
        f" mitigate={mitigate or '-'}"
        f" body={snippet or '-'}"
    )
