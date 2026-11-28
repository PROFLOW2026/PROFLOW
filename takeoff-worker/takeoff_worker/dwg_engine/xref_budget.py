"""Resource stops for an XREF closure. Numbers already used by the worker and the upload limit."""
from __future__ import annotations

import time

XREF_MAX_FILES = 32
XREF_MAX_FILE_BYTES = 250 * 1024 * 1024
XREF_MAX_CLOSURE_BYTES = 150 * 1024 * 1024
XREF_MAX_CLOSURE_SEC = 600
XREF_MAX_INSERTS = 50_000


class XrefBudget:
    def __init__(self, host_bytes: int, host_inserts: int, *, max_inserts: int = XREF_MAX_INSERTS):
        self.host_bytes = max(0, int(host_bytes))
        self.loaded_bytes = 0
        self.count = 0
        self.inserts = max(0, int(host_inserts))
        self.max_inserts = max_inserts
        self.started = time.monotonic()
        self.seen: set[str] = set()

    @property
    def host_over_budget(self) -> bool:
        return self.host_bytes > XREF_MAX_CLOSURE_BYTES

    def timed_out(self) -> bool:
        return time.monotonic() - self.started >= XREF_MAX_CLOSURE_SEC

    def reject_new_bytes(self, size: int | None) -> str | None:
        """Size and count stops without treating a second reference to a known file as a cycle."""
        if self.host_over_budget:
            return "host_over_budget"
        if self.count >= XREF_MAX_FILES:
            return "count"
        if self.timed_out():
            return "time"
        if size is not None and size > XREF_MAX_FILE_BYTES:
            return "file_size"
        if size is not None and self.host_bytes + self.loaded_bytes + size > XREF_MAX_CLOSURE_BYTES:
            return "total_size"
        return None

    def reject(self, size: int | None, identity: str) -> str | None:
        if self.host_over_budget:
            return "host_over_budget"
        if identity and identity in self.seen:
            return "cycle"
        if self.count >= XREF_MAX_FILES:
            return "count"
        if self.timed_out():
            return "time"
        if size is not None and size > XREF_MAX_FILE_BYTES:
            return "file_size"
        if size is not None and self.host_bytes + self.loaded_bytes + size > XREF_MAX_CLOSURE_BYTES:
            return "total_size"
        return None

    def note_file(self, size: int, identity: str) -> None:
        if identity:
            self.seen.add(identity)
        self.count += 1
        self.loaded_bytes += max(0, int(size))

    def reject_inserts(self, extra: int) -> bool:
        return self.inserts + max(0, int(extra)) > self.max_inserts

    def note_inserts(self, extra: int) -> None:
        self.inserts += max(0, int(extra))
