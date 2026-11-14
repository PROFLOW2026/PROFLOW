"""Configurable layer / block heuristics for electrical symbol detection."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# Layers that typically hold electrical symbols (prefix / substring / regex).
DEFAULT_SYMBOL_LAYER_PATTERNS: list[str] = [
    r"(?i)^S-(LIGHT|ELECTRIC|SW|PIRIM|SAFETY|IEC|BEZEQ|LINE|GND|MEDIA|LOW)",
    r"(?i)LIGHT",
    r"תאורה",
    r"חשמל",
    r"תקשורת",
    r"גילוי",
    r"חירום",
    r"בטחון",
    r"שקע",
    r"שקעים",
    r"לוח",
    r"מדיה",
    r"תעלה",
    r"מפסק",
    r"(?i)FIRE",
    r"(?i)DATA",
    r"(?i)EL-",
]

DEFAULT_EXCLUDE_LAYER_PATTERNS: list[str] = [
    r"(?i)^(0|DEFPOINTS)$",
    r"(?i)DIM",
    r"(?i)ANNO",
    r"(?i)TEXT",
    r"(?i)TITLE",
    r"(?i)FRAME",
    r"(?i)GRID",
    r"(?i)HATCH",
    r"(?i)ARCH",
    r"(?i)AD-",
    r"(?i)WALL",
    r"(?i)XREF",
    r"טקסט",
    r"כותרת",
    r"מסגרת",
]

DEFAULT_LINEAR_LAYER_PATTERNS: list[str] = [
    r"(?i)S-LINE",
    r"(?i)TRAY",
    r"(?i)CONDUIT",
    r"(?i)CABLE",
    r"תעלה",
    r"מגש",
    r"צנרת",
]

DEFAULT_EXCLUDE_BLOCK_PATTERNS: list[str] = [
    r"(?i)^A\$",
    r"(?i)^TC",
    r"(?i)^TAG",
    r"(?i)^DETAIL",
    r"(?i)^NORTH",
    r"(?i)^SCALE",
    r"(?i)^TITLE",
]


PANEL_LAYOUT_RE = re.compile(r"(?i)לוח|panel|^boards$")


@dataclass
class LayerRules:
    symbol_patterns: list[str] = field(default_factory=lambda: list(DEFAULT_SYMBOL_LAYER_PATTERNS))
    exclude_layer_patterns: list[str] = field(default_factory=lambda: list(DEFAULT_EXCLUDE_LAYER_PATTERNS))
    linear_patterns: list[str] = field(default_factory=lambda: list(DEFAULT_LINEAR_LAYER_PATTERNS))
    exclude_block_patterns: list[str] = field(default_factory=lambda: list(DEFAULT_EXCLUDE_BLOCK_PATTERNS))

    def __post_init__(self) -> None:
        self._sym = [re.compile(p) for p in self.symbol_patterns]
        self._excl = [re.compile(p) for p in self.exclude_layer_patterns]
        self._lin = [re.compile(p) for p in self.linear_patterns]
        self._blx = [re.compile(p) for p in self.exclude_block_patterns]

    def is_panel_layout(self, layout_name: str) -> bool:
        return bool(PANEL_LAYOUT_RE.search(layout_name or ""))

    def is_symbol_layer(self, layer: str, *, layout_name: str = "") -> bool:
        if layer == "0" and self.is_panel_layout(layout_name):
            return True
        effective = layer.split("|", 1)[-1] if "|" in layer else layer
        for rx in self._excl:
            if rx.search(layer) and not (layer == "0" and self.is_panel_layout(layout_name)):
                return False
        if any(rx.search(effective) for rx in self._sym) or any(rx.search(layer) for rx in self._sym):
            return True
        return False

    def is_linear_layer(self, layer: str) -> bool:
        effective = layer.split("|", 1)[-1] if "|" in layer else layer
        if any(rx.search(layer) for rx in self._excl):
            return False
        return any(rx.search(effective) for rx in self._lin) or any(rx.search(layer) for rx in self._lin)

    def is_excluded_block(self, name: str) -> bool:
        return any(rx.search(name) for rx in self._blx)


DEFAULT_RULES = LayerRules()