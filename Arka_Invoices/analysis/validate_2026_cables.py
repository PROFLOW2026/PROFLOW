#!/usr/bin/env python3
"""Validate all 2026 cable/wire SKUs against coordinate table-row parser output."""

from __future__ import annotations

import csv
import importlib.util
import sys
from pathlib import Path

ROOT = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices")
MAIN_2026 = ROOT / "main_invoices" / "2026"
SCRIPTS = Path(r"C:\Users\ERAN YOSEF\Desktop\final projects\FINAL-WEB\projectflow\scripts")

CABLE_SKUS = {
    "55022": "wire 1.5",
    "55032": "wire 2.5",
    "5951021": "cable 3×1.5",
    "5951061": "cable 3×2.5",
    "5951041": "cable 5×1.5",
    "5951081": "cable 5×2.5",
    "5952040": "cable 5×10",
}


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


cp = load_module("erco_coord_parser", SCRIPTS / "erco_coord_parser.py")
import pymupdf as fitz  # noqa: E402


def main() -> None:
    by_sku: dict[str, list[dict[str, str]]] = {k: [] for k in CABLE_SKUS}
    pdf_count = 0

    for pdf in sorted(MAIN_2026.glob("*.pdf")):
        pdf_count += 1
        doc = fitz.open(pdf)
        inv = ""
        text = doc[0].get_text("text")
        for ln in text.splitlines():
            if "25342" in ln or "253425" in ln or "253426" in ln:
                m = __import__("re").search(r"(25342\d+)", ln)
                if m:
                    inv = m.group(1)
                    break
        for pi in range(len(doc)):
            for pl in cp.parse_page_lines(doc[pi], pi + 1, "FORMAT_ERCO_2026", "standard"):
                if pl.item_code not in CABLE_SKUS:
                    continue
                by_sku[pl.item_code].append(
                    {
                        "invoice": inv,
                        "sku": pl.item_code,
                        "description": pl.raw_description[:60],
                        "qty": pl.quantity,
                        "unit": pl.unit,
                        "gross": pl.unit_price_gross,
                        "discount": pl.discount_percent,
                        "net": pl.unit_price_net,
                        "total": pl.line_total_net,
                        "delivery": pl.delivery_doc_ref,
                        "confidence": pl.extraction_confidence,
                        "notes": pl.notes,
                    }
                )
        doc.close()

    print(f"2026 PDFS SCANNED = {pdf_count}")
    all_match = True
    for sku, label in CABLE_SKUS.items():
        rows = by_sku[sku]
        print(f"\n{sku} ({label}) occurrences = {len(rows)}")
        for r in rows:
            ok = r["confidence"] == "HIGH" and "PASS" in r["notes"]
            if not ok:
                all_match = False
            print(
                f"  {r['invoice']} / {r['sku']} / {r['description']} / "
                f"qty={r['qty']} {r['unit']} / gross={r['gross']} / disc={r['discount']}% / "
                f"net={r['net']} / total={r['total']} / {'OK' if ok else 'CHECK'}"
            )

    print(f"\nALL 2026 CABLE ROWS MATCH PDF TABLE COLUMNS = {'YES' if all_match else 'NO'}")


if __name__ == "__main__":
    main()
