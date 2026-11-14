"""PDF vector takeoff engine (pypdfium2, license-safe)."""

from .engine import PdfVectorEngine, templates_from_output
from .legend import build_legend_templates

__all__ = ["PdfVectorEngine", "templates_from_output", "build_legend_templates"]