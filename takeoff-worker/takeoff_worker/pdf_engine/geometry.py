"""Lightweight PDF geometry (PyMuPDF-compatible conventions, display space: origin top-left, y down)."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Optional


@dataclass(frozen=True)
class PdfPoint:
    x: float
    y: float

    def __mul__(self, m: "PdfMatrix") -> "PdfPoint":
        return PdfPoint(m.a * self.x + m.c * self.y + m.e, m.b * self.x + m.d * self.y + m.f)

    def __iter__(self):
        yield self.x
        yield self.y


@dataclass
class PdfRect:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def width(self) -> float:
        return abs(self.x1 - self.x0)

    @property
    def height(self) -> float:
        return abs(self.y1 - self.y0)

    def normalize(self) -> None:
        if self.x1 < self.x0:
            self.x0, self.x1 = self.x1, self.x0
        if self.y1 < self.y0:
            self.y0, self.y1 = self.y1, self.y0

    def __or__(self, other: "PdfRect") -> "PdfRect":
        return PdfRect(
            min(self.x0, other.x0),
            min(self.y0, other.y0),
            max(self.x1, other.x1),
            max(self.y1, other.y1),
        )

    def intersects(self, other: "PdfRect") -> bool:
        return not (self.x1 < other.x0 or other.x1 < self.x0 or self.y1 < other.y0 or other.y1 < self.y0)

    def contains_point(self, x: float, y: float) -> bool:
        return self.x0 <= x <= self.x1 and self.y0 <= y <= self.y1

    def tuple(self) -> tuple[float, float, float, float]:
        return (self.x0, self.y0, self.x1, self.y1)


@dataclass(frozen=True)
class PdfMatrix:
    a: float = 1.0
    b: float = 0.0
    c: float = 0.0
    d: float = 1.0
    e: float = 0.0
    f: float = 0.0

    def __mul__(self, other: "PdfMatrix") -> "PdfMatrix":
        return PdfMatrix(
            self.a * other.a + self.b * other.c,
            self.a * other.b + self.b * other.d,
            self.c * other.a + self.d * other.c,
            self.c * other.b + self.d * other.d,
            self.e * other.a + self.f * other.c + other.e,
            self.e * other.b + self.f * other.d + other.f,
        )

    def transform_point(self, x: float, y: float) -> tuple[float, float]:
        return (self.a * x + self.c * y + self.e, self.b * x + self.d * y + self.f)


def rotation_matrix(rotation_deg: int, page_w: float, page_h: float) -> PdfMatrix:
    """Same semantics as PyMuPDF ``Page.rotation_matrix``: map path coords to display space."""
    rot = rotation_deg % 360
    if rot == 0:
        return PdfMatrix()
    if rot == 90:
        return PdfMatrix(0, 1, -1, 0, page_h, 0)
    if rot == 180:
        return PdfMatrix(-1, 0, 0, -1, page_w, page_h)
    if rot == 270:
        return PdfMatrix(0, -1, 1, 0, 0, page_w)
    raise ValueError(f"unsupported page rotation: {rotation_deg}")


def display_bounds_from_pdf(l: float, b: float, r: float, t: float, page_h: float) -> PdfRect:
    """Convert pdfium ``get_bounds()`` (bottom-left origin) to display space (top-left)."""
    rect = PdfRect(l, page_h - t, r, page_h - b)
    rect.normalize()
    return rect


def rect_from_points(points: Iterable[tuple[float, float]]) -> Optional[PdfRect]:
    pts = list(points)
    if not pts:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    out = PdfRect(min(xs), min(ys), max(xs), max(ys))
    out.normalize()
    return out


def hypot(x: float, y: float) -> float:
    return math.hypot(x, y)