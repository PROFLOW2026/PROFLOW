#!/usr/bin/env python3
"""Audit 2026 Koros rows for white vs non-white classification."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_requested_product_price_ranges as mod  # noqa: E402

rows = mod.load_combined_rows()
HIGH = 5.0

by_product: dict[str, list] = {name: [] for name in mod.KOROS_REPORT_PRODUCTS}
total_non_white_excluded = 0

for spec in mod.PRODUCTS:
    if spec.name not in mod.KOROS_REPORT_PRODUCTS:
        continue
    matched = [r for r in rows if spec.matcher(r)]
    for r in matched:
        if mod.norm(r.get("invoice_year", "")) != "2026":
            continue
        if not mod.is_usable_primary(r):
            continue
        price = mod.parse_float(r.get("unit_price_net", ""))
        if price is None or price <= 0:
            continue
        non_white = mod.koros_is_non_white_row(r)
        if non_white:
            total_non_white_excluded += 1
        entry = {
            "product": spec.name,
            "inv": r.get("invoice_number", ""),
            "sku": r.get("item_code", ""),
            "price": price,
            "raw": r.get("raw_description", "")[:80],
            "non_white": non_white,
        }
        by_product[spec.name].append(entry)

results = [mod.select_rows(rows, spec) for spec in mod.PRODUCTS if spec.name in mod.KOROS_REPORT_PRODUCTS]
total_excluded_report = sum(r.non_white_excluded for r in results)

white_high: list[str] = []
non_white_high: list[str] = []

for entries in by_product.values():
    for e in entries:
        if e["price"] < HIGH:
            continue
        line = (
            f"{e['product']} inv={e['inv']} SKU={e['sku']} {e['price']:.2f} ₪ "
            f"raw={e['raw']!r}"
        )
        if e["non_white"]:
            non_white_high.append(line)
        else:
            white_high.append(line)

print("TOTAL_NON_WHITE_EXCLUDED_ALL_YEARS", total_excluded_report)
print("---2026_BY_PRODUCT---")
for name in mod.KOROS_REPORT_PRODUCTS:
    entries = by_product[name]
    prices = [e["price"] for e in entries if not e["non_white"]]
    kept = [e for e in entries if not e["non_white"]]
    if not kept:
        print(name, "NO_2026")
        continue
    print(
        name,
        f"obs={len(kept)}",
        f"min={min(prices):.2f}",
        f"max={max(prices):.2f}",
        f"excluded_non_white={sum(1 for e in entries if e['non_white'])}",
    )

print("---WHITE_HIGH---")
for line in white_high:
    print(line)
print("---NON_WHITE_HIGH---")
for line in non_white_high:
    print(line)
