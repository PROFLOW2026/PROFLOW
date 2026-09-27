#!/usr/bin/env python3
"""One-off Koros SKU audit for product-identity review."""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path

import extract_requested_product_price_ranges as m

STAGING = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\dataset\invoice_lines_staging.csv")

KOROS_PRODUCTS = [
    ("שקע קורוס", m.match_koros_socket),
    ("יחיד קורוס", m.match_koros_single),
    ("חילוף קורוס", m.match_koros_interchange),
    ("מסגרת 1 מקום קורוס", lambda r: m.match_koros_frame(r, "1")),
    ("מסגרת 2 מקום קורוס", lambda r: m.match_koros_frame(r, "2")),
    ("מסגרת 4 מקום קורוס", lambda r: m.match_koros_frame(r, "4")),
    ("מתאם 3 מקום קורוס", lambda r: m.match_koros_adapter(r, "3")),
    ("מתאם 4 מקום קורוס", lambda r: m.match_koros_adapter(r, "4")),
]

VARIANT = re.compile(
    r'מ"מ|מ״מ|מוגן\s*מים|water\s*resist|waterproof|\bIP\d{2}\b|protected\s*variant',
    re.I,
)


def main() -> None:
    rows = list(csv.DictReader(STAGING.open(encoding="utf-8-sig")))
    norm_rows = [m.normalize_staging_row(r) for r in rows]

    sku_hits: dict[str, set[str]] = defaultdict(set)
    for r in norm_rows:
        code = m.norm(r.get("item_code", ""))
        if code.startswith("391"):
            sku_hits[code].add(m.norm(r.get("raw_description", ""))[:100])

    print("=== ALL 391* SKUs with sample descriptions ===")
    for code in sorted(sku_hits):
        samples = list(sku_hits[code])[:1]
        is_var = any(VARIANT.search(s) for s in sku_hits[code])
        print(f"{code}\tvariant={is_var}\tn={len(sku_hits[code])}\t{samples[0][:80] if samples else ''}")

    print("\n=== CURRENT MATCHER: SKUs per product ===")
    errors: list[str] = []
    for name, matcher in KOROS_PRODUCTS:
        matched = [r for r in norm_rows if matcher(r)]
        skus = sorted({m.norm(r.get("item_code", "")) for r in matched})
        variant_rows = [r for r in matched if m.koros_is_non_standard_variant_row(r)]
        if "3916704" in skus and name == "מסגרת 4 מקום קורוס":
            errors.append(f"{name}: still includes SKU 3916704")
        if variant_rows:
            errors.append(f"{name}: {len(variant_rows)} non-standard variant row(s) still matched")
        print(f"{name}: skus={skus} rows={len(matched)} variant_desc_rows={len(variant_rows)}")

    print("\n=== MAPPING ERRORS ===")
    if errors:
        for e in errors:
            print(e)
    else:
        print("none")


if __name__ == "__main__":
    main()
