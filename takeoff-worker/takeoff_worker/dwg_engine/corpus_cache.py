"""On-demand DWG→DXF cache for corpus tests (.cache/, gitignored)."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

from .convert import ConvertResult, convert_dwg_to_dxf

TAKEOFF_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CACHE = TAKEOFF_ROOT / ".cache"


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def cache_dir() -> Path:
    d = Path(os.environ.get("TAKEOFF_DWG_CACHE", DEFAULT_CACHE))
    d.mkdir(parents=True, exist_ok=True)
    return d


def ensure_dxf(dwg_path: str | Path, *, cache: Path | None = None) -> tuple[Path, ConvertResult | None, bool]:
    """Return (dxf_path, convert_result_if_ran, cache_hit)."""
    cache = cache or cache_dir()
    dwg_path = Path(dwg_path)
    if not dwg_path.is_file():
        raise FileNotFoundError(dwg_path)
    if dwg_path.suffix.lower() == ".dxf":
        return dwg_path, None, True
    digest = sha256_file(dwg_path)
    out = cache / f"{digest}.dxf"
    meta_path = cache / f"{digest}.meta.json"
    if out.is_file():
        meta = {}
        if meta_path.is_file():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        res = ConvertResult(
            dxf_path=str(out),
            unstable_objects=int(meta.get("unstable_objects", 0)),
            libredwg_version=meta.get("libredwg_version"),
            stderr_tail=meta.get("stderr_tail", ""),
            convert_secs=float(meta.get("convert_secs", 0)),
            cache_hit=True,
        )
        return out, res, True
    sub = cache / f"_build_{digest[:12]}"
    sub.mkdir(parents=True, exist_ok=True)
    res = convert_dwg_to_dxf(str(dwg_path), out_dir=str(sub))
    import shutil

    shutil.copy2(res.dxf_path, out)
    meta_path.write_text(
        json.dumps(
            {
                "source": str(dwg_path),
                "unstable_objects": res.unstable_objects,
                "libredwg_version": res.libredwg_version,
                "stderr_tail": res.stderr_tail[-500:],
                "convert_secs": res.convert_secs,
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    res.cache_hit = False  # type: ignore[attr-defined]
    return out, res, False