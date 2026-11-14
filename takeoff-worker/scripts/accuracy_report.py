"""Batch corpus accuracy report -> docs/implementation/electrical-takeoff/ACCURACY.md

Each case runs via ``scripts/run_capped.py`` (global lock, 6 GiB RSS, timeout).
Run the batch itself under capped too::

    python scripts/run_capped.py --rss-gib 6 --timeout 7200 -- python scripts/accuracy_report.py
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
OUT = REPO / "docs" / "implementation" / "electrical-takeoff" / "ACCURACY.md"
PARTIAL = OUT.with_suffix(".partial.json")

CASES = ["7155_light_g", "3643", "2267", "4285", "as1749"]
PENDING_GUARD_CASES = ("2302", "1727")
DWG_ONLY = [
    ("3031-M", "FW__*/**/*3031*.dwg"),
    ("3096", "FW__*/**/*3096*.dwg"),
    ("3621", "FW__*/**/*3621*.dwg"),
    ("G1", "FW__*/**/*G1*.dwg"),
    ("G2", "FW__*/**/*G2*.dwg"),
]
DEFAULT_TIMEOUT_SEC = 8 * 60
RUN_CAPPED = ROOT / "scripts" / "run_capped.py"


def _run_subprocess(case_key: str, timeout: int) -> dict:
    child = [sys.executable, str(Path(__file__).resolve()), "--child", case_key]
    cmd = [
        sys.executable,
        str(RUN_CAPPED),
        "--rss-gib",
        "6",
        "--timeout",
        str(timeout),
        "--",
        *child,
    ]
    t0 = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT))
    wall = time.time() - t0
    merged = (proc.stdout or "") + "\n" + (proc.stderr or "")
    if proc.returncode == 98:
        return {
            "case": case_key,
            "status": "timeout",
            "wall_sec": wall,
            "error": f"run_capped timeout after {timeout}s",
            "ground_truth": "partial: unverified",
        }
    if proc.returncode == 97:
        return {
            "case": case_key,
            "status": "partial",
            "wall_sec": wall,
            "error": "run_capped RSS cap (6 GiB)",
            "ground_truth": "partial: unverified",
        }
    if proc.returncode == 99:
        return {
            "case": case_key,
            "status": "error",
            "wall_sec": wall,
            "error": "run_capped global lock wait timeout",
            "ground_truth": "partial: unverified",
        }
    if proc.returncode != 0:
        return {
            "case": case_key,
            "status": "error",
            "wall_sec": wall,
            "error": merged[-500:],
            "ground_truth": "partial: unverified",
        }
    try:
        row = json.loads(proc.stdout.strip().splitlines()[-1])
        row["wall_sec"] = row.get("wall_sec", wall)
        return row
    except (json.JSONDecodeError, IndexError):
        return {
            "case": case_key,
            "status": "error",
            "wall_sec": wall,
            "error": "invalid child json",
            "ground_truth": "partial: unverified",
        }


def _child_main() -> None:
    """Entry: python accuracy_report.py --child <case|dwg:label>"""
    if len(sys.argv) < 3 or sys.argv[1] != "--child":
        raise SystemExit(2)
    name = sys.argv[2]
    sys.path.insert(0, str(ROOT))
    from scripts.accuracy_case_runner import run_accuracy_case  # noqa: WPS433

    if name.startswith("dwg:"):
        label = name[4:]
        rows = [run_accuracy_case(f"dwg-{label}", dwg_only=label)]
    else:
        rows = [run_accuracy_case(name)]
    print(json.dumps(rows[0], ensure_ascii=False))


def _render_md(rows: list[dict]) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    parts = [
        "# Electrical takeoff accuracy report",
        "",
        f"Generated: `{ts}` via `takeoff-worker/scripts/accuracy_report.py` (one subprocess per case).",
        "",
        "**Policy:** No verified BOQ accuracy without a control count. Labels per case below.",
        "",
        "## Limits",
        "",
        "- Paired PDF+DWG: DWG primary; `pdf_only` not counted; `legend_zone` excluded.",
        "- Embedded-legend PDFs need decodable legend text from the PDF engine.",
        "- Monochrome PDFs (2302/1727): best-effort only.",
        "",
        "## Cases",
        "",
    ]
    for r in rows:
        parts.append(f"### {r.get('case')}")
        if r.get("error"):
            parts.append(f"- **Status:** {r.get('status', 'error')} — {r['error'][:200]}")
        else:
            parts.append(
                f"- **Status:** {r.get('status')} | **{r.get('wall_sec', 0):.1f}s** | *{r.get('ground_truth', 'n/a')}*"
            )
            parts.append(
                f"- Detections: {r.get('detections')} | plan qty: {r.get('plan_qty_detections', 'n/a')} | "
                f"Classified: {r.get('classified')} ({r.get('classified_pct', 'n/a')}, "
                f"plan {r.get('plan_classified_pct', 'n/a')}) | high: {r.get('classified_high', 'n/a')} | "
                f"unclassified plan: {r.get('unclassified_plan', 'n/a')} | "
                f"BOQ countable: {r.get('boq_countable', 'n/a')}"
            )
            if r.get("boq_excluded_legend_zone") is not None:
                parts.append(f"- Legend zone excluded (BOQ): {int(r['boq_excluded_legend_zone'])}")
            if r.get("legend_text_usable") is not None:
                parts.append(
                    f"- Legend text: usable {r.get('legend_text_usable')} / undecodable {r.get('legend_text_undecodable', 0)}"
                    f" | legend rows classified: {r.get('legend_rows_classified', 'n/a')}"
                )
            if r.get("classified_pdf_pct") is not None:
                parts.append(f"- PDF cls {r['classified_pdf_pct']:.1f}% / DWG cls {r.get('classified_dwg_pct', 0):.1f}%")
            if r.get("merge_pct") is not None:
                parts.append(f"- Merge PDF: {r['merge_pct']:.1f}%")
            parts.append(f"- Confidence: `{r.get('confidence', {})}`")
        parts.append("")
    return "\n".join(parts)


def main() -> None:
    if len(sys.argv) >= 2 and sys.argv[1] == "--child":
        _child_main()
        return

    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SEC)
    parser.add_argument("--cases", nargs="*", default=CASES)
    parser.add_argument("--no-dwg", action="store_true", help="Skip optional DWG-only corpus globs")
    args = parser.parse_args()

    build_log = REPO / ".tmp-e2e-build.log"
    if build_log.is_file() and "exit" not in build_log.read_text(encoding="utf-8", errors="ignore").lower():
        print("WARN: build still running (.tmp-e2e-build.log has no exit line); continuing one-case-at-a-time", flush=True)

    rows: list[dict] = []
    if PARTIAL.is_file():
        try:
            rows = json.loads(PARTIAL.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            rows = []

    for case in args.cases:
        print(f"running {case} (subprocess, timeout={args.timeout}s)...", flush=True)
        row = _run_subprocess(case, args.timeout)
        rows = [r for r in rows if r.get("case") != case] + [row]
        PARTIAL.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(_render_md(rows), encoding="utf-8")

    if args.no_dwg:
        DWG_ITER: list = []
    else:
        DWG_ITER = DWG_ONLY
    for label, _pat in DWG_ITER:
        key = f"dwg:{label}"
        print(f"running {key}...", flush=True)
        row = _run_subprocess(key, min(args.timeout, 180))
        rows = [r for r in rows if r.get("case") != f"dwg-{label}"] + [row]
        PARTIAL.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        OUT.write_text(_render_md(rows), encoding="utf-8")

    for case in PENDING_GUARD_CASES:
        pending = {
            "case": case,
            "status": "pending_guard",
            "ground_truth": "unverified — deferred until Agent 1 RSS guard",
            "error": "not run (known 17–23 GiB memory bomb on 2302 class)",
        }
        rows = [r for r in rows if r.get("case") != case] + [pending]
        PARTIAL.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        OUT.write_text(_render_md(rows), encoding="utf-8")

    print(f"Wrote {OUT}", flush=True)


if __name__ == "__main__":
    main()