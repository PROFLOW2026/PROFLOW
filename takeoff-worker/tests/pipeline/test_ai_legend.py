from __future__ import annotations

import io
import json
import os
from unittest.mock import patch

from takeoff_worker.ai.legend_reader import OpenAiCompatibleReader, get_legend_reader
from takeoff_worker.ai.legend_reader import NullReader


def test_ai_unavailable_without_env():
    old = {k: os.environ.pop(k, None) for k in ("TAKEOFF_AI_BASE_URL", "TAKEOFF_AI_API_KEY", "TAKEOFF_AI_MODEL")}
    try:
        reader = get_legend_reader(True)
        assert isinstance(reader, NullReader)
        assert reader.read(b"png", "שקע") == []
    finally:
        for k, v in old.items():
            if v is not None:
                os.environ[k] = v


def test_ai_provider_parses_http_style_response():
    payload = json.dumps(
        {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            [
                                {
                                    "rowIndex": 0,
                                    "text": "שקע",
                                    "suggestedTypeKey": "power.socket.single",
                                    "confidence": "medium",
                                }
                            ]
                        )
                    }
                }
            ]
        }
    ).encode("utf-8")
    reader = OpenAiCompatibleReader("http://127.0.0.1:9", "test-key", "m")
    with patch("urllib.request.urlopen") as urlopen:
        urlopen.return_value.__enter__.return_value.read.return_value = payload
        rows = reader.read(b"\x89PNG", "שקע")
    assert rows[0].suggested_type_key == "power.socket.single"