"""Paper-space viewports → model-space windows."""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class ViewportRegion:
    layout_name: str
    cx: float
    cy: float
    hw: float
    hh: float
    frozen_layers: set[str]
    twist_deg: float
    paper_width: float
    paper_height: float
    view_height: float

    def contains(self, x: float, y: float) -> bool:
        if self.twist_deg and abs(self.twist_deg) > 0.01:
            th = math.radians(self.twist_deg)
            dx, dy = x - self.cx, y - self.cy
            rx = dx * math.cos(-th) - dy * math.sin(-th)
            ry = dx * math.sin(-th) + dy * math.cos(-th)
            return abs(rx) <= self.hw and abs(ry) <= self.hh
        return abs(x - self.cx) <= self.hw and abs(y - self.cy) <= self.hh


def regions_for_layout(doc, layout_name: str, *, max_paper_w: float = 9000.0) -> list[ViewportRegion]:
    lay = doc.layouts.get(layout_name)
    if lay is None:
        return []
    out: list[ViewportRegion] = []
    for v in lay.query("VIEWPORT"):
        d = v.dxf
        if d.view_height <= 0 or d.width <= 0:
            continue
        # Skip full-paper frame viewports (title block frame).
        if d.width > max_paper_w and d.id in (0, 1) and getattr(d, "status", 0) == 0:
            continue
        hw = d.width / d.height * d.view_height / 2
        hh = d.view_height / 2
        twist = float(getattr(d, "twist_angle", 0) or 0)
        if hasattr(d, "view_twist"):
            twist = float(d.view_twist or twist)
        frozen = set(v.frozen_layers) if v.frozen_layers else set()
        out.append(
            ViewportRegion(
                layout_name=layout_name,
                cx=float(d.view_center_point.x),
                cy=float(d.view_center_point.y),
                hw=float(hw),
                hh=float(hh),
                frozen_layers=frozen,
                twist_deg=math.degrees(twist) if abs(twist) < math.pi * 2 else twist,
                paper_width=float(d.width),
                paper_height=float(d.height),
                view_height=float(d.view_height),
            )
        )
    return out


def _inserts_in_region(ctx, reg: ViewportRegion) -> int:
    n = 0
    for ins in ctx.inserts:
        try:
            cx, cy = ctx.insert_center(ins)
        except Exception:
            continue
        if reg.contains(cx, cy):
            n += 1
    return n


def pick_sheet_viewport(regs: list[ViewportRegion], ctx=None) -> ViewportRegion | None:
    """Primary model viewport: prefer the window that actually contains plan inserts."""
    if not regs:
        return None
    if ctx is not None and len(regs) > 1:
        scored = [(reg, _inserts_in_region(ctx, reg)) for reg in regs]
        best_reg, best_n = max(scored, key=lambda t: t[1])
        if best_n > 0:
            return best_reg
    return max(regs, key=lambda r: r.paper_width * r.paper_height)


def model_to_preview(
    x: float,
    y: float,
    reg: ViewportRegion,
    width_px: int,
    height_px: int,
) -> tuple[float, float]:
    hw, hh = reg.hw, reg.hh
    px = (x - (reg.cx - hw)) / (2 * hw) * width_px
    py = ((reg.cy + hh) - y) / (2 * hh) * height_px
    return px, py