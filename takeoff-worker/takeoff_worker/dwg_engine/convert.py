"""DWG → DXF via external LibreDWG dwg2dxf (GPLv3 subprocess only)."""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

DEFAULT_TIMEOUT_SEC = 600


@dataclass
class ConvertResult:
    dxf_path: str
    unstable_objects: int
    libredwg_version: str | None
    stderr_tail: str
    convert_secs: float = 0.0
    cache_hit: bool = False


def libredwg_engine_label(exe: Path | None) -> str:
    """Version slot for engineVersions — basename only, never a host path."""
    if exe is None:
        return "not_found"
    return exe.name


def find_dwg2dxf() -> Path | None:
    env = os.environ.get("LIBREDWG_DWG2DXF")
    if env and Path(env).is_file():
        return Path(env)
    here = Path(__file__).resolve().parents[2]  # takeoff-worker/
    for name in ("dwg2dxf.exe", "dwg2dxf"):
        cand = here / "tools" / "bin" / name
        if cand.is_file():
            return cand
    found = shutil.which("dwg2dxf") or shutil.which("dwg2dxf.exe")
    return Path(found) if found else None


def _count_unstable(output: str) -> int:
    n = 0
    for line in output.splitlines():
        if "Unstable" in line or "unstable" in line.lower():
            n += 1
        m = re.search(r"(\d+)\s+unstable", line, re.I)
        if m:
            n = max(n, int(m.group(1)))
    return n


def convert_dwg_to_dxf(
    dwg_path: str,
    *,
    out_dir: str | None = None,
    timeout_sec: float = DEFAULT_TIMEOUT_SEC,
) -> ConvertResult:
    exe = find_dwg2dxf()
    if exe is None:
        raise FileNotFoundError("dwg2dxf not found (set LIBREDWG_DWG2DXF or install tools/bin)")

    t0 = time.perf_counter()
    work = out_dir or tempfile.mkdtemp(prefix="takeoff_dwg_")
    # LibreDWG on Windows often fails on non-ASCII paths — copy to a safe temp name.
    ascii_in = Path(work) / "input.dwg"
    shutil.copy2(dwg_path, ascii_in)
    out = Path(work) / "input.dxf"
    cmd = [str(exe), "-y", "-o", str(out), str(ascii_in)]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired as e:
        raise TimeoutError(f"dwg2dxf timed out after {timeout_sec}s") from e

    combined = (proc.stdout or "") + "\n" + (proc.stderr or "")
    if not out.is_file() or proc.returncode != 0:
        tail = "\n".join(combined.splitlines()[-12:])
        raise RuntimeError(f"dwg_convert_failed (rc={proc.returncode}): {tail}")

    ver = None
    for line in combined.splitlines():
        if "LibreDWG" in line or "version" in line.lower():
            ver = line.strip()[:120]
            break

    return ConvertResult(
        dxf_path=str(out),
        unstable_objects=_count_unstable(combined),
        libredwg_version=ver,
        stderr_tail="\n".join(combined.splitlines()[-8:]),
        convert_secs=round(time.perf_counter() - t0, 3),
        cache_hit=False,
    )