"""64x64 mask encoding (contract parity with SymbolTemplate)."""
from __future__ import annotations

import base64
import hashlib

import numpy as np


def mask_to_b64(mask: np.ndarray, size: int = 64) -> str:
    assert mask.shape == (size, size)
    bits = (mask > 0).astype(np.uint8).flatten()
    packed = np.packbits(bits)
    return base64.b64encode(packed.tobytes()).decode("ascii")


def mask_signature(mask: np.ndarray) -> str:
    bits = (mask > 0).astype(np.uint8).tobytes()
    return "shape:" + hashlib.sha1(bits).hexdigest()


def dominant_hex(colors: dict) -> str | None:
    if not colors:
        return None
    dom = max(colors.items(), key=lambda kv: kv[1])[0]
    if isinstance(dom, tuple) and len(dom) >= 3:
        r, g, b = (int(round(255 * dom[0])), int(round(255 * dom[1])), int(round(255 * dom[2])))
        return "#%02x%02x%02x" % (r, g, b)
    return None