"""Legend match plus a visual reading of the symbol in its plan context.

The legend match proposes a type. A visual reading may confirm it, reject it,
or supply an X2 note the text reader missed. It may not invent a device the
geometry did not already propose, and it never sees a plan coordinate.

The visual reader stays off until a provider is configured. With it off, every
legend proposal is kept exactly as the geometry produced it.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

VisualKind = Literal["light", "switch", "socket", "other"]
LegendKind = Literal["light", "switch", "socket"]


@dataclass(frozen=True)
class VisualReading:
    """What the symbol looks like, including the drawing around it.

    ``confidence`` is ``high`` only when the reading is sure. Anything else
    leaves the legend proposal unchanged. ``x2`` is a multiplier note read
    from the ink beside a socket, not a second symbol.
    """

    kind: VisualKind
    confidence: Literal["high", "low"]
    x2: bool = False


@dataclass(frozen=True)
class ContextDecision:
    keep: bool
    x2: bool


def visual_context_enabled() -> bool:
    """True only when a vision provider was explicitly turned on and keyed.

    The default is off. A missing key does not call a service.
    """
    if os.environ.get("TAKEOFF_AI_VISION", "").strip() != "1":
        return False
    return bool(os.environ.get("TAKEOFF_AI_BASE_URL", "").strip()) and bool(
        os.environ.get("TAKEOFF_AI_API_KEY", "").strip()
    )


def decide_with_context(
    legend: LegendKind | None,
    reading: VisualReading | None,
    *,
    geometry_candidate: bool,
) -> ContextDecision:
    """Combine one legend proposal with one visual reading.

    No reading keeps the proposal. A low-confidence reading never overrides it.
    A high-confidence ``other`` drops a proposal that is not a device.
    A high-confidence switch or socket or light is accepted only when the
    geometry already offered that candidate. An X2 note counts only on a socket
    that is kept.
    """
    if reading is None or reading.confidence != "high":
        return ContextDecision(keep=legend is not None, x2=False)
    if reading.kind == "other":
        return ContextDecision(keep=False, x2=False)
    if not geometry_candidate:
        return ContextDecision(keep=False, x2=False)
    if legend is not None and legend != reading.kind:
        return ContextDecision(keep=False, x2=False)
    kept = legend == reading.kind or legend is None
    return ContextDecision(keep=kept, x2=bool(reading.x2) and reading.kind == "socket" and kept)
