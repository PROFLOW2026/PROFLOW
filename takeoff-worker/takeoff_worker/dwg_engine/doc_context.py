"""Parsed DXF document — single load, reused across sheets."""
from __future__ import annotations

import math
import time
from collections import defaultdict

import ezdxf
from ezdxf.entities import Insert

from .blocks import is_xref_block, resolve_block_name
from .geometry import block_bbox_center, block_polys, normalize_segments
from .rules import LayerRules


INSUNITS_TO_METERS = {
    0: None,
    1: 0.0254,  # inches
    2: 0.3048,  # feet
    4: 0.001,  # mm
    5: 0.01,  # cm
    6: 1.0,  # m
}


class DocContext:
    def __init__(self, path: str, rules: LayerRules | None = None):
        t0 = time.perf_counter()
        self.path = path
        self.rules = rules or LayerRules()
        self.doc = ezdxf.readfile(path)
        self.load_secs = time.perf_counter() - t0
        self._center_cache: dict[str, tuple[float, float]] = {}
        self._seg_cache: dict[str, list] = {}
        self.off_layers = {
            l.dxf.name for l in self.doc.layers if l.is_off() or l.is_frozen()
        }
        self.inserts = [e for e in self.doc.modelspace() if e.dxftype() == "INSERT"]
        ins = int(self.doc.header.get("$INSUNITS", 0))
        self.meters_per_unit = INSUNITS_TO_METERS.get(ins)
        self.xrefs = self._list_xrefs()

    def block_center(self, name: str) -> tuple[float, float]:
        if name not in self._center_cache:
            b = self.doc.blocks.get(name)
            self._center_cache[name] = block_bbox_center(b) if b else (0.0, 0.0)
        return self._center_cache[name]

    def block_segments(self, name: str):
        if name not in self._seg_cache:
            b = self.doc.blocks.get(name)
            self._seg_cache[name] = normalize_segments(block_polys(b)) if b else []
        return self._seg_cache[name]

    def insert_center(self, ins: Insert) -> tuple[float, float]:
        x, y = ins.dxf.insert.x, ins.dxf.insert.y
        cc = self.block_center(ins.dxf.name)
        th = math.radians(ins.dxf.get("rotation", 0.0))
        sx = float(ins.dxf.get("xscale", 1.0) or 1.0)
        sy = float(ins.dxf.get("yscale", 1.0) or 1.0)
        ccx = x + (cc[0] * sx) * math.cos(th) - (cc[1] * sy) * math.sin(th)
        ccy = y + (cc[0] * sx) * math.sin(th) + (cc[1] * sy) * math.cos(th)
        return ccx, ccy

    def _list_xrefs(self) -> list[dict]:
        counts = defaultdict(int)
        for e in self.inserts:
            counts[e.dxf.name] += 1
        out = []
        for b in self.doc.blocks:
            if not is_xref_block(self.doc, b.name):
                continue
            path = ""
            try:
                path = str(getattr(b.block.dxf, "xref_path", "") or "")
            except Exception:
                pass
            out.append(
                {
                    "name": b.name,
                    "path": path,
                    "inserted": counts.get(b.name, 0),
                }
            )
        return out

    def layer_visible(self, layer: str, frozen: set[str]) -> bool:
        return layer not in self.off_layers and layer not in frozen

    def is_symbol_insert(self, ins: Insert, *, layout_name: str = "") -> bool:
        if self.rules.is_excluded_block(ins.dxf.name):
            return False
        if is_xref_block(self.doc, ins.dxf.name):
            return False
        if ins.dxf.name.startswith("*Model"):
            return False
        return self.rules.is_symbol_layer(ins.dxf.layer, layout_name=layout_name)

    def resolved_name(self, insert_name: str) -> tuple[str, str, list[str]]:
        return resolve_block_name(self.doc, insert_name)