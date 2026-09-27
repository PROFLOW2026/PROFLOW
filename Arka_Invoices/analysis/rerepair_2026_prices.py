#!/usr/bin/env python3
"""Re-verify and fix 2026 unit prices from source PDF stacks (23 target products only)."""

from __future__ import annotations

import csv
import importlib.util
import sys
from pathlib import Path
from typing import Any

import pymupdf as fitz

ROOT = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices")
DATASET = ROOT / "dataset"
LINES_CSV = DATASET / "invoice_lines_staging.csv"
PRICE_HISTORY = DATASET / "product_price_history.csv"
ANALYSIS = ROOT / "analysis"

sys.path.insert(0, str(ANALYSIS))
import append_2026_extraction as repair_mod  # noqa: E402
import extract_requested_product_price_ranges as report_mod  # noqa: E402

extract_mod = repair_mod.extract_mod


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


def reconciles(row: dict[str, Any], tol: float = 0.03) -> bool:
    p = report_mod.parse_float(row.get("unit_price_net", ""))
    q = report_mod.parse_float(row.get("quantity", ""))
    t = report_mod.parse_float(row.get("line_total_net", ""))
    if not p or not q or not t or t <= 0:
        return False
    return abs(q * p - t) / t <= tol


def row_key(r: dict[str, str]) -> tuple[str, ...]:
    return (
        r.get("invoice_number", ""),
        r.get("item_code", ""),
        r.get("delivery_doc_ref", ""),
        r.get("source_file", ""),
        r.get("raw_description", "")[:60],
    )


def main() -> None:
    line_cols, all_lines = load_csv(LINES_CSV)
    pdf_cache: dict[str, list[str]] = {}

    def page_text(source_file: str, page_num: int) -> str:
        path = ROOT / source_file.replace("/", "\\")
        key = str(path)
        if key not in pdf_cache:
            doc = fitz.open(path)
            pdf_cache[key] = [doc[i].get_text("text") for i in range(len(doc))]
            doc.close()
        idx = max(0, page_num - 1)
        pages = pdf_cache[key]
        return pages[idx] if idx < len(pages) else ""

    matched_keys: set[tuple[str, ...]] = set()
    for spec in report_mod.PRODUCTS:
        for r in all_lines:
            if r.get("invoice_year") != "2026":
                continue
            if spec.matcher(r):
                matched_keys.add(row_key(r))

    verified = 0
    corrected = 0
    updated_lines: list[dict[str, str]] = []

    for r in all_lines:
        if r.get("invoice_year") != "2026":
            updated_lines.append(r)
            continue
        if row_key(r) not in matched_keys:
            updated_lines.append(r)
            continue

        verified += 1
        page = int(report_mod.parse_float(r.get("page", "")) or 1)
        text = page_text(r.get("source_file", ""), page)
        item = {
            "item_code": r.get("item_code", ""),
            "raw_description": r.get("raw_description", ""),
            "quantity": r.get("quantity", ""),
            "unit_price_net": r.get("unit_price_net", ""),
            "line_total_net": r.get("line_total_net", ""),
            "discount_percent": r.get("discount_percent", ""),
            "unit": r.get("unit", ""),
            "delivery_doc_ref": r.get("delivery_doc_ref", ""),
            "notes": r.get("notes", ""),
        }
        before = (item["unit_price_net"], item["quantity"], item["line_total_net"])
        fixed = repair_mod._repair_line_from_page_context(dict(item), text, force=True)
        if not reconciles(fixed):
            fixed = repair_mod._repair_from_glued_raw(fixed)

        row_out = dict(r)
        if reconciles(fixed):
            row_out["unit_price_net"] = fixed.get("unit_price_net", "")
            row_out["quantity"] = fixed.get("quantity", "")
            row_out["line_total_net"] = fixed.get("line_total_net", "")
            row_out["discount_percent"] = fixed.get("discount_percent", row_out.get("discount_percent", ""))
            row_out["unit"] = fixed.get("unit", row_out.get("unit", ""))
            if fixed.get("raw_description"):
                row_out["raw_description"] = fixed["raw_description"]
            stub = {
                "quantity": row_out["quantity"],
                "unit_price_net": row_out["unit_price_net"],
                "discount_percent": row_out.get("discount_percent", ""),
                "line_total_net": row_out["line_total_net"],
                "extraction_confidence": row_out.get("extraction_confidence", "MEDIUM"),
            }
            conf, vstat, reason, vdiff = extract_mod.validate_line_row(stub)
            row_out["extraction_confidence"] = conf
            row_out["validation_status"] = vstat
            row_out["validation_reason_code"] = reason
            row_out["validation_difference"] = vdiff
            row_out["notes"] = (row_out.get("notes", "") + ";price_verify_2026").strip(";")
            after = (row_out["unit_price_net"], row_out["quantity"], row_out["line_total_net"])
            if after != before:
                corrected += 1
        updated_lines.append(row_out)

    write_csv(LINES_CSV, line_cols, updated_lines)
    lines_2026 = [r for r in updated_lines if r.get("invoice_year") == "2026"]
    removed = repair_mod.merge_history(lines_2026)

    print(f"2026 MATCHED OBSERVATIONS VERIFIED = {verified}")
    print(f"2026 PRICE ROWS CORRECTED = {corrected}")
    print(f"HISTORY 2026 ROWS REPLACED = {removed}")
    print("2026 STAGING UPDATED = YES")


if __name__ == "__main__":
    main()
