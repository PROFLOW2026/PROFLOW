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


MASK_SIZE = 64
"""Min ink pixels on the 64×64 symbol mask; below this is vector scrap / line fragment."""
MIN_SYMBOL_MASK_INK = 48
"""Min bounding-box extent (PDF pt); smaller fragments are not emitted as devices."""
MIN_SYMBOL_EXTENT_PT = 2.5


def mask_ink_pixel_count(mask: np.ndarray) -> int:
    if mask is None or mask.size == 0:
        return 0
    return int(np.count_nonzero(mask > 0))


def is_drawing_noise_mask(
    mask: np.ndarray,
    extent_w: float,
    extent_h: float,
    *,
    ink_min: int = MIN_SYMBOL_MASK_INK,
    extent_min: float = MIN_SYMBOL_EXTENT_PT,
) -> bool:
    """True when the packed mask is nearly empty or the bbox is smaller than a symbol."""
    if max(extent_w, extent_h) < extent_min:
        return True
    if mask is None:
        return False
    if mask.shape[0] != MASK_SIZE or mask.shape[1] != MASK_SIZE:
        # Non-standard masks: only extent gate applies
        return max(extent_w, extent_h) < extent_min
    return mask_ink_pixel_count(mask) < ink_min


def dominant_hex(colors: dict) -> str | None:
    if not colors:
        return None
    dom = max(colors.items(), key=lambda kv: kv[1])[0]
    if isinstance(dom, tuple) and len(dom) >= 3:
        r, g, b = (int(round(255 * dom[0])), int(round(255 * dom[1])), int(round(255 * dom[2])))
        return "#%02x%02x%02x" % (r, g, b)
    return None