"""DXF layout viewport + plot hints for PDF/DWG geometric merge."""
from __future__ import annotations

from dataclasses import dataclass

import ezdxf
from ezdxf.math import Matrix44, Vec3

from ..dwg_engine.corpus_cache import ensure_dxf
from ..dwg_engine.doc_context import DocContext
from ..dwg_engine.viewport import pick_sheet_viewport, regions_for_layout


@dataclass(frozen=True)
class LayoutViewportMeta:
    layout_name: str
    vp_center_paper: tuple[float, float]
    vp_width: float
    vp_height: float
    model_cx: float
    model_cy: float
    model_hw: float
    model_hh: float
    plot_rotation: int
    model_to_paper: Matrix44 | None = None


def _viewport_entity(doc, layout_name: str, reg) -> object | None:
    lay = doc.layouts.get(layout_name)
    if lay is None:
        return None
    vps = list(lay.query("VIEWPORT"))
    best = None
    best_d = 1e18
    for v in vps:
        if v.dxf.view_height <= 0 or v.dxf.width <= 0:
            continue
        dw = abs(float(v.dxf.width) - reg.paper_width)
        dh = abs(float(v.dxf.height) - reg.paper_height)
        d = dw + dh
        if d < best_d:
            best_d = d
            best = v
    return best


def load_layout_meta(source_path: str, layout_name: str) -> LayoutViewportMeta | None:
    try:
        dxf_path, _, _ = ensure_dxf(source_path)
        doc = ezdxf.readfile(str(dxf_path))
        ctx = DocContext(str(dxf_path))
        regs = regions_for_layout(doc, layout_name)
        reg = pick_sheet_viewport(regs, ctx)
        if reg is None:
            return None
        vp = _viewport_entity(doc, layout_name, reg)
        if vp is None:
            return None
        rot = 0
        try:
            m2p = vp.get_transformation_matrix()
        except Exception:
            m2p = None
        return LayoutViewportMeta(
            layout_name=layout_name,
            vp_center_paper=(float(vp.dxf.center.x), float(vp.dxf.center.y)),
            vp_width=float(vp.dxf.width),
            vp_height=float(vp.dxf.height),
            model_cx=reg.cx,
            model_cy=reg.cy,
            model_hw=reg.hw,
            model_hh=reg.hh,
            plot_rotation=rot,
            model_to_paper=m2p,
        )
    except Exception:
        return None


def model_to_layout_paper(mx: float, my: float, meta: LayoutViewportMeta) -> tuple[float, float]:
    if meta.model_to_paper is not None:
        p = meta.model_to_paper.transform(Vec3(mx, my, 0))
        return float(p.x), float(p.y)
    u = (mx - (meta.model_cx - meta.model_hw)) / (2 * meta.model_hw)
    v = ((meta.model_cy + meta.model_hh) - my) / (2 * meta.model_hh)
    px = meta.vp_center_paper[0] - meta.vp_width / 2 + u * meta.vp_width
    py = meta.vp_center_paper[1] - meta.vp_height / 2 + v * meta.vp_height
    return px, py


def paper_to_pdf_pt(
    px: float,
    py: float,
    *,
    paper_w: float,
    paper_h: float,
    pdf_w_pt: float,
    pdf_h_pt: float,
    rotation_deg: int,
    mirror_y: bool = False,
) -> tuple[float, float]:
    """Map layout paper units into PDF page pt (plot box affine + optional 90° rotations)."""
    minx = miny = 0.0
    sx = pdf_w_pt / max(paper_w, 1e-6)
    sy = pdf_h_pt / max(paper_h, 1e-6)
    x = (px - minx) * sx
    y = (py - miny) * sy
    if mirror_y:
        y = pdf_h_pt - y
    r = rotation_deg % 360
    if r == 90:
        return y, pdf_w_pt - x
    if r == 180:
        return pdf_w_pt - x, pdf_h_pt - y
    if r == 270:
        return pdf_h_pt - y, x
    return x, y