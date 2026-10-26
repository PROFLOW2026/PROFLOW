"""Generate EXLFY brand assets from the approved logo PNG (transparent background)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Glossy Purple E f Y Monogram Logo.png"
BRAND_DIR = ROOT / "public" / "brand"
ICONS_DIR = ROOT / "public" / "icons"
PREVIEW_DIR = BRAND_DIR / "previews"

# PWA / Android install icon (option B): opaque brand teal + white monogram.
PWA_BRAND_TEAL_RGBA = (15, 118, 110, 255)  # #0f766e — matches PWA_THEME_COLOR_LIGHT


def trim_alpha_bbox(img: Image.Image, alpha_threshold: int = 20) -> Image.Image:
    rgba = np.array(img.convert("RGBA"))
    alpha = rgba[:, :, 3]
    ys, xs = np.where(alpha > alpha_threshold)
    if ys.size == 0:
        return img
    return img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def monogram_bottom_y(img: Image.Image, alpha_threshold: int = 30) -> int:
    """First clear horizontal gap between the EYf monogram and the EXLFY wordmark."""
    alpha = np.array(img.convert("RGBA"))[:, :, 3]
    h = alpha.shape[0]
    counts = [int((alpha[y] > alpha_threshold).sum()) for y in range(h)]
    start = int(h * 0.48)
    empty_run = 0
    for y in range(start, h):
        if counts[y] < 10:
            empty_run += 1
            if empty_run >= 10:
                return y - empty_run + 1
        else:
            empty_run = 0
    return int(h * 0.72)


def crop_monogram(img: Image.Image) -> Image.Image:
    w, _ = img.size
    bottom = monogram_bottom_y(img)
    cropped = img.crop((0, 0, w, bottom))
    return trim_alpha_bbox(cropped)


def tint_monogram_white(img: Image.Image) -> Image.Image:
    """Approved monogram silhouette in white (install icon / splash)."""
    rgba = np.array(img.convert("RGBA"), dtype=np.float32)
    alpha = rgba[:, :, 3]
    mask = alpha > 20
    for channel in range(3):
        rgba[:, :, channel] = np.where(mask, 255.0, rgba[:, :, channel])
    return Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8))


def tint_monogram_teal(img: Image.Image) -> Image.Image:
    """Map approved monogram silhouette to site teal (light-mode brand ramp)."""
    rgba = np.array(img.convert("RGBA"), dtype=np.float32)
    alpha = rgba[:, :, 3]
    mask = alpha > 20
    if not mask.any():
        return img
    lum = rgba[:, :, :3].mean(axis=2)
    lo, hi = float(lum[mask].min()), float(lum[mask].max())
    norm = (lum - lo) / (hi - lo + 1e-6)
    dark = np.array([15.0, 118.0, 110.0])  # --pf-teal-700
    light = np.array([20.0, 184.0, 166.0])  # --pf-teal-500
    rgb = dark + norm[..., None] * (light - dark)
    for c in range(3):
        rgba[:, :, c] = np.where(mask, rgb[:, :, c], rgba[:, :, c])
    return Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8))


def square_fit(img: Image.Image, size: int, pad: float = 0.08) -> Image.Image:
    iw, ih = img.size
    inner = int(size * (1 - 2 * pad))
    scale = min(inner / iw, inner / ih)
    nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox, oy = (size - nw) // 2, (size - nh) // 2
    canvas.paste(resized, (ox, oy), resized)
    return canvas


def pwa_install_icon(monogram: Image.Image, size: int, *, pad: float) -> Image.Image:
    """Opaque teal square with centered white monogram (no transparency / no black bleed)."""
    iw, ih = monogram.size
    inner = int(size * (1 - 2 * pad))
    scale = min(inner / iw, inner / ih)
    nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
    resized = monogram.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), PWA_BRAND_TEAL_RGBA)
    ox, oy = (size - nw) // 2, (size - nh) // 2
    canvas.paste(resized, (ox, oy), resized)
    return canvas.convert("RGB")


def write_pwa_install_icons(monogram_source: Image.Image) -> None:
    white_mono = tint_monogram_white(crop_monogram(monogram_source))
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    targets: list[tuple[int, float, Path]] = [
        (192, 0.11, ICONS_DIR / "icon-192.png"),
        (512, 0.11, ICONS_DIR / "icon-512.png"),
        (512, 0.2, ICONS_DIR / "icon-512-maskable.png"),
        (180, 0.11, ICONS_DIR / "apple-touch-icon.png"),
    ]
    for size, pad, out in targets:
        pwa_install_icon(white_mono, size, pad=pad).save(out, format="PNG")
    write_preview(ICONS_DIR / "icon-512.png", "pwa-icon-512")
    write_preview(ICONS_DIR / "icon-512-maskable.png", "pwa-icon-512-maskable")


def alpha_transparent_ratio(path: Path) -> float:
    alpha = np.array(Image.open(path).convert("RGBA"))[:, :, 3]
    return float((alpha < 10).mean())


def write_preview(asset: Path, name: str) -> None:
    """Composite asset on light and dark surfaces for visual QA."""
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    fg = Image.open(asset).convert("RGBA")
    for label, bg_rgb in (("light", (248, 250, 252)), ("dark", (15, 23, 42))):
        pad = 24
        canvas = Image.new("RGBA", (fg.width + pad * 2, fg.height + pad * 2), (*bg_rgb, 255))
        canvas.paste(fg, (pad, pad), fg)
        canvas.save(PREVIEW_DIR / f"{name}-on-{label}.png")


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    monogram = tint_monogram_teal(crop_monogram(source))
    full = tint_monogram_teal(trim_alpha_bbox(source))

    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    full.save(BRAND_DIR / "exlfy-logo-full.png")
    monogram.save(BRAND_DIR / "exlfy-logo-monogram.png")

    write_pwa_install_icons(source)

    targets: list[tuple[int, Path]] = [
        (512, ROOT / "src" / "app" / "icon.png"),
    ]
    for size, out in targets:
        square_fit(monogram, size).save(out)

    ico_sizes = [square_fit(monogram, s) for s in (16, 32, 48)]
    ico_sizes[0].save(
        ROOT / "src" / "app" / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in (16, 32, 48)],
        append_images=ico_sizes[1:],
    )

    write_preview(BRAND_DIR / "exlfy-logo-monogram.png", "monogram")
    write_preview(BRAND_DIR / "exlfy-logo-full.png", "full")
    write_preview(ROOT / "src" / "app" / "icon.png", "app-icon-512")

    checks = [
        BRAND_DIR / "exlfy-logo-monogram.png",
        BRAND_DIR / "exlfy-logo-full.png",
        ROOT / "src" / "app" / "icon.png",
    ]
    for path in checks:
        ratio = alpha_transparent_ratio(path)
        print(f"{path.relative_to(ROOT)} transparent={ratio:.1%}")

    for path in (
        ICONS_DIR / "icon-192.png",
        ICONS_DIR / "icon-512.png",
        ICONS_DIR / "icon-512-maskable.png",
        ICONS_DIR / "apple-touch-icon.png",
    ):
        rgb = np.array(Image.open(path).convert("RGB"))
        corner = rgb[0, 0]
        center = rgb[rgb.shape[0] // 2, rgb.shape[1] // 2]
        print(
            f"{path.relative_to(ROOT)} mode=RGB corner={tuple(corner)} center={tuple(center)}"
        )

    print("EXLFY brand assets written (site monogram alpha preserved; PWA icons opaque teal).")


if __name__ == "__main__":
    main()
