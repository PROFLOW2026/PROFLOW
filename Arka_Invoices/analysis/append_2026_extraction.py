#!/usr/bin/env python3
"""Extract all 2026 main ERCO invoices via coordinate table-row parser (no stack heuristics)."""

from __future__ import annotations

import csv
import importlib.util
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices")
DATASET = ROOT / "dataset"
ANALYSIS = ROOT / "analysis"
MAIN_2026 = ROOT / "main_invoices" / "2026"
INDEX_PATH = ROOT / "metadata" / "main_invoices_index.csv"
LINES_CSV = DATASET / "invoice_lines_staging.csv"
HEADERS_CSV = DATASET / "invoice_headers_staging.csv"
PRICE_HISTORY = DATASET / "product_price_history.csv"
PRODUCT_MASTER = DATASET / "product_master.csv"

SCRIPTS = Path(r"C:\Users\ERAN YOSEF\Desktop\final projects\FINAL-WEB\projectflow\scripts")


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


extract_mod = load_module("extract_invoice_lines_full", SCRIPTS / ".extract-invoice-lines-full.py")
normalize_mod = load_module("normalize_arka_products", SCRIPTS / ".normalize-arka-products.py")
coord_parser = load_module("erco_coord_parser", SCRIPTS / "erco_coord_parser.py")

import pymupdf as fitz  # noqa: E402

ERCO_2026_FMT = "FORMAT_ERCO_2026"


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


def load_2026_jobs() -> list[Any]:
    jobs: list[Any] = []
    with INDEX_PATH.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("year") != "2026" or row.get("status") != "SELECTED":
                continue
            saved = row.get("selected_invoice_saved_name", "")
            path = MAIN_2026 / saved
            if not path.is_file():
                matches = list(ROOT.rglob(saved))
                path = matches[0] if matches else path
            if not path.is_file():
                continue
            digest = extract_mod.sha256_file(path)
            text_class = extract_mod.classify_pdf(path)
            jobs.append(
                extract_mod.InvoiceJob(row=row, path=path, sha256=digest, text_class=text_class)
            )
    return jobs


def _parsed_line_to_dict(pl: Any) -> dict[str, Any]:
    return {
        "page": pl.page,
        "delivery_doc_ref": pl.delivery_doc_ref,
        "item_code": pl.item_code,
        "raw_description": pl.raw_description,
        "quantity": pl.quantity,
        "unit": pl.unit,
        "unit_price_net": pl.unit_price_net,
        "discount_percent": pl.discount_percent,
        "line_total_net": pl.line_total_net,
        "line_no": pl.line_no,
        "unit_price_gross": getattr(pl, "unit_price_gross", ""),
        "extraction_confidence": pl.extraction_confidence,
        "notes": pl.notes or "coord_table_row",
    }


def extract_invoice_table_rows(job: Any) -> tuple[dict[str, str], list[dict[str, Any]], str]:
    """2026 extraction: coordinate table-row parser only."""
    doc = fitz.open(job.path)
    parsed_items: list[dict[str, Any]] = []
    pages_text: list[str] = []
    fmt = ERCO_2026_FMT
    try:
        for i in range(len(doc)):
            page = doc[i]
            text = page.get_text("text")
            pages_text.append(text)
            coord_lines = coord_parser.parse_page_lines(page, i + 1, ERCO_2026_FMT, "standard")
            for pl in coord_lines:
                parsed_items.append(_parsed_line_to_dict(pl))
    finally:
        doc.close()

    full_text = "\n".join(pages_text)
    header = extract_mod.parse_header(full_text)
    header_row = {
        "invoice_date": header.get("invoice_date", job.row.get("message_date", "")[:10]),
        "invoice_number": header.get("invoice_number", ""),
        "invoice_year": job.row.get("year", "2026"),
        "source_file": str(job.path.relative_to(ROOT)),
        "source_sha256": job.sha256,
        "format_family": fmt,
        "supplier_name": header.get("supplier_name", ""),
        "supplier_tax_id": header.get("supplier_tax_id", ""),
        "customer_name": header.get("customer_name", ""),
        "subtotal_net": header.get("subtotal_net", ""),
        "vat": header.get("vat", ""),
        "total_gross": header.get("total_gross", ""),
        "selection_confidence": job.row.get("confidence", ""),
        "extraction_confidence": "HIGH" if parsed_items else "LOW",
        "notes": job.text_class,
    }

    line_rows: list[dict[str, Any]] = []
    for it in parsed_items:
        qf = extract_mod.to_float(it.get("quantity", ""))
        lf = extract_mod.to_float(it.get("line_total_net", ""))
        is_neg = "yes" if ((qf is not None and qf < 0) or (lf is not None and lf < 0)) else "no"
        row_stub = {
            "quantity": it.get("quantity", ""),
            "unit_price_net": it.get("unit_price_net", ""),
            "discount_percent": it.get("discount_percent", ""),
            "line_total_net": it.get("line_total_net", ""),
            "extraction_confidence": it.get("extraction_confidence", "MEDIUM"),
        }
        conf, vstat, reason, vdiff = extract_mod.validate_line_row(row_stub)
        line_rows.append(
            {
                "invoice_date": header_row["invoice_date"],
                "invoice_number": header_row["invoice_number"],
                "invoice_year": header_row["invoice_year"],
                "source_file": header_row["source_file"],
                "source_sha256": job.sha256,
                "format_family": fmt,
                "selection_confidence": job.row.get("confidence", ""),
                "page": str(it.get("page", "")),
                "delivery_doc_ref": it.get("delivery_doc_ref", ""),
                "item_code": it.get("item_code", ""),
                "raw_description": it.get("raw_description", ""),
                "normalized_description_placeholder": "",
                "quantity": it.get("quantity", ""),
                "unit": it.get("unit", ""),
                "unit_price_net": it.get("unit_price_net", ""),
                "discount_percent": it.get("discount_percent", ""),
                "line_total_net": it.get("line_total_net", ""),
                "vat_rate_if_available": "",
                "is_negative_line": is_neg,
                "extraction_confidence": conf,
                "validation_status": vstat,
                "validation_reason_code": reason,
                "validation_difference": vdiff,
                "notes": f"{fmt};{it.get('notes', '')}",
            }
        )
    return header_row, line_rows, fmt


def extract_2026() -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    jobs = load_2026_jobs()
    process_jobs, _dup = extract_mod.apply_deduplication(jobs)
    queue = [j for j in process_jobs if j.text_class in {"TEXT_NATIVE", "MIXED"}]
    headers: list[dict[str, Any]] = []
    lines: list[dict[str, Any]] = []
    parsed_invoices = 0
    for job in queue:
        header, line_rows, _fmt = extract_invoice_table_rows(job)
        headers.append(header)
        lines.extend(line_rows)
        parsed_invoices += 1
    return headers, lines, parsed_invoices


def merge_staging(new_headers: list[dict[str, Any]], new_lines: list[dict[str, Any]]) -> tuple[int, int]:
    line_cols, old_lines = load_csv(LINES_CSV)
    header_cols, old_headers = load_csv(HEADERS_CSV)
    kept_lines = [r for r in old_lines if r.get("invoice_year") != "2026"]
    kept_headers = [r for r in old_headers if r.get("invoice_year") != "2026"]
    removed_lines = len(old_lines) - len(kept_lines)
    removed_headers = len(old_headers) - len(kept_headers)
    write_csv(LINES_CSV, line_cols, kept_lines + new_lines)
    write_csv(HEADERS_CSV, header_cols, kept_headers + new_headers)
    return removed_lines, removed_headers


def build_2026_history_rows(
    new_lines: list[dict[str, Any]], prior_history: list[dict[str, str]]
) -> list[dict[str, str]]:
    """Normalize 2026 lines; outlier bounds from pre-2026 history only."""
    _, master_rows = load_csv(PRODUCT_MASTER)
    sku_conflict = {r["item_code"] for r in master_rows if r.get("sku_conflict") == "yes"}

    usable_by_code: dict[str, list[float]] = defaultdict(list)
    canon_by_code: dict[str, str] = {}
    for row in prior_history:
        code = (row.get("item_code") or "").strip()
        if not code:
            continue
        if row.get("canonical_description"):
            canon_by_code.setdefault(code, row["canonical_description"])
        if row.get("price_observation_usable") == "YES":
            up = normalize_mod.to_float(row.get("unit_price_net", ""))
            if up is not None:
                usable_by_code[code].append(up)

    outlier_bounds: dict[str, tuple[float, float]] = {}
    mad_bounds: dict[str, tuple[float, float]] = {}
    for code, prices in usable_by_code.items():
        if len(prices) >= 4:
            outlier_bounds[code] = normalize_mod.iqr_outlier_bounds(prices)
            med = statistics.median(prices)
            m = normalize_mod.mad(prices)
            mad_bounds[code] = (med - 3 * m, med + 3 * m) if m > 0 else (-math.inf, math.inf)

    history_columns = [
        "invoice_date",
        "invoice_year",
        "invoice_number",
        "normalized_product_key",
        "item_code",
        "raw_description",
        "canonical_description",
        "product_family",
        "quantity",
        "unit",
        "unit_price_net",
        "line_total_net",
        "discount_percent",
        "validation_status",
        "extraction_confidence",
        "price_observation_usable",
        "exclusion_reason",
        "price_outlier",
        "source_file",
    ]

    out: list[dict[str, str]] = []
    for row in new_lines:
        code = (row.get("item_code") or "").strip()
        cleaned = normalize_mod.clean_description(row.get("raw_description", ""))
        attrs = normalize_mod.extract_attributes(row.get("raw_description", ""), row.get("unit", ""))
        ambiguous = normalize_mod.is_ambiguous(attrs, cleaned)
        usable, exclusion = normalize_mod.price_usability(row, code in sku_conflict, ambiguous)
        up = normalize_mod.to_float(row.get("unit_price_net", ""))
        price_outlier = "NO"
        if usable == "YES" and up is not None and code in outlier_bounds:
            lo, hi = outlier_bounds[code]
            lo_m, hi_m = mad_bounds.get(code, (-math.inf, math.inf))
            if up < lo or up > hi or up < lo_m or up > hi_m:
                price_outlier = "YES"
        canon = canon_by_code.get(code) or normalize_mod.canonical_description([cleaned])
        out.append(
            {
                "invoice_date": row.get("invoice_date", ""),
                "invoice_year": row.get("invoice_year", "2026"),
                "invoice_number": row.get("invoice_number", ""),
                "normalized_product_key": normalize_mod.normalized_product_key(code) if code else "",
                "item_code": code,
                "raw_description": row.get("raw_description", ""),
                "canonical_description": canon,
                "product_family": attrs.product_family,
                "quantity": row.get("quantity", ""),
                "unit": row.get("unit", ""),
                "unit_price_net": row.get("unit_price_net", ""),
                "line_total_net": row.get("line_total_net", ""),
                "discount_percent": row.get("discount_percent", ""),
                "validation_status": row.get("validation_status", ""),
                "extraction_confidence": row.get("extraction_confidence", ""),
                "price_observation_usable": usable,
                "exclusion_reason": exclusion,
                "price_outlier": price_outlier,
                "source_file": row.get("source_file", ""),
            }
        )
    return [{k: r.get(k, "") for k in history_columns} for r in out]


def merge_history(new_lines: list[dict[str, Any]]) -> int:
    hist_cols, old_hist = load_csv(PRICE_HISTORY)
    prior_non_2026 = [r for r in old_hist if r.get("invoice_year") != "2026"]
    removed = len(old_hist) - len(prior_non_2026)
    new_hist = build_2026_history_rows(new_lines, prior_non_2026)
    write_csv(PRICE_HISTORY, hist_cols, prior_non_2026 + new_hist)
    return removed


def main() -> None:
    print("Extracting 2026 main invoices (coordinate table rows)...")
    headers, lines, parsed = extract_2026()
    print(f"2026 INVOICES PARSED = {parsed}")
    print(f"2026 INVOICE LINES EXTRACTED = {len(lines)}")

    removed_l, removed_h = merge_staging(headers, lines)
    removed_hist = merge_history(lines)
    print(f"STAGING 2026 ROWS REPLACED = {removed_l} -> {len(lines)} lines")
    print(f"HEADERS 2026 ROWS REPLACED = {removed_h} -> {len(headers)} headers")
    print(f"HISTORY 2026 ROWS REPLACED = {removed_hist} -> {len(lines)} lines")
    print("2026 DATASET UPDATED = YES")

    import extract_requested_product_price_ranges as report_mod  # noqa: E402

    report_mod.main()


if __name__ == "__main__":
    main()
