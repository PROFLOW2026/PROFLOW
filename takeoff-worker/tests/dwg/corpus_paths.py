"""Resolve corpus DWG paths under Downloads (read-only)."""
from __future__ import annotations

import glob
import os
from pathlib import Path

DL = Path(os.environ.get("TAKEOFF_CORPUS", Path.home() / "Downloads"))


def require(path: Path, label: str) -> Path:
    if not path.is_file():
        import pytest

        pytest.skip(f"{label} missing: {path}")
    return path


CORPUS: dict[str, Path | None] = {
    "p7155_A1": None,
    "p3031_M": DL / "בדיקה" / "3031-M.dwg",
    "p3031_SW": DL / "בדיקה" / "3031-SW.dwg",
    "p3031_GND": DL / "בדיקה" / "3031-GND.dwg",
    "p3031_PIT": DL / "בדיקה" / "3031-PIT.dwg",
    "p3031_D123": DL / "בדיקה" / "3031-DIROT 123.dwg",
    "p3031_D124": DL / "בדיקה" / "3031-DIROT 124.dwg",
    "p3096_EL": None,
    "p3621_EL": None,
    "p3621_G1": None,
    "p3621_G2": None,
}


def _glob_one(pattern: str) -> Path | None:
    hits = glob.glob(str(DL / pattern), recursive=True)
    return Path(hits[0]) if hits else None


def resolve(key: str) -> Path:
    if key == "p7155_A1":
        p = _glob_one("FW__*/**/7155-A1.dwg") or _glob_one("**/7155-A1.dwg")
        return require(p, key) if p else require(Path(), key)
    if key == "p3096_EL":
        p = _glob_one("**/3096-EL.dwg")
        return require(p, key) if p else require(Path(), key)
    if key == "p3621_EL":
        p = _glob_one("**/3621-EL.dwg")
        return require(p, key) if p else require(Path(), key)
    if key == "p3621_G1":
        p = _glob_one("**/3621*/G1.dwg") or _glob_one("**/G1.dwg")
        return require(p, key) if p else require(Path(), key)
    if key == "p3621_G2":
        p = _glob_one("**/3621*/G2.dwg") or _glob_one("**/G2.dwg")
        return require(p, key) if p else require(Path(), key)
    p = CORPUS.get(key)
    return require(p, key) if p else require(Path(), key)