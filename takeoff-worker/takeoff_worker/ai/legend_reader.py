"""Legend-only AI adapters (OFF by default)."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Protocol

from ..models import Confidence

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class LegendAiRow:
    row_index: int
    text: str
    suggested_type_key: str | None
    confidence: Confidence


class LegendReader(Protocol):
    def read(self, crop_png: bytes, raw_text: str) -> list[LegendAiRow]: ...


class NullReader:
    def read(self, crop_png: bytes, raw_text: str) -> list[LegendAiRow]:
        return []


class MockReader:
    """Deterministic test reader — never calls the network."""

    def read(self, crop_png: bytes, raw_text: str) -> list[LegendAiRow]:
        lines = [ln.strip() for ln in raw_text.split("|") if ln.strip()]
        rows: list[LegendAiRow] = []
        for i, ln in enumerate(lines):
            key = None
            conf: Confidence = "low"
            if "שקע" in ln:
                key = "power.socket.single"
                conf = "medium"
            if "גלאי עשן" in ln:
                key = "fire.smoke_detector"
                conf = "medium"
            rows.append(LegendAiRow(i, ln, key, conf))
        return rows


_CACHE: dict[str, list[LegendAiRow]] = {}


class OpenAiCompatibleReader:
    def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def read(self, crop_png: bytes, raw_text: str) -> list[LegendAiRow]:
        digest = hashlib.sha256(crop_png + raw_text.encode("utf-8")).hexdigest()
        if digest in _CACHE:
            return _CACHE[digest]
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Parse Hebrew electrical legend rows. Return JSON array "
                        '[{"rowIndex":0,"text":"...","suggestedTypeKey":"power.socket.single"|null,"confidence":"low"|"medium"}]. '
                        f"OCR hint: {raw_text[:2000]}"
                    ),
                }
            ],
            "temperature": 0,
        }
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            log.warning("AI legend reader failed: %s", type(exc).__name__)
            return []
        try:
            content = body["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            rows = [
                LegendAiRow(
                    int(r.get("rowIndex", i)),
                    str(r.get("text", "")),
                    r.get("suggestedTypeKey"),
                    r.get("confidence", "low"),
                )
                for i, r in enumerate(parsed)
            ]
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            rows = []
        _CACHE[digest] = rows
        return rows


def get_legend_reader(use_ai: bool, *, mock: bool = False) -> LegendReader:
    if mock:
        return MockReader()
    if not use_ai:
        return NullReader()
    base = os.environ.get("TAKEOFF_AI_BASE_URL", "").strip()
    key = os.environ.get("TAKEOFF_AI_API_KEY", "").strip()
    model = os.environ.get("TAKEOFF_AI_MODEL", "gpt-4o-mini").strip()
    if base and key:
        return OpenAiCompatibleReader(base, key, model)
    return NullReader()