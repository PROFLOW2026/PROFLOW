#!/usr/bin/env python3
"""List Koros extreme price source rows for PDF audit."""
import sys

sys.path.insert(0, r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\analysis")
import extract_requested_product_price_ranges as m

TARGETS = {
    "שקע קורוס": [2.80, 6.45],
    "יחיד קורוס": [2.80, 6.45],
    "מסגרת 1 מקום קורוס": [2.56, 5.43],
    "מסגרת 2 מקום קורוס": [2.56, 5.13],
    "מסגרת 4 מקום קורוס": [3.95, 20.50, 21.50, 22.79, 22.788, 23.0, 25.0],
    "מתאם 3 מקום קורוס": [1.20, 2.61],
    "מתאם 4 מקום קורוס": [3.90, 6.00],
}

rows = m.load_combined_rows()
for name, prices in TARGETS.items():
    spec = next(s for s in m.PRODUCTS if s.name == name)
    print("===", name)
    for r in rows:
        if not spec.matcher(r) or not m.is_usable_primary(r):
            continue
        p = m.parse_float(r.get("unit_price_net", ""))
        if p is None:
            continue
        hit = any(abs(p - t) < 0.02 or (t == 22.79 and abs(p - 22.788) < 0.02) for t in prices)
        if not hit:
            continue
        print(
            f"  {p} | {r.get('invoice_year')} | inv={r.get('invoice_number')} | "
            f"sku={r.get('item_code')} | qty={r.get('quantity')} {r.get('unit')} | "
            f"disc={r.get('discount_percent')} | total={r.get('line_total_net')} | "
            f"desc={r.get('raw_description', '')[:80]} | file={r.get('source_file', '')}"
        )
