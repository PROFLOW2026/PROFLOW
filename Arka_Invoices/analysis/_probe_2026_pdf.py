#!/usr/bin/env python3
import sys
from pathlib import Path

sys.path.insert(0, r"C:\Users\ERAN YOSEF\Desktop\final projects\FINAL-WEB\projectflow\scripts")
import erco_coord_parser as cp
import pymupdf as fitz

att = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\attachments\2026")
main = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\main_invoices\2026")

for label, folder in [("main", main), ("att", att)]:
    for p in sorted(folder.glob("*.pdf"))[:2]:
        doc = fitz.open(p)
        text = doc[0].get_text("text")
        fmt = cp.detect_format_family_doc(doc)
        variant = cp.detect_layout_variant(doc, fmt)
        lines = cp.parse_page_lines(doc[0], 1, fmt, variant)
        print("===", label, p.name[:70])
        print("fmt", fmt, "variant", variant, "lines", len(lines))
        print(text[:1200].replace("\n", " | "))
        if lines:
            print("first line", lines[0])
        doc.close()

# find attachment with target SKU in text
targets = ["55022", "55032", "5951041", "8600003", "3916104"]
for p in att.glob("*.pdf"):
    doc = fitz.open(p)
    text = doc[0].get_text("text")
    doc.close()
    if any(t in text for t in targets):
        print("FOUND SKU in", p.name)
        break
else:
    print("No target SKU in any attachment text")
