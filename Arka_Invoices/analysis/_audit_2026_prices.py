import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import extract_requested_product_price_ranges as m

ROOT = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices")
rows = [
    r
    for r in csv.DictReader((ROOT / "dataset" / "invoice_lines_staging.csv").open(encoding="utf-8-sig"))
    if r.get("invoice_year") == "2026"
]

focus = [
    "צינור מריכב 20 שחור/כתום",
    "כבל 3×2.5",
    "כבל 5×1.5",
    "שקע קורוס",
    "יחיד קורוס",
    "חילוף קורוס",
    "מסגרת 4 מקום קורוס",
    "מתאם 3 מקום קורוס",
    "מתאם 4 מקום קורוס",
]

all_matched = 0
all_ok = 0
open_findings = []

for spec in m.PRODUCTS:
    if spec.name not in focus:
        continue
    res = m.select_rows(m.load_combined_rows(), spec)
    print("===", spec.name, res.yearly.get(2026, "NO DATA"))
    for r in rows:
        if not spec.matcher(r):
            continue
        if not m.is_usable_primary(r):
            continue
        all_matched += 1
        p = m.parse_float(r.get("unit_price_net"))
        q = m.parse_float(r.get("quantity"))
        t = m.parse_float(r.get("line_total_net"))
        ok = p and q and t and abs(q * p - t) / t < 0.03
        if ok:
            all_ok += 1
        else:
            open_findings.append(f"{spec.name} {r['invoice_number']} {r['item_code']}")
        print(f"  {'OK' if ok else 'BAD'} inv={r['invoice_number']} p={p} q={q} t={t}")

print("---")
print("MATCHED USABLE", all_matched, "RECONCILE OK", all_ok, "FINDINGS", len(open_findings))
