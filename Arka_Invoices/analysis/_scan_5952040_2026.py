#!/usr/bin/env python3
import csv
import re
from pathlib import Path

import pymupdf as fitz

ROOT = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices")
MAIN = ROOT / "main_invoices" / "2026"
INDEX = ROOT / "metadata" / "main_invoices_index.csv"

with INDEX.open(encoding="utf-8-sig") as f:
    names = [
        r["selected_invoice_saved_name"]
        for r in csv.DictReader(f)
        if r.get("year") == "2026" and r.get("status") == "SELECTED"
    ]

print("SELECTED", len(names))
for name in sorted(names):
    pdf = MAIN / name
    if not pdf.is_file():
        continue
    doc = fitz.open(pdf)
    for pi in range(len(doc)):
        t = doc[pi].get_text("text")
        if "5952040" not in t and not re.search(r"5\s*[x×X]\s*10", t, re.I):
            continue
        lines = [ln.strip() for ln in t.splitlines() if ln.strip()]
        for i, ln in enumerate(lines):
            if "5952040" in ln or re.search(r"5\s*[x×X]\s*10", ln, re.I):
                print(f"\n{name} p{pi+1} L{i}: {ln[:100]}")
                for k in range(max(0, i - 3), min(len(lines), i + 8)):
                    print(f"  {k:4d}| {lines[k]}")
    doc.close()
