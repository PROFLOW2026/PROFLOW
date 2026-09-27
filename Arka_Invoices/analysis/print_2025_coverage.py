#!/usr/bin/env python3
import extract_requested_product_price_ranges as m

rows = m.load_combined_rows()
for spec in m.PRODUCTS:
    res = m.select_rows(rows, spec)
    y = res.yearly.get(2025)
    if y:
        print(f"{spec.name}: FOUND obs={y['observations']} inv={y['invoices']} skus={sorted(res.skus)}")
    else:
        print(f"{spec.name}: NOT FOUND")
