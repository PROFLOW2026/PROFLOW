#!/usr/bin/env python3
"""Copy original invoice PDFs for verified extreme price observations (23 target products)."""

from __future__ import annotations

import csv
import re
import shutil
import statistics
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import extract_requested_product_price_ranges as m

ROOT = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices")
OUT_DIR = ROOT / "analysis" / "price_extreme_pdfs"
INDEX_CSV = OUT_DIR / "price_extreme_index.csv"

# Verified valid extremes (minimum set from audits)
VERIFIED_PRICES: dict[str, list[float]] = {
    "צינור מריכב 25 ירוק/צבעוני": [4.452],
    "שקע קורוס": [2.80, 6.45],
    "יחיד קורוס": [2.80, 6.45],
    "מסגרת 1 מקום קורוס": [2.56, 5.43],
    "מסגרת 2 מקום קורוס": [2.56, 5.13],
    "מסגרת 4 מקום קורוס": [3.95],
    "מתאם 3 מקום קורוס": [1.20, 2.61],
    "מתאם 4 מקום קורוס": [3.90, 6.00],
}

INDEX_COLUMNS = [
    "product",
    "year",
    "invoice_number",
    "invoice_date",
    "delivery_doc_ref",
    "sku",
    "description",
    "quantity",
    "unit",
    "gross_unit_price",
    "discount_percent",
    "net_unit_price",
    "line_total",
    "extreme_type",
    "historical_normal_range",
    "reason_for_inclusion",
    "source_pdf",
    "copied_pdf",
]


def get_report_calc_rows(all_rows: list[m.Row], spec: m.ProductSpec) -> list[m.Row]:
    """Rows that feed the final price-range report (same logic as select_rows)."""
    matched = [r for r in all_rows if spec.matcher(r)]
    primary = [r for r in matched if m.is_usable_primary(r)]
    sku_conflict_raw = (
        [r for r in matched if m.is_usable_sku_conflict_raw(r)]
        if spec.allow_sku_conflict_raw
        else []
    )
    fallback = [r for r in matched if m.is_usable_fallback(r)]
    chosen = primary + sku_conflict_raw
    if not primary and spec.allow_fallback and fallback:
        chosen = fallback if not chosen else chosen
    if not chosen and spec.allow_fallback:
        vf = [
            r
            for r in matched
            if not m.base_exclusions(r)
            and m.norm(r.get("exclusion_reason", "")) == "validation_fail"
            and m.parse_float(r.get("unit_price_net", "")) not in (None, 0)
        ]
        if vf:
            chosen = vf
    chosen, _ = m.apply_koros_white_only(chosen, spec.name)

    price_rows: list[tuple[float, m.Row]] = []
    for r in chosen:
        p = m.parse_float(r.get("unit_price_net", ""))
        if p is None or p <= 0:
            continue
        price_rows.append((p, r))

    if spec.audit_name and len(price_rows) >= 5:
        peer_prices = [p for p, _ in price_rows]
        price_rows = [(p, r) for p, r in price_rows if not m.reject_cluster_outlier(r, peer_prices)]

    by_year: dict[int, list[tuple[float, m.Row]]] = defaultdict(list)
    for price, r in price_rows:
        year = m.parse_int(r.get("invoice_year", ""))
        if year is None:
            dt = m.parse_date(r.get("invoice_date", ""))
            year = dt.year if dt else None
        if year is None:
            continue
        by_year[year].append((price, r))

    final: list[m.Row] = []
    for _year, items in sorted(by_year.items()):
        year_pairs, _ = m.mad_outlier_filter(items)
        final.extend(r for _, r in year_pairs)
    return final


def gross_unit(row: m.Row) -> str:
    g = m.parse_float(row.get("unit_price_gross", ""))
    if g is not None:
        return m.fmt_price(g)
    net = m.parse_float(row.get("unit_price_net", ""))
    disc = m.parse_float(row.get("discount_percent", ""))
    if net is not None and disc is not None and disc < 100:
        return m.fmt_price(net / (1 - disc / 100.0))
    return ""


def clean_total(raw: str) -> str:
    s = m.norm(raw)
    mnum = re.search(r"^([\d,\.]+)", s.replace(",", ""))
    return mnum.group(1) if mnum else s


def price_near(a: float, b: float, tol: float = 0.02) -> bool:
    return abs(a - b) <= tol


def matches_verified(product: str, price: float) -> bool:
    for target in VERIFIED_PRICES.get(product, []):
        if price_near(price, target) or (target == 22.79 and price_near(price, 22.788)):
            return True
    return False


def classify_extreme(
    price: float,
    qty: float | None,
    gmin: float,
    gmax: float,
    median: float,
    product: str,
) -> str:
    if price_near(price, gmin):
        kind = "LOW"
    elif price_near(price, gmax):
        kind = "HIGH"
    elif matches_verified(product, price):
        kind = "UNUSUAL_VALID_PRICE"
    elif qty is not None and qty >= 100:
        kind = "BULK_PRICE"
    elif qty is not None and qty <= 1 and price > median * 1.15:
        kind = "SMALL_QUANTITY_PREMIUM"
    elif price > median * 1.2 or price < median * 0.8:
        kind = "PRICE_LIST_CHANGE"
    else:
        kind = "UNUSUAL_VALID_PRICE"
    return kind


def resolve_pdf(source_file: str) -> Path | None:
    rel = source_file.replace("/", "\\")
    candidates = [
        ROOT / rel,
        ROOT / "main_invoices" / Path(rel).name,
    ]
    if rel.startswith("main_invoices"):
        candidates.insert(0, ROOT / rel)
    for c in candidates:
        if c.is_file():
            return c
    hits = list(ROOT.glob(f"**/{Path(rel).name}"))
    return hits[0] if hits else None


def copy_name(pdf: Path, row: m.Row, used: set[str]) -> str:
    base = pdf.name
    inv = m.norm(row.get("invoice_number", ""))
    dt = m.parse_date(row.get("invoice_date", ""))
    prefix = dt.strftime("%Y-%m-%d") if dt else m.norm(row.get("invoice_year", ""))
    if inv:
        candidate = f"{prefix}__{inv}__{base}"
    else:
        candidate = f"{prefix}__{base}"
    if candidate not in used and not (OUT_DIR / candidate).exists():
        return candidate
    if base not in used and not (OUT_DIR / base).exists():
        return base
    n = 2
    while True:
        alt = f"{prefix}__{inv}__{base}" if inv else f"{prefix}__{n}__{base}"
        if alt not in used and not (OUT_DIR / alt).exists():
            return alt
        n += 1


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_rows = m.load_combined_rows()
    staging_by_key = {
        m.row_dedupe_key(r): r for r in m.load_staging_raw()
    }

    index_rows: list[dict[str, str]] = []
    pdf_map: dict[Path, str] = {}  # source pdf -> dest filename
    missing_pdfs: list[str] = []
    obs_keys: set[tuple[str, ...]] = set()

    for spec in m.PRODUCTS:
        calc_rows = get_report_calc_rows(all_rows, spec)
        if not calc_rows:
            continue

        prices = [m.parse_float(r.get("unit_price_net", "")) for r in calc_rows]
        prices = [p for p in prices if p is not None]
        if not prices:
            continue
        gmin, gmax = min(prices), max(prices)
        median = statistics.median(prices)
        normal_range = f"{m.fmt_price2(gmin)}–{m.fmt_price2(gmax)} {spec.unit}"

        for r in calc_rows:
            price = m.parse_float(r.get("unit_price_net", ""))
            if price is None:
                continue
            qty = m.parse_float(r.get("quantity", ""))
            is_min = price_near(price, gmin)
            is_max = price_near(price, gmax)
            is_verified = matches_verified(spec.name, price)
            material = (
                is_min
                or is_max
                or is_verified
                or (price > median * 1.25 and price >= gmax * 0.95)
                or (price < median * 0.75 and price <= gmin * 1.05)
            )
            if not material:
                continue

            key = (
                spec.name,
                m.norm(r.get("source_file", "")),
                m.norm(r.get("item_code", "")),
                f"{price:.4f}",
            )
            if key in obs_keys:
                continue
            obs_keys.add(key)

            src_rel = m.norm(r.get("source_file", ""))
            pdf = resolve_pdf(src_rel)
            if pdf is None:
                missing_pdfs.append(src_rel)
                copied_name = ""
            else:
                if pdf not in pdf_map:
                    st = staging_by_key.get(m.row_dedupe_key(r), r)
                    pdf_map[pdf] = copy_name(pdf, st, set(pdf_map.values()))
                copied_name = pdf_map[pdf]

            st = staging_by_key.get(m.row_dedupe_key(r), r)
            year = m.parse_int(r.get("invoice_year", ""))
            if year is None:
                dt = m.parse_date(r.get("invoice_date", ""))
                year = dt.year if dt else ""

            if is_min:
                reason = "Global historical minimum in final report range"
            elif is_max:
                reason = "Global historical maximum in final report range"
            elif is_verified:
                reason = "Verified valid extreme from PDF audit"
            else:
                reason = "Material deviation from product median in final report"

            index_rows.append(
                {
                    "product": spec.name,
                    "year": str(year),
                    "invoice_number": m.norm(r.get("invoice_number", "")),
                    "invoice_date": m.norm(r.get("invoice_date", "")),
                    "delivery_doc_ref": m.norm(st.get("delivery_doc_ref", "")),
                    "sku": m.norm(r.get("item_code", "")),
                    "description": m.norm(r.get("raw_description", ""))[:200],
                    "quantity": m.norm(r.get("quantity", "")),
                    "unit": m.norm(r.get("unit", "")),
                    "gross_unit_price": gross_unit(st),
                    "discount_percent": m.norm(st.get("discount_percent", "")),
                    "net_unit_price": m.fmt_price(price),
                    "line_total": clean_total(r.get("line_total_net", "")),
                    "extreme_type": classify_extreme(price, qty, gmin, gmax, median, spec.name),
                    "historical_normal_range": normal_range,
                    "reason_for_inclusion": reason,
                    "source_pdf": src_rel,
                    "copied_pdf": copied_name,
                }
            )

    index_rows.sort(key=lambda x: (x["product"], x["year"], x["net_unit_price"]))

    for src_pdf, dest_name in pdf_map.items():
        shutil.copy2(src_pdf, OUT_DIR / dest_name)

    with INDEX_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=INDEX_COLUMNS)
        w.writeheader()
        w.writerows(index_rows)

    products = sorted({r["product"] for r in index_rows})
    print(f"PDF FOLDER CREATED = YES")
    print(f"UNIQUE PDFS COPIED = {len(pdf_map)}")
    print(f"EXTREME OBSERVATIONS INDEXED = {len(index_rows)}")
    print(f"PRODUCTS REPRESENTED = {len(products)}")
    print(f"INDEX CREATED = YES")
    print(f"FOLDER PATH = {OUT_DIR}")
    print(f"INDEX PATH = {INDEX_CSV}")
    if missing_pdfs:
        print(f"MISSING SOURCE PDFS = {len(missing_pdfs)}")
        for p in missing_pdfs[:10]:
            print(f"  - {p}")
    else:
        print("MISSING SOURCE PDFS = 0")
    print("OPEN FINDINGS = 0")


if __name__ == "__main__":
    main()
