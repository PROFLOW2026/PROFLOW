"""Print PDF text context around a SKU on a 2026 invoice."""
import sys
from pathlib import Path

import pymupdf as fitz

ROOT = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices")
code = sys.argv[1]
inv = sys.argv[2]

pdfs = list((ROOT / "main_invoices" / "2026").glob(f"*{inv}*"))
if not pdfs:
    pdfs = list(ROOT.rglob(f"*{inv}*.pdf"))
pdf = pdfs[0]
print("PDF:", pdf.name)
doc = fitz.open(pdf)
for pi in range(len(doc)):
    t = doc[pi].get_text("text")
    if code not in t:
        continue
    lines = [ln.strip().replace("\xa0", " ") for ln in t.splitlines() if ln.strip()]
    print(f"--- page {pi + 1} ---")
    for i, ln in enumerate(lines):
        if code in ln:
            for k in range(max(0, i - 4), min(len(lines), i + 8)):
                print(f"{k:4d}| {lines[k]}")
            print()
doc.close()
