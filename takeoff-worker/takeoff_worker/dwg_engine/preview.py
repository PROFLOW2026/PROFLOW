"""Viewport preview raster (matplotlib Agg, best-effort)."""
from __future__ import annotations

import io
import logging

from .doc_context import DocContext
from .viewport import ViewportRegion

log = logging.getLogger(__name__)


def render_viewport_png(
    ctx: DocContext,
    reg: ViewportRegion,
    *,
    max_edge: int,
    frozen_extra: set[str] | None = None,
) -> tuple[bytes, int, int, str]:
    frozen_extra = frozen_extra or set()
    hidden = ctx.off_layers | reg.frozen_layers | frozen_extra
    aspect = (2 * reg.hw) / max(2 * reg.hh, 1e-9)
    if aspect >= 1:
        width_px = max_edge
        height_px = max(1, int(max_edge / aspect))
    else:
        height_px = max_edge
        width_px = max(1, int(max_edge * aspect))

    note_parts = [
        "תצוגה מקורבת של אזור ה-viewport; טקסט עברי ב-SHX עשוי לא להופיע נכון."
    ]
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from ezdxf.addons.drawing import Frontend, RenderContext
        from ezdxf.addons.drawing.matplotlib import MatplotlibBackend

        fig = plt.figure(figsize=(width_px / 100, height_px / 100), dpi=100)
        ax = fig.add_axes([0, 0, 1, 1])
        ax.set_facecolor("white")
        ctx_draw = RenderContext(ctx.doc)
        for layer in list(ctx_draw.layers.keys()):
            if layer in hidden:
                ctx_draw.layers[layer].is_visible = False
        backend = MatplotlibBackend(ax)
        Frontend(ctx_draw, backend).draw_layout(ctx.doc.modelspace(), finalize=True)
        ax.set_xlim(reg.cx - reg.hw, reg.cx + reg.hw)
        ax.set_ylim(reg.cy - reg.hh, reg.cy + reg.hh)
        ax.set_aspect("equal")
        ax.axis("off")
        buf = io.BytesIO()
        fig.savefig(buf, format="png", facecolor="white", pad_inches=0)
        plt.close(fig)
        return buf.getvalue(), width_px, height_px, " ".join(note_parts)
    except Exception as exc:
        log.warning("preview render fallback: %s", exc)
        note_parts.append("רינדור מלא נכשל — תמונת מסגרת בלבד.")
        from PIL import Image, ImageDraw

        img = Image.new("RGB", (width_px, height_px), "white")
        dr = ImageDraw.Draw(img)
        dr.rectangle([2, 2, width_px - 3, height_px - 3], outline="#cccccc", width=2)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue(), width_px, height_px, " ".join(note_parts)