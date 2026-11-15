"""Optional Hebrew OCR for legend labels whose text layer is empty or garbage.

Prefers ``tesseract`` with the ``heb`` language if it is on PATH. On Windows, if
that is missing and the built-in Hebrew recognizer answers, uses Windows.Media.Ocr
through PowerShell (no extra package, no Docker dependency). If neither engine
is available the call site leaves the row unchanged and reports that OCR did not run.
"""
from __future__ import annotations

import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from functools import lru_cache
from typing import Callable, Optional, Sequence

from . import shape_engine as E
from .hebrew import _has_misplaced_finals, _legend_lexicon, decode_pdf_text
from .legend_text import _is_mojibake

_HEB_WORD = re.compile(r"[\u0590-\u05FF]{2,}")
_SHORT_LATIN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ./\-]{0,22}$")
_BIDI = re.compile(r"[\u200e\u200f\u202a-\u202e\ufeff]")

_backend_cache: Optional[str] = None
_tesseract_exe: Optional[str] = None

RecognizeFn = Callable[[bytes], Optional[str]]


@dataclass
class LegendOcrReport:
    needed: int
    ran: bool
    applied: int
    backend: str

    @property
    def stats(self) -> dict[str, float]:
        return {
            "legend_ocr_needed": float(self.needed),
            "legend_ocr_applied": float(self.applied),
            "legend_ocr_ran": 1.0 if self.ran else 0.0,
        }


def reset_ocr_backend_cache() -> None:
    global _backend_cache, _tesseract_exe
    _backend_cache = None
    _tesseract_exe = None


def legend_text_needs_ocr(decoded: Optional[str], reasons: Sequence[str]) -> bool:
    """True when the text layer has no usable Hebrew (or is watermark-length Latin)."""
    if "legend_text_undecodable" in reasons:
        return True
    text = (decoded or "").strip()
    if not text:
        return True
    if _is_mojibake(text):
        return True
    words = _HEB_WORD.findall(text)
    if not words:
        if _SHORT_LATIN.fullmatch(text):
            return False
        return True
    lexicon = _legend_lexicon()
    forward = False
    reversed_hit = False
    for word in words:
        if word in lexicon:
            forward = True
        elif word[::-1] in lexicon:
            reversed_hit = True
    if reversed_hit and not forward:
        return True
    if forward:
        return False
    if any(_has_misplaced_finals(word) or word[0] in "ךםןףץ" for word in words):
        return True
    return False


def active_ocr_backend() -> str:
    """``tesseract``, ``windows``, or ``none``. Never raises."""
    global _backend_cache, _tesseract_exe
    if _backend_cache is not None:
        return _backend_cache
    exe = _find_tesseract_heb()
    if exe:
        _tesseract_exe = exe
        _backend_cache = "tesseract"
        return _backend_cache
    if sys.platform == "win32" and _windows_heb_ready():
        _backend_cache = "windows"
        return _backend_cache
    _backend_cache = "none"
    return _backend_cache


def recognize_legend_png(png: bytes) -> Optional[str]:
    """OCR one legend crop. ``None`` means the engine did not read text (or is absent)."""
    backend = active_ocr_backend()
    if backend == "none" or not png:
        return None
    try:
        if backend == "tesseract" and _tesseract_exe:
            return _tesseract_image(_tesseract_exe, png)
        if backend == "windows":
            return _windows_ocr_png(png)
    except Exception:
        return None
    return None


def text_from_ocr(raw: str) -> str:
    """Run OCR output through ``decode_pdf_text`` and keep the token order catalog match prefers."""
    cleaned = _BIDI.sub("", raw or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return ""
    logical = decode_pdf_text(cleaned)
    if not logical:
        return ""
    from takeoff_worker.classify.legend_map import match_legend_text
    from takeoff_worker.classify.text_norm import reverse_visual_hebrew

    visual_tokens = reverse_visual_hebrew(logical)
    if visual_tokens == logical:
        return logical
    catalog = _default_catalog()
    logical_match = match_legend_text(logical, catalog)
    visual_match = match_legend_text(visual_tokens, catalog)
    if visual_match and (logical_match is None or visual_match.score > logical_match.score + 0.01):
        return visual_tokens
    return logical


def enrich_legend_rows(
    rows: list,
    *,
    page,
    comps: Sequence[E.Comp],
    view_w: float,
    view_h: float,
    recognize: Optional[RecognizeFn] = None,
    crop_fn: Optional[Callable[..., Optional[bytes]]] = None,
) -> LegendOcrReport:
    """Fill ``decodedText`` from a legend-label crop when the text layer is unusable.

    Does not set ``typeKey``. A miss leaves the row undecodable (type stays empty).
    When no OCR engine exists, text is left empty and marked undecodable. OCR is not invented.
    """
    needed_idx = [
        i
        for i, row in enumerate(rows)
        if i < len(comps) and legend_text_needs_ocr(row.decodedText, row.reasons or [])
    ]
    if not needed_idx:
        return LegendOcrReport(needed=0, ran=False, applied=0, backend="none")
    backend = active_ocr_backend() if recognize is None else "injected"
    if recognize is None and backend == "none":
        _stamp_undecodable(rows, needed_idx)
        return LegendOcrReport(needed=len(needed_idx), ran=False, applied=0, backend="none")

    reader = recognize or recognize_legend_png
    render = crop_fn or render_legend_label_png
    crops: list[tuple[int, bytes]] = []
    for i in needed_idx:
        png = render(
            page,
            comps[i],
            view_w,
            view_h,
            band_half=_row_half_pt(comps[i], comps),
        )
        if png:
            crops.append((i, png))
    raw_by_index: dict[int, Optional[str]] = {}
    if crops and recognize is None and backend == "windows":
        raw_by_index = _windows_ocr_batch(crops)
    else:
        for i, png in crops:
            try:
                raw_by_index[i] = reader(png)
            except Exception:
                raw_by_index[i] = None
    applied = 0
    for i, _png in crops:
        raw = raw_by_index.get(i)
        if not raw or not str(raw).strip():
            continue
        decoded = text_from_ocr(str(raw))
        if not _ocr_text_usable(decoded):
            continue
        row = rows[i]
        row.decodedText = decoded
        if not row.rawText:
            row.rawText = decoded
        if row.decodedBy in (None, "none"):
            row.decodedBy = "pdf_text"
        reasons = [r for r in (row.reasons or []) if r != "legend_text_undecodable"]
        # A catalog miss stays undecodable so confidence stays none. Text is kept for review.
        if _catalog_hit(decoded) is None:
            reasons.append("legend_text_undecodable")
        row.reasons = reasons
        applied += 1
    missed = [
        i
        for i in needed_idx
        if not (rows[i].decodedText and not legend_text_needs_ocr(rows[i].decodedText, []))
    ]
    _stamp_undecodable(rows, missed)
    return LegendOcrReport(needed=len(needed_idx), ran=True, applied=applied, backend=backend)


def _stamp_undecodable(rows: list, indexes: Sequence[int]) -> None:
    """Empty or failed legend text stays undecodable so confidence is not invented."""
    for i in indexes:
        if i < 0 or i >= len(rows):
            continue
        row = rows[i]
        if row.decodedText and not legend_text_needs_ocr(row.decodedText, []):
            continue
        reasons = list(row.reasons or [])
        if "legend_text_undecodable" not in reasons:
            reasons.append("legend_text_undecodable")
            row.reasons = reasons


def render_legend_label_png(
    page,
    comp: E.Comp,
    view_w: float,
    view_h: float,
    scale: float = 4.0,
    band_half: Optional[float] = None,
) -> Optional[bytes]:
    """Rasterize the label beside a legend symbol (Hebrew sits to the left)."""
    left = _band_rect(comp, view_w, view_h, side="left", half=band_half)
    right = _band_rect(comp, view_w, view_h, side="right", half=band_half)
    left_png = _prepare_label_png(_render_crop(page, left, view_w, view_h, scale), scale, "left")
    right_png = _prepare_label_png(_render_crop(page, right, view_w, view_h, scale), scale, "right")
    left_ink = _ink_pixels(left_png)
    right_ink = _ink_pixels(right_png)
    if left_ink >= right_ink and left_ink >= 40:
        return left_png
    if right_ink >= 40:
        return right_png
    return left_png or right_png


def _row_half_pt(comp: E.Comp, comps: Sequence[E.Comp]) -> float:
    """Half-height that stays inside this legend row, not the next symbol's text."""
    r = comp.rect
    cy = (r.y0 + r.y1) / 2
    cx = (r.x0 + r.x1) / 2
    deltas: list[float] = []
    for other in comps:
        if other is comp:
            continue
        o = other.rect
        ox = (o.x0 + o.x1) / 2
        oy = (o.y0 + o.y1) / 2
        if abs(ox - cx) > 40.0:
            continue
        gap = abs(oy - cy)
        # Closer than this is another stroke of the same symbol, not the next row.
        if gap >= 11.0:
            deltas.append(gap)
    # The previous 0.85*glyph band is what kept a whole word intact. Shrinking
    # below that slices the letters. A nearer neighbor only trims the extra.
    base = max(r.height, 14.0) * 0.85
    if not deltas:
        return base
    return min(base, max(min(deltas) * 0.7, 10.0))


def _band_rect(
    comp: E.Comp,
    view_w: float,
    view_h: float,
    *,
    side: str,
    half: Optional[float] = None,
) -> tuple[float, float, float, float]:
    r = comp.rect
    cy = (r.y0 + r.y1) / 2
    if half is None:
        half = max(r.height, 14.0) * 0.85
    y0 = max(0.0, cy - half)
    y1 = min(view_h, cy + half)
    if side == "left":
        # Hebrew legend lines are long. 260pt kept only the tail next to the symbol.
        x1 = max(0.0, r.x0 - 1.0)
        x0 = max(0.0, x1 - 520.0)
    else:
        x0 = min(view_w, r.x1 + 1.0)
        x1 = min(view_w, x0 + 220.0)
    if x1 <= x0 + 2:
        x1 = min(view_w, x0 + 8)
    return (x0, y0, x1, y1)


def _render_crop(page, box: tuple[float, float, float, float], view_w: float, view_h: float, scale: float) -> Optional[bytes]:
    x0, y0, x1, y1 = box
    x0 = max(0.0, min(view_w - 2, x0))
    y0 = max(0.0, min(view_h - 2, y0))
    x1 = max(x0 + 2, min(view_w, x1))
    y1 = max(y0 + 2, min(view_h, y1))
    crop = (x0, view_h - y1, view_w - x1, y0)
    try:
        bitmap = page.render(
            scale=scale,
            rotation=0,
            crop=crop,
            fill_color=(255, 255, 255, 255),
            rev_byteorder=True,
        )
        pil = bitmap.to_pil().convert("RGB")
    except Exception:
        return None
    buf = io.BytesIO()
    pil.save(buf, format="PNG", dpi=(int(72 * scale), int(72 * scale)))
    return buf.getvalue()


def _prepare_label_png(png: Optional[bytes], scale: float, side: str) -> Optional[bytes]:
    """Drop the legend rule and any drawing on the far side of a wide white gap.

    The label that belongs to the symbol is the text block touching the symbol.
    A 12pt gap is a column break (plan vs legend), not a space between words.
    """
    if not png:
        return None
    try:
        from PIL import Image
        import numpy as np
    except Exception:
        return png
    try:
        arr = np.asarray(Image.open(io.BytesIO(png)).convert("L")).copy()
    except Exception:
        return png
    if arr.size == 0:
        return png
    # Do not punch out dark rows or columns. On a one-line crop those are the
    # letter strokes, and tesseract then reads slices instead of words.
    ink = arr < 175
    col = ink.mean(axis=0)
    content = np.flatnonzero(col > 0.003)
    if content.size == 0:
        return png
    gap_px = max(6, int(12 * scale))
    splits = np.flatnonzero(np.diff(content) >= gap_px)
    starts = np.r_[0, splits + 1]
    ends = np.r_[splits, content.size - 1]
    runs = [(int(content[s]), int(content[e])) for s, e in zip(starts, ends)]
    runs = [run for run in runs if run[1] - run[0] >= max(4, int(2 * scale))] or runs
    x0, x1 = runs[-1] if side == "left" else runs[0]
    # A leftover rule speck is not the label. A short word is. Do not pull the plan back in.
    if x1 - x0 < int(8 * scale) and len(runs) >= 2:
        if side == "left":
            x0 = runs[-2][0]
        else:
            x1 = runs[1][1]
    ys = np.flatnonzero(ink[:, x0 : x1 + 1].any(axis=1))
    if ys.size == 0:
        return png
    pad = max(6, int(2 * scale))
    y0 = max(0, int(ys[0]) - pad)
    y1 = min(arr.shape[0], int(ys[-1]) + pad + 1)
    x0 = max(0, x0 - pad)
    x1 = min(arr.shape[1], x1 + pad + 1)
    crop = arr[y0:y1, x0:x1]
    out = Image.fromarray(crop)
    buf = io.BytesIO()
    out.save(buf, format="PNG", dpi=(int(72 * scale), int(72 * scale)))
    return buf.getvalue()


def _ink_pixels(png: Optional[bytes]) -> int:
    if not png:
        return 0
    try:
        from PIL import Image
        import numpy as np

        arr = np.asarray(Image.open(io.BytesIO(png)).convert("L"))
    except Exception:
        return 0
    if arr.size == 0:
        return 0
    return int((arr < 210).sum())


def _ocr_text_usable(text: str) -> bool:
    """Accept OCR text only when it would not itself be sent back to OCR."""
    if not text or _is_mojibake(text):
        return False
    if not re.search(r"[A-Za-z\u0590-\u05FF]", text):
        return False
    return not legend_text_needs_ocr(text, [])


@lru_cache(maxsize=1)
def _default_catalog():
    from takeoff_worker.data.catalog_loader import load_default_catalog

    return tuple(load_default_catalog())


def _catalog_hit(text: str):
    """Match the way classification does: normalize, then match (which normalizes again)."""
    from takeoff_worker.classify.legend_map import match_legend_text
    from takeoff_worker.classify.text_norm import normalize_legend_text

    normalized = normalize_legend_text(text, decoded_by="pdf_text")
    return match_legend_text(normalized, _default_catalog())


def _find_tesseract_heb() -> Optional[str]:
    exe = shutil.which("tesseract")
    if not exe:
        return None
    try:
        proc = subprocess.run([exe, "--list-langs"], capture_output=True, text=True, timeout=15)
    except Exception:
        return None
    blob = f"{proc.stdout or ''}\n{proc.stderr or ''}"
    langs = {line.strip() for line in blob.splitlines()}
    if "heb" not in langs:
        return None
    return exe


def recognize_png_words(png: bytes, lang: str = "heb+eng") -> list[tuple[str, float, float]]:
    """OCR words as ``(text, center_x, center_y)`` in image pixels.

    Empty when tesseract with Hebrew is not available. Positions are the
    center of each word box. Callers map them back onto the page.
    ``lang`` is the tesseract language. Legend text stays ``heb+eng``.
    A Latin multiplier note is read with ``eng``, because Hebrew mode
    rewrites a short ``X2`` into a different token.
    """
    backend = active_ocr_backend()
    if backend != "tesseract" or not png or not _tesseract_exe:
        return []
    try:
        proc = subprocess.run(
            [_tesseract_exe, "stdin", "stdout", "-l", lang, "--psm", "6", "tsv"],
            input=png,
            capture_output=True,
            timeout=90,
        )
    except Exception:
        return []
    if proc.returncode != 0:
        return []
    text = proc.stdout.decode("utf-8", errors="replace")
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        return []
    header = lines[0].split("\t")
    try:
        left_i = header.index("left")
        top_i = header.index("top")
        width_i = header.index("width")
        height_i = header.index("height")
        conf_i = header.index("conf")
        text_i = header.index("text")
    except ValueError:
        return []
    words: list[tuple[str, float, float]] = []
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) <= text_i:
            continue
        raw = parts[text_i].strip()
        if not raw:
            continue
        try:
            conf = float(parts[conf_i])
            left = float(parts[left_i])
            top = float(parts[top_i])
            width = float(parts[width_i])
            height = float(parts[height_i])
        except ValueError:
            continue
        if conf < 40 or width <= 0 or height <= 0:
            continue
        words.append((raw, left + width / 2.0, top + height / 2.0))
    return words


def _tesseract_image(exe: str, png: bytes) -> Optional[str]:
    proc = subprocess.run(
        [exe, "stdin", "stdout", "-l", "heb+eng", "--psm", "6"],
        input=png,
        capture_output=True,
        timeout=40,
    )
    if proc.returncode != 0:
        return None
    text = proc.stdout.decode("utf-8", errors="replace").strip()
    return text or None


_PS_OCR = r"""
param([string]$ImagePath, [string]$OutPath)
$ErrorActionPreference = 'Stop'
function Write-Result([string]$Value) {
  [System.IO.File]::WriteAllText($OutPath, $Value, (New-Object System.Text.UTF8Encoding $false))
}
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  } | Select-Object -First 1
  function Await([object]$WinRtTask, [type]$ResultType) {
    $method = $asTask.MakeGenericMethod($ResultType)
    $net = $method.Invoke($null, @($WinRtTask))
    $net.Wait(-1) | Out-Null
    $net.Result
  }
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType=WindowsRuntime]
  $null = [Windows.Globalization.Language, Windows.Foundation, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapPixelFormat, Windows.Foundation, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapAlphaMode, Windows.Foundation, ContentType=WindowsRuntime]
  function Get-Engine {
    foreach ($tag in @('he-IL', 'he')) {
      $lang = New-Object Windows.Globalization.Language $tag
      $eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
      if ($null -ne $eng) { return $eng }
    }
    return $null
  }
  $engine = Get-Engine
  if ($null -eq $engine) { Write-Result 'OCR_ENGINE_MISSING'; exit 0 }
  if ($ImagePath -eq 'PROBE') { Write-Result 'READY'; exit 0 }
  function Read-Image([string]$Path) {
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    return [string]$result.Text
  }
  if (Test-Path -LiteralPath $ImagePath -PathType Container) {
    $lines = New-Object System.Collections.Generic.List[string]
    Get-ChildItem -LiteralPath $ImagePath -Filter *.png | Sort-Object Name | ForEach-Object {
      $text = Read-Image $_.FullName
      $lines.Add($_.BaseName + "`t" + $text)
    }
    Write-Result ($lines -join "`n")
    exit 0
  }
  Write-Result (Read-Image $ImagePath)
} catch {
  Write-Result ('ERROR ' + $_.Exception.Message)
  exit 1
}
"""


def _run_windows_ocr_script(image_arg: str) -> Optional[str]:
    script_path = ""
    out_path = ""
    try:
        fd, script_path = tempfile.mkstemp(suffix=".ps1")
        os.close(fd)
        with open(script_path, "w", encoding="utf-8") as fh:
            fh.write(_PS_OCR)
        fd, out_path = tempfile.mkstemp(suffix=".txt")
        os.close(fd)
        proc = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                script_path,
                image_arg,
                out_path,
            ],
            capture_output=True,
            timeout=40,
        )
        if not os.path.isfile(out_path):
            return None
        text = open(out_path, encoding="utf-8").read().strip()
        if proc.returncode not in (0, 1):
            return None
        return text
    except Exception:
        return None
    finally:
        for path in (script_path, out_path):
            if path and os.path.isfile(path):
                try:
                    os.remove(path)
                except OSError:
                    pass


def _windows_ocr_batch(crops: list[tuple[int, bytes]]) -> dict[int, Optional[str]]:
    folder = tempfile.mkdtemp(prefix="legend-ocr-")
    out: dict[int, Optional[str]] = {idx: None for idx, _png in crops}
    try:
        order: list[int] = []
        for n, (idx, png) in enumerate(crops):
            with open(os.path.join(folder, f"{n:04d}.png"), "wb") as fh:
                fh.write(png)
            order.append(idx)
        text = _run_windows_ocr_script(folder)
        if not text or text == "OCR_ENGINE_MISSING" or text.startswith("ERROR"):
            return out
        for line in text.splitlines():
            if "\t" not in line:
                continue
            name, value = line.split("\t", 1)
            try:
                n = int(name)
            except ValueError:
                continue
            if 0 <= n < len(order):
                cleaned = value.strip()
                out[order[n]] = cleaned or None
        return out
    finally:
        shutil.rmtree(folder, ignore_errors=True)


def _windows_heb_ready() -> bool:
    text = _run_windows_ocr_script("PROBE")
    return text == "READY"


def _windows_ocr_png(png: bytes) -> Optional[str]:
    fd, png_path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        with open(png_path, "wb") as fh:
            fh.write(png)
        text = _run_windows_ocr_script(png_path)
    finally:
        try:
            os.remove(png_path)
        except OSError:
            pass
    if not text or text == "OCR_ENGINE_MISSING" or text.startswith("ERROR"):
        return None
    return text
