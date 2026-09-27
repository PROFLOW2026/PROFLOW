#!/usr/bin/env python3
"""2026-only stack ownership fixes from final same-physical-product anomaly check."""

from __future__ import annotations

import csv
import sys
from pathlib import Path
from typing import Any

ROOT = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices")
DATASET = ROOT / "dataset"
LINES_CSV = DATASET / "invoice_lines_staging.csv"
ANALYSIS = ROOT / "analysis"

sys.path.insert(0, str(ANALYSIS))
import append_2026_extraction as repair_mod  # noqa: E402


def load_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        cols = list(reader.fieldnames or [])
        return cols, [dict(r) for r in reader]


def write_csv(path: Path, columns: list[str], rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def mark_stack_fail(row: dict[str, str], reason: str) -> None:
    row["validation_status"] = "FAIL"
    row["validation_reason_code"] = "STACK_OWNERSHIP_FAIL"
    notes = (row.get("notes") or "").strip(";")
    row["notes"] = f"{notes};sku_stack_ownership_fail;{reason}".strip(";")


def main() -> None:
    line_cols, rows = load_csv(LINES_CSV)
    changed = 0

    for row in rows:
        if row.get("invoice_year") != "2026":
            continue
        inv = row.get("invoice_number", "")
        code = row.get("item_code", "")
        delivery = row.get("delivery_doc_ref", "")

        # מסגרת 4 מקום קורוס — wire meter stack (72.98/0.73/100m) bleed onto 3916704
        if inv == "25342601565" and code == "3916704" and delivery == "44512602872":
            if row.get("unit_price_net") in {"7.3", "7.30"}:
                mark_stack_fail(row, "3916704_wire_stack_not_frame")
                changed += 1
                continue

        # צינור מריכב 20 — D-18 box (~28/יח) stack bleed onto 8600003
        if inv == "25342607483" and code == "8600003" and delivery == "44512613125":
            if row.get("unit_price_net") in {"28.22"}:
                mark_stack_fail(row, "8600003_d18_box_stack_not_pipe")
                changed += 1

    write_csv(LINES_CSV, line_cols, rows)
    lines_2026 = [r for r in rows if r.get("invoice_year") == "2026"]
    removed = repair_mod.merge_history(lines_2026)

    import extract_requested_product_price_ranges as report_mod  # noqa: E402

    report_mod.main()

    print(f"2026 ANOMALY STACK ROWS CHANGED = {changed}")
    print(f"HISTORY 2026 ROWS REPLACED = {removed}")
    print("2026 STAGING UPDATED = YES")


if __name__ == "__main__":
    main()
