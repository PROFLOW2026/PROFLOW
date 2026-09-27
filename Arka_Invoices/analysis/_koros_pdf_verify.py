#!/usr/bin/env python3
"""Verify Koros extreme rows from PDF table geometry."""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pymupdf as fitz

sys.path.insert(0, r"C:\Users\ERAN YOSEF\Desktop\final projects\FINAL-WEB\projectflow\scripts")
import erco_coord_parser as cp

ROOT = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices")


def pdf_path(rel: str) -> Path:
    return ROOT / rel.replace("/", "\\")


def dump_sku_rows(rel: str, sku: str, *, net_hint: str = "") -> None:
    p = pdf_path(rel)
    if not p.is_file():
        print(f"MISSING {p}")
        return
    doc = fitz.open(p)
    fmt = cp.detect_format_family_doc(doc)
    var = cp.detect_layout_variant(doc, fmt)
    print(f"\nFILE={p.name} fmt={fmt}")
    for pi in range(len(doc)):
        page = doc[pi]
        text = page.get_text("text")
        if sku not in text:
            continue
        parsed = cp.parse_page_lines(page, pi + 1, fmt, var)
        for pl in parsed:
            if pl.item_code == sku:
                if not net_hint or net_hint in (pl.unit_price_net or ""):
                    print("  COORD:", pl)
        spans = cp._spans_from_page(page)
        rows = cp._cluster_rows(spans, 4.5)
        for row in rows:
            if not any(sku in s.text for s in row):
                continue
            yc = sum(s.yc for s in row) / len(row)
            parts = sorted(row, key=lambda s: s.x0)
            if net_hint and not any(net_hint in s.text for s in parts):
                # also show adjacent rows with net hint
                continue
            line = " | ".join(f"[{s.x0:.0f}]{s.text}" for s in parts)
            print(f"  y={yc:.1f} {line}")
    doc.close()


CASES = [
    ("main_invoices\\2023\\2023-01-01__מרי-גבאי__(מסמך ממוחשב) הדפסת חשבונית מרכזת - 25342210321.pdf", "3910281", "2.8"),
    ("main_invoices\\2022\\2022-01-30__קרן-ממויה__(מסמך ממוחשב) הדפסת חשבונית מרכזת - 25342200133.pdf", "3910281", "6.45"),
    ("main_invoices\\2023\\2023-01-01__מרי-גבאי__(מסמך ממוחשב) הדפסת חשבונית מרכזת - 25342210321.pdf", "3910001", "2.8"),
    ("main_invoices\\2021\\2021-12-30__קרן-ממויה__(מסמך ממוחשב) הדפסת חשבונית מרכזת - R34212510300.pdf", "3910001", "6.45"),
    ("main_invoices\\2024\\2024-09-03__קרן-ממויה__הדפסת חשבונית מרכזת - 25342407626_ חש.pdf", "3916101", "2.56"),
    ("main_invoices\\2024\\2024-05-05__קרן-ממויה__הדפסת חשבונית מרכזת - 25342403627.pdf", "3916101", "5.43"),
    ("main_invoices\\2024\\2024-09-03__קרן-ממויה__הדפסת חשבונית מרכזת - 25342407626_ חש.pdf", "3916102", "2.56"),
    ("main_invoices\\2022\\2022-03-01__קרן-ממויה__(מסמך ממוחשב) הדפסת חשבונית מרכזת - 25342201494.pdf", "3916102", "5.13"),
    ("main_invoices\\2021\\2021-05-03__קרן-ממויה__(מסמך ממוחשב) הדפסת חשבונית מרכזת - R34212502846.pdf", "3916704", "20.5"),
    ("main_invoices\\2021\\2021-07-30__קרן-ממויה__(מסמך ממוחשב) הדפסת חשבונית מרכזת - R34212505557.pdf", "3916704", "22.79"),
    ("main_invoices\\2024\\2024-08-01__קרן-ממויה__הדפסת חשבונית מרכזת - 25342406777_ חש.pdf", "3916704", "23"),
    ("main_invoices\\2023\\2023-09-03__קרן-ממויה__(מסמך ממוחשב) הדפסת חשבונית מרכזת - 25342308013.pdf", "3916704", "25"),
    ("main_invoices\\2021\\2021-07-30__קרן-ממויה__(מסמך ממוחשב) הדפסת חשבונית מרכזת - R34212505558.pdf", "3916104", "3.95"),
    ("main_invoices\\2023\\2023-01-01__מרי-גבאי__(מסמך ממוחשב) הדפסת חשבונית מרכזת - 25342210321.pdf", "3916803", "1.2"),
    ("main_invoices\\2020\\2020-10-25__קרן-ממויה__p5671601661.pdf", "3916803", "2.61"),
    ("main_invoices\\2023\\2023-12-05__קרן-ממויה__(מסמך ממוחשב) הדפסת חשבונית מרכזת - 25342311078.pdf", "3916804", "6"),
    ("main_invoices\\2021\\2021-07-04__קרן-ממויה__(מסמך ממוחשב) Hדפסת חשבונית מרכזת - R34212504462.pdf", "3916804", "3.9"),
]

if __name__ == "__main__":
    for rel, sku, hint in CASES:
        dump_sku_rows(rel, sku, net_hint=hint)
