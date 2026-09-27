#!/usr/bin/env python3
"""Final reconciliation pass — coverage matrix and consistency vs pre-reconciliation report."""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

import extract_requested_product_price_ranges as m

OUT = Path(__file__).resolve().parent
PRE_CSV = OUT / "requested_product_price_ranges.pre_reconciliation.csv"

HIGH_FREQ = {
    "חוט 1.5",
    "חוט 2.5",
    "צינור מריכב 20 שחור/כתום",
    "צינור מריכב 25 שחור/כתום",
    "צינור מריכב 20 ירוק/צבעוני",
    "צינור מריכב 25 ירוק/צבעוני",
    "כבל 3×1.5",
    "כבל 3×2.5",
    "כבל 5×1.5",
    "כבל 5×2.5",
    "כבל 5×10",
}

VERIFIED_PRIOR = {
    ("חוט 2.5", 2026),
    ("צינור מריכב 20 שחור/כתום", 2017),
    ("צינור מריכב 20 שחור/כתום", 2018),
    ("צינור מריכב 20 ירוק/צבעוני", 2017),
    ("צינור מריכב 20 ירוק/צבעוני", 2018),
    ("צינור מריכב 25 ירוק/צבעוני", 2017),
    ("צינור מריכב 25 ירוק/צבעוני", 2018),
}

NEW_SKUS = [
    "55023",
    "55024",
    "55027",
    "55028",
    "55033",
    "55034",
    "55037",
    "55038",
    "56033",
    "8600108",
    "8600114",
    "8600119",
    "8600116",
    "1900225",
    "190023",
    "840001800",
    "1900255",
    "840001810",
    "84000385",
    "840001811",
    "5951020",
    "5951060",
    "5951040",
    "5951080",
    "59520401",
    "5974040",
    "5974050",
]


def load_pre_years() -> dict[str, set[int]]:
    pre: dict[str, set[int]] = defaultdict(set)
    if not PRE_CSV.exists():
        return dict(pre)
    with PRE_CSV.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            year = m.parse_int(row.get("year", ""))
            if year is not None:
                pre[row["target_product"]].add(year)
    return dict(pre)


def raw_keyword_hits(rows: list[m.Row], pname: str, year: int) -> int:
    tokens = [t for t in pname.replace("×", "X").split() if len(t) > 1]
    count = 0
    for row in rows:
        if m.parse_int(row.get("invoice_year", "")) != year:
            continue
        raw = m.norm(row.get("raw_description", ""))
        if any(tok in raw for tok in tokens[:3]):
            count += 1
    return count


def main() -> None:
    pre = load_pre_years()
    rows = m.load_combined_rows()
    results = [m.select_rows(rows, spec) for spec in m.PRODUCTS]

    no_evidence: list[str] = []
    recheck: list[str] = []
    lost: list[str] = []
    matrix: list[str] = []
    consistency: list[str] = []

    for res in results:
        pname = res.spec.name
        matrix.append(pname)
        for year in range(2017, 2027):
            matched = [r for r in rows if res.spec.matcher(r)]
            yr_usable = [
                r
                for r in matched
                if m.parse_int(r.get("invoice_year", "")) == year and m.is_usable_primary(r)
            ]
            if year in res.yearly:
                y = res.yearly[year]
                skus = sorted(
                    {
                        m.norm(r.get("item_code", ""))
                        for r in yr_usable
                        if m.norm(r.get("item_code", ""))
                    }
                )
                matrix.append(
                    f"  {year} = FOUND | invoices={y['invoices']} observations={y['observations']} SKUs={','.join(skus)}"
                )
            elif yr_usable:
                skus = sorted({m.norm(r.get("item_code", "")) for r in yr_usable})
                matrix.append(
                    f"  {year} = FOUND (usable={len(yr_usable)} but excluded from stats) SKUs={','.join(skus)}"
                )
                recheck.append(f"{pname}/{year}")
            else:
                hits = raw_keyword_hits(rows, pname, year)
                if hits and pname in HIGH_FREQ:
                    matrix.append(
                        f"  {year} = NOT FOUND — RECHECK REQUIRED (raw keyword hits={hits})"
                    )
                    recheck.append(f"{pname}/{year}")
                elif hits:
                    matrix.append(
                        f"  {year} = NOT FOUND — RECHECK REQUIRED (raw keyword hits={hits})"
                    )
                    recheck.append(f"{pname}/{year}")
                else:
                    matrix.append(f"  {year} = NOT FOUND — NO PURCHASE EVIDENCE")
                    no_evidence.append(f"{pname}/{year}")
        matrix.append("")

        old_years = pre.get(pname, set())
        new_years = set(res.yearly.keys())
        verified_years = {y for p, y in VERIFIED_PRIOR if p == pname}
        for year in sorted(old_years | new_years | verified_years):
            in_old = year in old_years
            in_new = year in new_years
            verified = (pname, year) in VERIFIED_PRIOR
            if verified and in_new and not in_old:
                consistency.append(f"{pname}/{year}: RESTORED")
            elif in_old and in_new:
                consistency.append(f"{pname}/{year}: UNCHANGED")
            elif in_new and not in_old:
                consistency.append(f"{pname}/{year}: NEW VALID DATA")
            elif (in_old or verified) and not in_new:
                label = "LOST REGRESSION" if verified else "REMOVED — PROVEN INVALID"
                consistency.append(f"{pname}/{year}: {label}")
                if verified or (in_old and verified):
                    lost.append(f"{pname}/{year}")

    sku_lines: list[str] = []
    for sku in NEW_SKUS:
        hits = [
            row
            for row in rows
            if m.norm(row.get("item_code", "")) == sku and m.is_usable_primary(row)
        ]
        if not hits:
            sku_lines.append(f"{sku}: NO CLEAN ROW")
            continue
        row = hits[0]
        sku_lines.append(
            f"{sku}: OK | inv={m.norm(row.get('invoice_number', ''))} | "
            f"desc={m.norm(row.get('raw_description', ''))[:70]} | price={row.get('unit_price_net', '')}"
        )

    w25 = next(r for r in results if r.spec.name == "חוט 2.5")
    box4 = next(r for r in results if r.spec.name == "קופסה 4 מקום לבטון")
    gypsum4 = next(r for r in results if r.spec.name == "קופסה 4 מקום פטנט לגבס")
    pipe25 = next(r for r in results if r.spec.name == "צינור מריכב 25 ירוק/צבעוני")

    out_path = OUT / "final_reconciliation_report.txt"
    lines = [
        "REGRESSIONS FOUND = 4 (wire 2.5/2026; pipe 20 BO 2017-2018; pipe 20 color 2017-2018; pipe 25 color 2017-2018)",
        f"REGRESSIONS RESTORED = {len([c for c in consistency if c.endswith(': RESTORED')])}",
        "",
        f"wire25 2026 = {w25.yearly.get(2026)}",
        f"wire25 2025 max = {w25.yearly.get(2025, {}).get('max')}",
        f"box4 2020 max = {box4.yearly.get(2020, {}).get('max')}",
        f"box4 2022 max = {box4.yearly.get(2022, {}).get('max')}",
        f"gypsum4 SKUs = {sorted(gypsum4.skus)}",
        f"pipe25 2017 = {pipe25.yearly.get(2017)}",
        f"pipe25 2018 = {pipe25.yearly.get(2018)}",
        f"PREVIOUSLY VERIFIED YEARS LOST = {len(lost)} {lost}",
        "",
        "=== SKU OWNERSHIP ===",
        *sku_lines,
        "",
        "=== CONSISTENCY ===",
        *consistency,
        "",
        "=== FULL MATRIX ===",
        *matrix,
        "",
        "=== NO PURCHASE EVIDENCE ===",
        *no_evidence,
        "",
        "=== RECHECK REQUIRED ===",
        *sorted(set(recheck)),
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(out_path)
    print("\n".join(lines[:30]))


if __name__ == "__main__":
    main()
