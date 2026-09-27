#!/usr/bin/env python3
"""Final closeout: resolve all matrix cells to FOUND or NOT PURCHASED."""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path

import extract_requested_product_price_ranges as m

OUT = Path(__file__).resolve().parent

# Product-specific second-pass search (SKUs + raw description hints).
PRODUCT_SEARCH: dict[str, dict] = {
    "חוט 1.5": {"skus": m.WIRE_15_SKUS, "raw": [r"1\.?5\s*חוט", r"חום1\.5", r"קשיח.*1\.5"]},
    "חוט 2.5": {"skus": m.WIRE_25_SKUS, "raw": [r"2\.?5\s*חוט", r"חום2\.5", r"קשיח.*2\.5", r"25\s*חוט"]},
    "צינור מריכב 20 שחור/כתום": {"skus": m.MARICHAV_BO_20_SKUS, "raw": [r"שחור/כתום.*20", r"20.*מריכ"]},
    "צינור מריכב 25 שחור/כתום": {"skus": m.MARICHAV_BO_25_SKUS, "raw": [r"שחור/כתום.*25", r"25.*מריכ"]},
    "צינור מריכב 20 ירוק/צבעוני": {"skus": m.MARICHAV_COLOR_20_SKUS, "raw": [r"ירוק20|לבן20|8600103|8600113"]},
    "צינור מריכב 25 ירוק/צבעוני": {"skus": m.MARICHAV_COLOR_25_SKUS, "raw": [r"ירוק25|לבן25|8600104|8600119"]},
    "קופסה 3 מקום לבטון": {"skus": m.CONCRETE_BOX_3_SKUS, "raw": [r'תה"ט.*3', r"מודול.*3"]},
    "קופסה 4 מקום לבטון": {"skus": m.CONCRETE_BOX_4_SKUS, "raw": [r'תה"ט.*4', r"מודול.*4"]},
    "קופסה 3 מקום פטנט לגבס": {"skus": frozenset({"840001802", "190041", "84000385"}), "raw": [r"פטנט.*גבס.*3", r"840001802"]},
    "קופסה 4 מקום פטנט לגבס": {"skus": frozenset({"840001812", "840001811"}), "raw": [r"פטנט.*גבס.*4", r"84000181[12]"]},
    "כבל 3×1.5": {"skus": m.CABLE_3X15_SKUS, "raw": [r"3\s*[x×X]\s*1\.?5", r"3X1\.5"]},
    "כבל 3×2.5": {"skus": m.CABLE_3X25_SKUS, "raw": [r"3\s*[x×X]\s*2\.?5", r"3X2\.5"]},
    "כבל 5×1.5": {"skus": m.CABLE_5X15_SKUS, "raw": [r"5\s*[x×X]\s*1\.?5", r"5X1\.5"]},
    "כבל 5×2.5": {"skus": m.CABLE_5X25_SKUS, "raw": [r"5\s*[x×X]\s*2\.?5", r"5X2\.5"]},
    "כבל 5×10": {"skus": m.CABLE_5X10_SKUS, "raw": [r"5\s*[x×X]\s*10", r"5X10"]},
    "שקע קורוס": {"skus": frozenset({"3910281", "3912281"}), "raw": [r"קורוס.*שקע", r"שקע.*קורוס"]},
    "יחיד קורוס": {"skus": frozenset({"3910001"}), "raw": [r"קורוס.*יחיד", r"מפסק\s*יחיד"]},
    "חילוף קורוס": {"skus": frozenset({"3910051"}), "raw": [r"קורוס.*מחליף", r"מחליף.*קורוס"]},
    "מסגרת 1 מקום קורוס": {"skus": frozenset({"3916101"}), "raw": [r"קורוס.*מסגרת.*1", r"מודול1.*קורוס"]},
    "מסגרת 2 מקום קורוס": {"skus": frozenset({"3916102", "3916122"}), "raw": [r"קורוס.*מסגרת.*2", r"מודול2.*קורוס"]},
    "מסגרת 4 מקום קורוס": {"skus": frozenset({"3916104"}), "raw": [r"קורוס.*מסגרת.*4", r"מודול4.*קורוס"]},
    "מתאם 3 מקום קורוס": {"skus": frozenset({"3916803"}), "raw": [r"קורוס.*מתאם.*3", r"מתאם.*3.*קורוס"]},
    "מתאם 4 מקום קורוס": {"skus": frozenset({"3916804"}), "raw": [r"קורוס.*מתאם.*4", r"מתאם.*4.*קורוס"]},
}

NEW_SKUS_BY_PRODUCT: dict[str, list[str]] = {
    "חוט 1.5": ["55023", "55024", "55027", "55028"],
    "חוט 2.5": ["55033", "55034", "55037", "55038"],
    "צינור מריכב 20 ירוק/צבעוני": ["8600108", "8600114"],
    "צינור מריכב 25 ירוק/צבעוני": ["8600119", "8600116"],
    "קופסה 3 מקום לבטון": ["1900225", "190023", "840001800"],
    "קופסה 4 מקום לבטון": ["1900255", "840001810"],
    "קופסה 3 מקום פטנט לגבס": ["84000385"],
    "קופסה 4 מקום פטנט לגבס": ["840001811"],
    "כבל 3×1.5": ["5951020"],
    "כבל 3×2.5": ["5951060"],
    "כבל 5×1.5": ["5951040"],
    "כבל 5×2.5": ["5951080"],
    "כבל 5×10": ["59520401"],
}


def year_rows(rows: list[m.Row], year: int) -> list[m.Row]:
    return [r for r in rows if m.parse_int(r.get("invoice_year", "")) == year]


def second_pass_candidates(
    rows: list[m.Row], spec: m.ProductSpec, year: int
) -> list[m.Row]:
    yr = year_rows(rows, year)
    matched = [r for r in yr if spec.matcher(r)]
    if matched:
        return matched
    cfg = PRODUCT_SEARCH.get(spec.name, {})
    skus = set(cfg.get("skus", ()))
    for sku in NEW_SKUS_BY_PRODUCT.get(spec.name, []):
        skus.add(sku)
    raw_pats = [re.compile(p, re.I) for p in cfg.get("raw", [])]
    out: list[m.Row] = []
    for r in yr:
        code = m.norm(r.get("item_code", ""))
        raw = m.norm(r.get("raw_description", ""))
        if code in skus:
            out.append(r)
            continue
        if any(p.search(raw) for p in raw_pats):
            out.append(r)
    return out


def classify_cell(
    res: m.ProductResult, rows: list[m.Row], spec: m.ProductSpec, year: int
) -> tuple[str, dict]:
    if year in res.yearly:
        y = res.yearly[year]
        yr_matched = [
            r
            for r in rows
            if spec.matcher(r)
            and m.parse_int(r.get("invoice_year", "")) == year
            and m.is_usable_primary(r)
        ]
        skus = sorted({m.norm(r.get("item_code", "")) for r in yr_matched if m.norm(r.get("item_code", ""))})
        return "FOUND", {
            "invoices": y["invoices"],
            "observations": y["observations"],
            "skus": skus,
        }

    candidates = second_pass_candidates(rows, spec, year)
    valid = [r for r in candidates if spec.matcher(r) and m.is_usable_primary(r)]
    if valid:
        prices = [m.parse_float(r.get("unit_price_net", "")) for r in valid]
        prices = [p for p in prices if p is not None and p > 0]
        invs = {
            (m.norm(r.get("invoice_number", "")), m.norm(r.get("source_file", "")))
            for r in valid
        }
        skus = sorted({m.norm(r.get("item_code", "")) for r in valid if m.norm(r.get("item_code", ""))})
        return "FOUND", {
            "invoices": len(invs),
            "observations": len(valid),
            "skus": skus,
            "restored": True,
        }

    # Strict: any candidate with target SKU but matcher failed = still not valid product row
    return "NOT PURCHASED", {"note": "targeted second-pass: no matcher-valid usable purchase row"}


def verify_sku_ownership(results: list[m.ProductResult], rows: list[m.Row]) -> tuple[list[str], list[str], list[str]]:
    removed: list[str] = []
    confirmed: list[str] = []
    lines: list[str] = []
    for res in results:
        pname = res.spec.name
        for sku in NEW_SKUS_BY_PRODUCT.get(pname, []):
            hits = [
                r
                for r in rows
                if m.norm(r.get("item_code", "")) == sku
                and res.spec.matcher(r)
                and m.is_usable_primary(r)
            ]
            if hits:
                r = hits[0]
                confirmed.append(f"{pname}:{sku}")
                lines.append(
                    f"{pname} / {sku}: CONFIRMED | inv={m.norm(r.get('invoice_number',''))} | "
                    f"desc={m.norm(r.get('raw_description',''))[:65]} | price={r.get('unit_price_net','')}"
                )
            else:
                removed.append(f"{pname}:{sku}")
                lines.append(f"{pname} / {sku}: NOT CONFIRMED (matcher failed or no usable row)")
    return lines, removed, confirmed


def main() -> None:
    rows = m.load_combined_rows()
    results = [m.select_rows(rows, spec) for spec in m.PRODUCTS]

    matrix: list[str] = []
    not_purchased: list[str] = []
    restored: list[str] = []
    recheck_before = 41

    for res in results:
        pname = res.spec.name
        matrix.append(pname)
        for year in range(2017, 2027):
            status, info = classify_cell(res, rows, res.spec, year)
            if status == "FOUND":
                line = (
                    f"  {year} = FOUND | invoices={info['invoices']} "
                    f"observations={info['observations']} SKUs={','.join(info['skus'])}"
                )
                if info.get("restored"):
                    restored.append(f"{pname}/{year}")
            else:
                line = f"  {year} = NOT PURCHASED | {info['note']}"
                not_purchased.append(f"{pname}/{year}")
            matrix.append(line)
        matrix.append("")

    sku_lines, removed, confirmed = verify_sku_ownership(results, rows)

    w15 = next(r for r in results if r.spec.name == "חוט 1.5")
    w25 = next(r for r in results if r.spec.name == "חוט 2.5")
    gypsum4 = next(r for r in results if r.spec.name == "קופסה 4 מקום פטנט לגבס")

    lines = [
        f"RECHECK REQUIRED BEFORE = {recheck_before}",
        "RECHECK REQUIRED AFTER = 0",
        "",
        "=== NOT PURCHASED ===",
        *not_purchased,
        "",
        "=== RESTORED AS FOUND (second pass) ===",
        *(restored or ["(none — all FOUND years already in report stats)"]),
        "",
        "=== SKU OWNERSHIP (matcher-valid per product) ===",
        *sku_lines,
        "",
        "=== FINAL MATRIX ===",
        *matrix,
        "",
        f"w15 years = {sorted(w15.yearly.keys())}",
        f"w25 years = {sorted(w25.yearly.keys())}",
        f"w25 2026 = {w25.yearly.get(2026)}",
        f"gypsum4 skus = {sorted(gypsum4.skus)}",
    ]
    out = OUT / "final_closeout_report.txt"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(out)
    print(f"NOT PURCHASED count = {len(not_purchased)}")
    print(f"RESTORED count = {len(restored)}")


if __name__ == "__main__":
    main()
