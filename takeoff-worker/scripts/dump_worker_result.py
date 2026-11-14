"""Dump worker POST body exactly like server.py (_post_json + json.dumps(model_dump())).

usage: python scripts/dump_worker_result.py <case> [--out path.json]
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    case = sys.argv[1] if len(sys.argv) > 1 else ""
    if not case or case.startswith("-"):
        raise SystemExit("usage: dump_worker_result.py <case> [--out path.json]")
    out: Path | None = None
    if "--out" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--out") + 1])
    else:
        out = ROOT / ".tmp" / f"{case}.worker.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = ROOT / ".tmp" / f"_dump_{case}.json"
    cmd = [sys.executable, str(ROOT / "scripts" / "corpus_run.py"), case, "--json", str(tmp)]
    subprocess.check_call(cmd, cwd=str(ROOT))
    from takeoff_worker.models import WorkerResult  # noqa: WPS433

    data = json.loads(tmp.read_text(encoding="utf-8"))
    res = WorkerResult.model_validate(data)
    wire = json.dumps(res.model_dump(), ensure_ascii=False)
    out.write_text(wire, encoding="utf-8")
    print(out, len(wire))


if __name__ == "__main__":
    main()