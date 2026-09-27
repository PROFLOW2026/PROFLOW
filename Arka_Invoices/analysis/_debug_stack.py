import re
import pymupdf as fitz
from pathlib import Path

lines = [
    ln.strip().replace("\xa0", " ")
    for ln in fitz.open(
        r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\main_invoices\2026\2026-09-03__קרן-ממויה__הדפסת חשבונית מרכזת - 25342607485.pdf"
    )[0].get_text("text").splitlines()
    if ln.strip()
]
sku_index = 98
code = "3910281"
line_total = None
net_unit = None
after = lines[sku_index + 1 : sku_index + 8]
for idx, aln in enumerate(after):
    print("idx", idx, repr(aln))
    if re.search(r"(?:'|\")\s*יח", aln) and code not in aln:
        print("  BREAK yich")
        break
    if re.fullmatch(r"\d{1,2}", aln):
        print("  skip lineno")
        continue
    if re.fullmatch(r"[\d\.]+", aln):
        v = float(aln)
        if line_total is None:
            line_total = v
            print("  total", v)
        elif net_unit is None and v <= line_total:
            print("  set unit", v)
            net_unit = v
        continue
print("final", line_total, net_unit)
