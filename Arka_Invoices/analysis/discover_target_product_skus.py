#!/usr/bin/env python3
"""Discover candidate SKUs/descriptions for 23 target products from staging+history."""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path

import extract_requested_product_price_ranges as m

STAGING = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\dataset\invoice_lines_staging.csv")
HISTORY = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\dataset\product_price_history.csv")
MAIN = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\main_invoices")


def load_all_rows() -> list[m.Row]:
    return m.load_combined_rows()


def pdf_count() -> int:
    return sum(1 for _ in MAIN.rglob("*.pdf"))


def row_blob(r: m.Row) -> str:
    return m.text_blob(r)


# --- Discovery heuristics (description-first) ---

WIRE_15 = re.compile(r"1\.?5\s*חוט|חוט\s*1\.?5|חום1\.5|כחול1\.5|צ/י1\.5|צהוב/ירוק1\.5", re.I)
WIRE_25 = re.compile(r"2\.?5\s*חוט|חוט\s*2\.?5|חום2\.5|כחול2\.5|צ/י2\.5", re.I)
WIRE_PVC = re.compile(r"PVC|קשיח", re.I)

MARICHAV = re.compile(r"מריכ", re.I)
MARICHAV_BO = re.compile(r"שחור\s*/\s*כתום|שחור/כתום", re.I)
MARICHAV_COLOR = re.compile(r"ירוק|לבן|צבעוני|אדום|כחול|צהוב", re.I)

CONCRETE_BOX = re.compile(
    r'תה"ט|תחת\s*הטיח|לבטון|מחוזק|מודול\s*[34]\s*קופ|קופס[אה]\s*[34]\s*מודול',
    re.I,
)
PATENT_BOX = re.compile(r"פטנט|גבס", re.I)

CABLE_PATTERNS = {
    "כבל 3×1.5": (re.compile(r"3\s*[x×X]\s*1\.?5", re.I), re.compile(r"N2XY|כבל", re.I)),
    "כבל 3×2.5": (re.compile(r"3\s*[x×X]\s*2\.?5", re.I), re.compile(r"N2XY|כבל", re.I)),
    "כבל 5×1.5": (re.compile(r"5\s*[x×X]\s*1\.?5", re.I), re.compile(r"N2XY|כבל", re.I)),
    "כבל 5×2.5": (re.compile(r"5\s*[x×X]\s*2\.?5", re.I), re.compile(r"N2XY|כבל", re.I)),
    "כבל 5×10": (re.compile(r"5\s*[x×X]\s*10", re.I), re.compile(r"N2XY|כבל", re.I)),
}


def discover(rows: list[m.Row]) -> dict[str, dict]:
    out: dict[str, dict] = defaultdict(lambda: {"skus": set(), "samples": []})

    for r in rows:
        if m.base_exclusions(r):
            continue
        price = m.parse_float(r.get("unit_price_net", ""))
        if price is None or price <= 0:
            continue
        blob = row_blob(r)
        code = m.norm(r.get("item_code", ""))
        raw = m.norm(r.get("raw_description", ""))
        year = m.norm(r.get("invoice_year", ""))

        def add(product: str) -> None:
            out[product]["skus"].add(code)
            if len(out[product]["samples"]) < 3:
                out[product]["samples"].append(f"{year}|{code}|{raw[:70]}")

        # Wire 1.5
        if WIRE_15.search(blob) and WIRE_PVC.search(blob) and "נחושת" not in blob and "רמקול" not in blob:
            if not re.search(r"2\.5", blob):  # avoid 2.5 bleed
                add("חוט 1.5")

        # Wire 2.5
        if WIRE_25.search(blob) and WIRE_PVC.search(blob) and "נחושת" not in blob:
            add("חוט 2.5")

        # Marichav 20 BO
        if MARICHAV.search(blob) and re.search(r"\b20\b|20\s*צינור|צינור\s*20", blob):
            if MARICHAV_BO.search(blob) and not MARICHAV_COLOR.search(blob.replace("שחור/כתום", "").replace("שחור / כתום", "")):
                add("צינור מריכב 20 שחור/כתום")
            elif code in {"8600003"} or (MARICHAV_BO.search(blob)):
                if MARICHAV_BO.search(blob):
                    add("צינור מריכב 20 שחור/כתום")

        # Marichav 25 BO
        if MARICHAV.search(blob) and re.search(r"\b25\b|25\s*צינור|צינור\s*25", blob):
            if MARICHAV_BO.search(blob):
                add("צינור מריכב 25 שחור/כתום")

        # Marichav 20 colored
        if MARICHAV.search(blob) and re.search(r"\b20\b|20\s*צינור|צינור\s*20|ירוק20|לבן20", blob):
            if MARICHAV_BO.search(blob):
                pass
            elif MARICHAV_COLOR.search(blob) or code in {"8600103", "8600113"}:
                if not MARICHAV_BO.search(blob):
                    add("צינור מריכב 20 ירוק/צבעוני")

        # Marichav 25 colored
        if MARICHAV.search(blob) and re.search(r"\b25\b|25\s*צינור|צינור\s*25|ירוק25|לבן25", blob):
            if not MARICHAV_BO.search(blob) and (MARICHAV_COLOR.search(blob) or code in {"8600104", "8600114"}):
                add("צינור מריכב 25 ירוק/צבעוני")

        # Concrete boxes
        if CONCRETE_BOX.search(blob) and re.search(r"\b3\b|מודול\s*3|3\s*מודול", blob) and "פטנט" not in blob:
            if "גבס" not in raw or "תה" in raw:
                add("קופסה 3 מקום לבטון")
        if CONCRETE_BOX.search(blob) and re.search(r"\b4\b|מודול\s*4|4\s*מודול", blob) and "פטנט" not in blob:
            if "840001811" not in code:  # gypsum patent confusion
                add("קופסה 4 מקום לבטון")

        # Patent gypsum boxes
        if PATENT_BOX.search(blob) and re.search(r"\b3\b|תקן3|3\s*קופ", blob) and "בטון" not in blob:
            if re.search(r"פטנט|840001802|190041", blob):
                add("קופסה 3 מקום פטנט לגבס")
        if PATENT_BOX.search(blob) and re.search(r"\b4\b|תקן4|4\s*קופ|840001812", blob) and "בטון" not in blob:
            if re.search(r"פטנט\s*גבס|840001812|840001811", blob) and code != "190058":
                add("קופסה 4 מקום פטנט לגבס")

        # Cables
        for pname, (size_rx, cable_rx) in CABLE_PATTERNS.items():
            if size_rx.search(blob) and cable_rx.search(blob):
                add(pname)

        # Koros - use existing matchers
        if m.match_koros_socket(r):
            add("שקע קורוס")
        if m.match_koros_single(r):
            add("יחיד קורוס")
        if m.match_koros_interchange(r):
            add("חילוף קורוס")
        if m.match_koros_frame(r, "1"):
            add("מסגרת 1 מקום קורוס")
        if m.match_koros_frame(r, "2"):
            add("מסגרת 2 מקום קורוס")
        if m.match_koros_frame(r, "4"):
            add("מסגרת 4 מקום קורוס")
        if m.match_koros_adapter(r, "3"):
            add("מתאם 3 מקום קורוס")
        if m.match_koros_adapter(r, "4"):
            add("מתאם 4 מקום קורוס")

    return out


def main() -> None:
    rows = load_all_rows()
    print(f"PDFs={pdf_count()} staging+history rows={len(rows)}")
    disc = discover(rows)
    for pname in sorted(disc):
        skus = sorted(disc[pname]["skus"])
        print(f"\n{pname}: {len(skus)} SKUs")
        print("  " + ", ".join(skus))
        for s in disc[pname]["samples"]:
            print(f"    {s}")


if __name__ == "__main__":
    main()
