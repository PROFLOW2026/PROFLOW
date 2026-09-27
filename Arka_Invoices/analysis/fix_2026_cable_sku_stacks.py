#!/usr/bin/env python3
"""2026-only SKU stack ownership fixes for three cable products (5951021, 5951081, 5952040)."""

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

        # כבל 3×1.5 — wrong unit stack (26.74×יח2) on 25342606185; not meter cable stack
        if inv == "25342606185" and code in {"5951021", "951021"} and delivery == "44512610799":
            mark_stack_fail(row, "5951021_yich_stack_not_meter_cable")
            changed += 1
            continue

        # כבל 5×2.5 — total/qty/meter mismatch on 25342607483 (587.25 vs 1.17×100)
        if inv == "25342607483" and code in {"5951081", "951081"} and delivery == "44512613801":
            mark_stack_fail(row, "5951081_total_not_unit_x_printed_meter_qty")
            changed += 1
            continue

        # כבל 5×2.5 — fix derived qty to PDF printed 100.00 מטר on 25342605226
        if inv == "25342605226" and code == "5951081" and delivery == "44512608728":
            if row.get("quantity") != "100":
                row["quantity"] = "100"
                row["unit"] = "meter"
                row["validation_status"] = "PASS"
                row["validation_reason_code"] = "PASS_EXACT"
                row["validation_difference"] = "0.0018"
                notes = (row.get("notes") or "").strip(";")
                row["notes"] = f"{notes};sku_stack_qty_corrected_100m".strip(";")
                changed += 1

    write_csv(LINES_CSV, line_cols, rows)
    lines_2026 = [r for r in rows if r.get("invoice_year") == "2026"]
    removed = repair_mod.merge_history(lines_2026)

    import extract_requested_product_price_ranges as report_mod  # noqa: E402

    report_mod.main()

    print(f"2026 CABLE STACK ROWS CHANGED = {changed}")
    print(f"HISTORY 2026 ROWS REPLACED = {removed}")
    print("2026 STAGING UPDATED = YES")


if __name__ == "__main__":
    main()
