#!/usr/bin/env python3
"""Scan staging for product-family SKUs and year coverage."""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path

import extract_requested_product_price_ranges as m

STAGING = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\dataset\invoice_lines_staging.csv")
MAIN = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\main_invoices")

PVC = re.compile(r"PVC|קשיח", re.I)
WIRE_15 = re.compile(r"1\.?5\s*חוט|חוט\s*1\.?5|חום1\.5|כחול1\.5|צ/י1\.5|צהוב/ירוק1\.5", re.I)
WIRE_25 = re.compile(r"2\.?5\s*חוט|חוט\s*2\.?5|חום2\.5|כחול2\.5|צ/י2\.5", re.I)
MARICHAV = re.compile(r"מריכ", re.I)
MARICHAV_BO = re.compile(r"שחור\s*/\s*כתום|שחור/כתום", re.I)
MARICHAV_COLOR = re.compile(r"ירוק|לבן|צבעוני|אדום|כחול|צהוב", re.I)
CONCRETE = re.compile(r'תה"ט|מחוזק|לבטון|תחת\s*הטיח', re.I)


def load_rows() -> list[m.Row]:
    return [m.normalize_staging_row(r) for r in csv.DictReader(STAGING.open(encoding="utf-8-sig"))]


def usable(r: m.Row) -> bool:
    if m.base_exclusions(r):
        return False
    p = m.parse_float(r.get("unit_price_net", ""))
    return p is not None and p > 0


def sku_counts(rows: list[m.Row], pred) -> dict[str, int]:
    out: dict[str, int] = defaultdict(int)
    for r in rows:
        if not usable(r) or not pred(r):
            continue
        out[m.norm(r.get("item_code", ""))] += 1
    return dict(sorted(out.items(), key=lambda x: -x[1]))


def match_wire_15(r: m.Row) -> bool:
    raw = m.norm(r.get("raw_description", ""))
    if "נחושת" in raw or "רמקול" in raw:
        return False
    if re.search(r"2\.5", raw):
        return False
    return bool(WIRE_15.search(raw) and PVC.search(raw))


def match_wire_25(r: m.Row) -> bool:
    raw = m.norm(r.get("raw_description", ""))
    if "נחושת" in raw or "רמקול" in raw:
        return False
    return bool(WIRE_25.search(raw) and PVC.search(raw))


def match_marichav_bo(r: m.Row, dia: str) -> bool:
    raw = m.norm(r.get("raw_description", ""))
    if not MARICHAV.search(raw) or not re.search(rf"\b{dia}\b|{dia}\s*צינור|צינור\s*{dia}", raw):
        return False
    return bool(MARICHAV_BO.search(raw))


def match_marichav_color(r: m.Row, dia: str) -> bool:
    raw = m.norm(r.get("raw_description", ""))
    if not MARICHAV.search(raw) or not re.search(rf"\b{dia}\b|{dia}\s*צינור|צינור\s*{dia}|ירוק{dia}|לבן{dia}", raw):
        return False
    if MARICHAV_BO.search(raw):
        return False
    return bool(MARICHAV_COLOR.search(raw))


def match_concrete(r: m.Row, places: str) -> bool:
    raw = m.norm(r.get("raw_description", ""))
    canon = m.norm(r.get("normalized_description_placeholder", ""))
    blob = f"{raw} {canon}"
    if not CONCRETE.search(blob):
        return False
    if not re.search(rf"{places}\s*מודול|מודול\s*{places}|{places}\s*קופ|מוד{places}", blob, re.I):
        return False
    if re.search(r"פטנט\s*גבס|840001812|840001802", raw, re.I) and 'תה"ט' not in raw:
        return False
    return True


def match_cable(r: m.Row, size_rx: re.Pattern[str], primary: str) -> bool:
    code = m.norm(r.get("item_code", ""))
    blob = m.text_blob(r)
    if code != primary and not (size_rx.search(blob) and re.search(r"N2XY|כבל", blob, re.I)):
        return False
    return bool(size_rx.search(blob) and re.search(r"N2XY|כבל", blob, re.I) and code.startswith("595"))


def year_stats(rows: list[m.Row], pred, year: int) -> dict:
    yr = [r for r in rows if m.norm(r.get("invoice_year", "")) == str(year) and usable(r) and pred(r)]
    inv = {m.norm(r.get("source_file", "")) for r in yr}
    skus = sorted({m.norm(r.get("item_code", "")) for r in yr})
    return {"found": bool(yr), "obs": len(yr), "invoices": len(inv), "skus": skus}


def main() -> None:
    rows = load_rows()
    pdfs = sum(1 for _ in MAIN.rglob("*.pdf"))
    print(f"PDFs={pdfs} rows={len(rows)}")

    families = {
        "wire15": match_wire_15,
        "wire25": match_wire_25,
        "pipe20bo": lambda r: match_marichav_bo(r, "20"),
        "pipe25bo": lambda r: match_marichav_bo(r, "25"),
        "pipe20color": lambda r: match_marichav_color(r, "20"),
        "pipe25color": lambda r: match_marichav_color(r, "25"),
        "box3concrete": lambda r: match_concrete(r, "3"),
        "box4concrete": lambda r: match_concrete(r, "4"),
    }
    for name, pred in families.items():
        print(f"{name}: {sku_counts(rows, pred)}")

    print("\n2025 wire 2.5:")
    y = year_stats(rows, match_wire_25, 2025)
    print(y)
    for r in rows:
        if m.norm(r.get("invoice_year")) == "2025" and match_wire_25(r) and usable(r):
            print(
                " ",
                m.norm(r.get("item_code")),
                m.norm(r.get("raw_description", ""))[:55],
                r.get("unit_price_net"),
            )

    print("\n2025 concrete boxes:")
    for places, pred in [("3", lambda r: match_concrete(r, "3")), ("4", lambda r: match_concrete(r, "4"))]:
        y = year_stats(rows, pred, 2025)
        print(f" places={places}", y)


if __name__ == "__main__":
    main()
