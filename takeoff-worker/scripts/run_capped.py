"""Run ONE heavy takeoff-worker job with a global lock, RSS cap and wall-clock timeout.

Usage (from takeoff-worker/, venv python):
    python scripts/run_capped.py [--rss-gib 6] [--timeout 600] -- python scripts/corpus_run.py 7155_light_g

- Global lock (`.tmp/heavy.lock`): only one capped job runs at a time across all agents;
  others wait (polling) up to --lock-wait seconds.
- Kills the whole process tree if working set (sum over tree) > --rss-gib or time > --timeout.
- RULES: wrap ONE case per call, timeout <= 900s. NEVER wrap a multi-case runner (e.g. whole
  accuracy_report.py with --timeout 7200): it would hold the global lock for hours and starve every
  other agent. Waiters give up after --lock-wait (default 900s => exit 99); do not stack waiters.
- Exit codes: child's code; 97 = RSS cap kill; 98 = timeout kill; 99 = lock wait timeout.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

import psutil

LOCK = Path(__file__).resolve().parents[1] / ".tmp" / "heavy.lock"


def _tree_rss(proc: psutil.Process) -> int:
    total = 0
    try:
        procs = [proc, *proc.children(recursive=True)]
    except psutil.Error:
        return 0
    for p in procs:
        try:
            total += p.memory_info().rss
        except psutil.Error:
            pass
    return total


def _kill_tree(proc: psutil.Process) -> None:
    try:
        procs = [*proc.children(recursive=True), proc]
    except psutil.Error:
        procs = [proc]
    for p in procs:
        try:
            p.kill()
        except psutil.Error:
            pass


QUEUE = LOCK.parent / "queue"


def _my_turn(ticket: Path) -> bool:
    """FIFO fairness: only the oldest ticket whose owner pid is alive may take the lock."""
    live: list[tuple[str, Path]] = []
    for t in QUEUE.glob("*.ticket"):
        try:
            pid = int(t.stem.split("_")[1])
        except (IndexError, ValueError):
            continue
        if pid != os.getpid() and not psutil.pid_exists(pid):
            try:
                t.unlink()
            except OSError:
                pass
            continue
        live.append((t.name, t))
    live.sort()
    return not live or live[0][1] == ticket


def _acquire(lock_wait: float) -> bool:
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    QUEUE.mkdir(parents=True, exist_ok=True)
    ticket = QUEUE / f"{time.time_ns()}_{os.getpid()}.ticket"
    ticket.write_text("")
    try:
        return _acquire_inner(lock_wait, ticket)
    finally:
        try:
            ticket.unlink()
        except OSError:
            pass


def _acquire_inner(lock_wait: float, ticket: Path) -> bool:
    end = time.time() + lock_wait
    while time.time() < end:
        if not _my_turn(ticket):
            time.sleep(2)
            continue
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return True
        except FileExistsError:
            try:
                owner = int(LOCK.read_text() or "0")
            except (ValueError, OSError):
                owner = 0
            if owner and not psutil.pid_exists(owner):
                try:
                    LOCK.unlink()
                except OSError:
                    pass
                continue
            time.sleep(3)
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rss-gib", type=float, default=6.0)
    ap.add_argument("--timeout", type=float, default=600.0)
    ap.add_argument("--lock-wait", type=float, default=900.0)
    ap.add_argument("cmd", nargs=argparse.REMAINDER)
    a = ap.parse_args()
    cmd = a.cmd[1:] if a.cmd and a.cmd[0] == "--" else a.cmd
    if not cmd:
        ap.error("no command")
    if cmd[0] == "python":
        cmd[0] = sys.executable
    if not _acquire(a.lock_wait):
        print("run_capped: lock wait timeout", file=sys.stderr)
        return 99
    try:
        proc = subprocess.Popen(cmd)
        ps = psutil.Process(proc.pid)
        cap = int(a.rss_gib * 1024**3)
        start = time.time()
        peak = 0
        while proc.poll() is None:
            rss = _tree_rss(ps)
            peak = max(peak, rss)
            if rss > cap:
                _kill_tree(ps)
                print(f"run_capped: RSS {rss / 1024**3:.1f} GiB > cap {a.rss_gib} GiB -> killed", file=sys.stderr)
                return 97
            if time.time() - start > a.timeout:
                _kill_tree(ps)
                print(f"run_capped: timeout {a.timeout}s -> killed (peak {peak / 1024**3:.1f} GiB)", file=sys.stderr)
                return 98
            time.sleep(0.5)
        print(f"run_capped: done code={proc.returncode} peak_rss={peak / 1024**3:.2f} GiB", file=sys.stderr)
        return int(proc.returncode or 0)
    finally:
        try:
            LOCK.unlink()
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
