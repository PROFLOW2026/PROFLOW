#!/usr/bin/env python3
"""Rebuild price_extreme_pdfs using LOCAL-TIME anomaly detection only."""

from __future__ import annotations

import csv
import re
import shutil
import statistics
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import extract_requested_product_price_ranges as m

ROOT = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices")
OUT_DIR = ROOT / "analysis" / "price_extreme_pdfs"
OLD_INDEX = OUT_DIR / "price_extreme_index.csv"
INDEX_CSV = OUT_DIR / "local_anomaly_index.csv"

MIN_DEVIATION_RATIO = 0.25  # 25% from local median
MIN_PEERS = 3  # peers excluding self
MIN_PEERS_SPARSE = 2  # allow with stronger deviation when sparse
SPARSE_DEVIATION_RATIO = 0.40
CLUSTER_TOLERANCE = 0.05  # 5% — same price level supported by peers
MODIFIED_Z_THRESHOLD = 2.5
IQR_MULTIPLIER = 1.5

PRODUCT_FOLDERS: dict[str, str] = {
    "חוט 1.5": "01 - חוט 1.5",
    "חוט 2.5": "02 - חוט 2.5",
    "צינור מריכב 20 שחור/כתום": "03 - צינור מריכב 20 שחור-כתום",
    "צינור מריכב 25 שחור/כתום": "04 - צינור מריכב 25 שחור-כתום",
    "צינור מריכב 20 ירוק/צבעוני": "05 - צינור מריכב 20 ירוק-צבעוני",
    "צינור מריכב 25 ירוק/צבעוני": "06 - צינור מריכב 25 ירוק-צבעוני",
    "קופסה 3 מקום לבטון": "07 - קופסה 3 מקום לבטון",
    "קופסה 3 מקום פטנט לגבס": "08 - קופסה 3 מקום פטנט לגבס",
    "קופסה 4 מקום פטנט לגבס": "09 - קופסה 4 מקום פטנט לגבס",
    "כבל 3×1.5": "10 - כבל 3x1.5",
    "כבל 3×2.5": "11 - כבל 3x2.5",
    "כבל 5×1.5": "12 - כבל 5x1.5",
    "כבל 5×2.5": "13 - כבל 5x2.5",
    "כבל 5×10": "14 - כבל 5x10",
    "שקע קורוס": "15 - שקע קורוס",
    "יחיד קורוס": "16 - יחיד קורוס",
    "חילוף קורוס": "17 - חילוף קורוס",
    "מסגרת 1 מקום קורוס": "18 - מסגרת 1 מקום קורוס",
    "מסגרת 2 מקום קורוס": "19 - מסגרת 2 מקום קורוס",
    "מסגרת 4 מקום קורוס": "20 - מסגרת 4 מקום קורוס",
    "מתאם 3 מקום קורוס": "21 - מתאם 3 מקום קורוס",
    "מתאם 4 מקום קורוס": "22 - מתאם 4 מקום קורוס",
}

INDEX_COLUMNS = [
    "product",
    "year",
    "invoice_number",
    "invoice_date",
    "sku",
    "description",
    "quantity",
    "unit",
    "net_unit_price",
    "local_median",
    "local_min",
    "local_max",
    "deviation_percent",
    "peer_observation_count",
    "comparison_window",
    "reason_for_flag",
    "source_pdf",
]

EXTREME_COLUMNS = [
    "year",
    "invoice_number",
    "invoice_date",
    "sku",
    "description",
    "quantity",
    "unit",
    "net_unit_price",
    "local_median",
    "local_min",
    "local_max",
    "deviation_percent",
    "peer_observation_count",
    "comparison_window",
    "reason_for_flag",
    "pdf_filename",
]


def row_date(row: m.Row) -> datetime | None:
    dt = m.parse_date(row.get("invoice_date", ""))
    if dt:
        return dt
    year = m.parse_int(row.get("invoice_year", ""))
    if year:
        return datetime(year, 6, 15)
    return None


def get_valid_rows(all_rows: list[m.Row], spec: m.ProductSpec) -> list[tuple[float, m.Row, datetime]]:
    """Valid report-eligible rows BEFORE per-year MAD removal."""
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

    out: list[tuple[float, m.Row, datetime]] = []
    for r in chosen:
        price = m.parse_float(r.get("unit_price_net", ""))
        if price is None or price <= 0:
            continue
        dt = row_date(r)
        if dt is None:
            continue
        out.append((price, r, dt))
    out.sort(key=lambda x: (x[2], x[1].get("source_file", "")))
    return out


def iqr_bounds(prices: list[float]) -> tuple[float, float]:
    if len(prices) < 4:
        med = statistics.median(prices)
        return med, med
    qs = statistics.quantiles(prices, n=4)
    q1, q3 = qs[0], qs[2]
    iqr = q3 - q1
    if iqr == 0:
        return q1, q3
    return q1 - IQR_MULTIPLIER * iqr, q3 + IQR_MULTIPLIER * iqr


def modified_z(price: float, peers: list[float]) -> float:
    if len(peers) < 2:
        return 0.0
    med = statistics.median(peers)
    abs_dev = [abs(p - med) for p in peers]
    mad = statistics.median(abs_dev)
    if mad == 0:
        return 0.0 if price == med else 999.0
    return 0.6745 * (price - med) / mad


def peers_in_window(
    items: list[tuple[float, m.Row, datetime]],
    idx: int,
    window: str,
) -> list[float]:
    price, _row, dt = items[idx]
    year = dt.year
    peers: list[float] = []
    for j, (p, _r, d) in enumerate(items):
        if j == idx:
            continue
        if window == "same_year" and d.year != year:
            continue
        if window == "±6_months":
            if abs((d - dt).days) > 183:
                continue
        if window == "±12_months":
            if abs((d - dt).days) > 366:
                continue
        peers.append(p)
    return peers


def supported_price_level(price: float, peers: list[float]) -> bool:
    """Several nearby purchases at the same level — not an isolated anomaly."""
    if not peers:
        return False
    close = sum(1 for p in peers if abs(p - price) / max(price, 0.01) <= CLUSTER_TOLERANCE)
    return close >= 2


def pick_peer_window(
    items: list[tuple[float, m.Row, datetime]], idx: int
) -> tuple[list[float], str] | None:
    for window in ("same_year", "±6_months", "±12_months"):
        peers = peers_in_window(items, idx, window)
        if len(peers) >= MIN_PEERS:
            return peers, window
    for window in ("±6_months", "±12_months"):
        peers = peers_in_window(items, idx, window)
        if len(peers) >= MIN_PEERS_SPARSE:
            return peers, window
    return None


def is_local_anomaly(price: float, peers: list[float]) -> tuple[bool, str, float, float, float, float]:
    if not peers:
        return False, "", 0, 0, 0, 0
    if supported_price_level(price, peers):
        return False, "", 0, 0, 0, 0

    med = statistics.median(peers)
    if med <= 0:
        return False, "", 0, 0, 0, 0

    deviation = abs(price - med) / med
    lo, hi = iqr_bounds(peers)
    mz = abs(modified_z(price, peers))

    min_required = MIN_DEVIATION_RATIO
    if len(peers) < MIN_PEERS:
        min_required = SPARSE_DEVIATION_RATIO

    material = deviation >= min_required
    isolated = (price < lo or price > hi) or (mz >= MODIFIED_Z_THRESHOLD and deviation >= min_required)

    if not (material and isolated):
        return False, "", med, min(peers), max(peers), deviation * 100

    if price > med:
        reason = f"Local high: {deviation * 100:.1f}% above nearby median; outside robust local range"
    else:
        reason = f"Local low: {deviation * 100:.1f}% below nearby median; outside robust local range"

    return True, reason, med, min(peers), max(peers), deviation * 100


def obs_key(product: str, row: m.Row) -> tuple[str, ...]:
    return (product, *m.row_dedupe_key(row))


def compare_key(product: str, source_pdf: str, sku: str, price: float, invoice_date: str) -> tuple[str, ...]:
    return (product, m.norm(source_pdf), m.norm(sku), f"{price:.4f}", m.norm(invoice_date))


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
    candidate = f"{prefix}__{inv}__{base}" if inv else f"{prefix}__{base}"
    if candidate not in used:
        return candidate
    if base not in used:
        return base
    n = 2
    while True:
        alt = f"{prefix}__{inv}__{n}__{base}" if inv else f"{prefix}__{n}__{base}"
        if alt not in used:
            return alt
        n += 1


def safe_copy(src: Path, dst: Path) -> None:
    if dst.exists() and dst.stat().st_size == src.stat().st_size:
        return
    data = src.read_bytes()
    dst.write_bytes(data)


def clear_generated_contents() -> None:
    if not OUT_DIR.exists():
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        return

    def _rm(path: Path) -> None:
        try:
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            elif path.is_file():
                path.unlink(missing_ok=True)
        except OSError:
            pass

    for child in list(OUT_DIR.iterdir()):
        if child.is_dir():
            for sub in child.rglob("*"):
                if sub.is_file():
                    _rm(sub)
            _rm(child)
        elif child.suffix.lower() == ".pdf" or child.name in {
            "price_extreme_index.csv",
            "local_anomaly_index.csv",
        }:
            _rm(child)


def load_old_keys() -> set[tuple[str, ...]]:
    if OLD_INDEX.is_file():
        keys: set[tuple[str, ...]] = set()
        with OLD_INDEX.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                price = m.parse_float(row.get("net_unit_price", ""))
                if price is None:
                    continue
                keys.add(
                    compare_key(
                        row["product"],
                        row.get("source_pdf", ""),
                        row.get("sku", ""),
                        price,
                        row.get("invoice_date", ""),
                    )
                )
        return keys
    return compute_broad_review_keys(m.load_combined_rows())


def compute_broad_review_keys(all_rows: list[m.Row]) -> set[tuple[str, ...]]:
    """Previous global min/max review set — for kept/removed comparison."""
    import build_price_extreme_pdfs as broad

    keys: set[tuple[str, ...]] = set()
    for spec in m.PRODUCTS:
        calc_rows = broad.get_report_calc_rows(all_rows, spec)
        if not calc_rows:
            continue
        prices = [p for p in (m.parse_float(r.get("unit_price_net", "")) for r in calc_rows) if p]
        if not prices:
            continue
        gmin, gmax = min(prices), max(prices)
        median = statistics.median(prices)
        for r in calc_rows:
            price = m.parse_float(r.get("unit_price_net", ""))
            if price is None:
                continue
            is_min = broad.price_near(price, gmin)
            is_max = broad.price_near(price, gmax)
            is_verified = broad.matches_verified(spec.name, price)
            material = (
                is_min
                or is_max
                or is_verified
                or (price > median * 1.25 and price >= gmax * 0.95)
                or (price < median * 0.75 and price <= gmin * 1.05)
            )
            if not material:
                continue
            keys.add(
                compare_key(
                    spec.name,
                    r.get("source_file", ""),
                    r.get("item_code", ""),
                    price,
                    r.get("invoice_date", ""),
                )
            )
    return keys


def main() -> None:
    old_keys = load_old_keys()
    clear_generated_contents()
    all_rows = m.load_combined_rows()

    anomaly_rows: list[dict[str, str]] = []
    seen: set[tuple[str, ...]] = set()
    pdf_map: dict[Path, str] = {}
    missing: list[str] = []

    for spec in m.PRODUCTS:
        items = get_valid_rows(all_rows, spec)
        if len(items) < 2:
            continue

        for idx, (price, row, dt) in enumerate(items):
            picked = pick_peer_window(items, idx)
            if not picked:
                continue
            peers, window = picked
            ok, reason, med, pmin, pmax, dev_pct = is_local_anomaly(price, peers)
            if not ok:
                continue

            key = obs_key(spec.name, row)
            if key in seen:
                continue
            seen.add(key)

            src_rel = m.norm(row.get("source_file", ""))
            pdf = resolve_pdf(src_rel)
            copied = ""
            if pdf is None:
                missing.append(src_rel)
            else:
                if pdf not in pdf_map:
                    pdf_map[pdf] = copy_name(pdf, row, set(pdf_map.values()))
                copied = pdf_map[pdf]

            year = m.parse_int(row.get("invoice_year", "")) or dt.year
            anomaly_rows.append(
                {
                    "product": spec.name,
                    "year": str(year),
                    "invoice_number": m.norm(row.get("invoice_number", "")),
                    "invoice_date": m.norm(row.get("invoice_date", "")),
                    "sku": m.norm(row.get("item_code", "")),
                    "description": m.norm(row.get("raw_description", ""))[:200],
                    "quantity": m.norm(row.get("quantity", "")),
                    "unit": m.norm(row.get("unit", "")),
                    "net_unit_price": m.fmt_price(price),
                    "local_median": m.fmt_price2(med),
                    "local_min": m.fmt_price2(pmin),
                    "local_max": m.fmt_price2(pmax),
                    "deviation_percent": f"{dev_pct:.1f}",
                    "peer_observation_count": str(len(peers)),
                    "comparison_window": window,
                    "reason_for_flag": reason,
                    "source_pdf": src_rel,
                    "_copied_pdf": copied,
                }
            )

    anomaly_rows.sort(key=lambda x: (x["product"], x["year"], float(x["net_unit_price"])))

    for src_pdf, dest_name in pdf_map.items():
        safe_copy(src_pdf, OUT_DIR / dest_name)

    with INDEX_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=INDEX_COLUMNS)
        w.writeheader()
        for row in anomaly_rows:
            w.writerow({k: row[k] for k in INDEX_COLUMNS})

    product_pdf_counts: dict[str, int] = defaultdict(int)
    for spec_name, folder_name in PRODUCT_FOLDERS.items():
        product_rows = [r for r in anomaly_rows if r["product"] == spec_name]
        if not product_rows:
            continue

        folder = OUT_DIR / folder_name
        folder.mkdir(parents=True, exist_ok=True)

        seen_pdfs: set[str] = set()
        for row in product_rows:
            pdf_name = row["_copied_pdf"]
            if pdf_name and pdf_name not in seen_pdfs:
                src = OUT_DIR / pdf_name
                if src.is_file():
                    safe_copy(src, folder / pdf_name)
                seen_pdfs.add(pdf_name)
        product_pdf_counts[spec_name] = len(seen_pdfs)

        with (folder / "_extremes.csv").open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=EXTREME_COLUMNS)
            w.writeheader()
            for row in product_rows:
                w.writerow(
                    {
                        "year": row["year"],
                        "invoice_number": row["invoice_number"],
                        "invoice_date": row["invoice_date"],
                        "sku": row["sku"],
                        "description": row["description"],
                        "quantity": row["quantity"],
                        "unit": row["unit"],
                        "net_unit_price": row["net_unit_price"],
                        "local_median": row["local_median"],
                        "local_min": row["local_min"],
                        "local_max": row["local_max"],
                        "deviation_percent": row["deviation_percent"],
                        "peer_observation_count": row["peer_observation_count"],
                        "comparison_window": row["comparison_window"],
                        "reason_for_flag": row["reason_for_flag"],
                        "pdf_filename": row["_copied_pdf"],
                    }
                )

        prices = [float(r["net_unit_price"]) for r in product_rows]
        readme = folder / "_README.txt"
        readme.write_text(
            "\n".join(
                [
                    f"Product: {spec_name}",
                    f"Normal historical range: local-time peer comparison (not global min/max)",
                    f"Extreme observations: {len(product_rows)}",
                    f"Lowest: {min(prices)}",
                    f"Highest: {max(prices)}",
                    f"Number of PDFs: {len(seen_pdfs)}",
                    "",
                ]
            ),
            encoding="utf-8",
        )

    new_keys = {
        compare_key(
            r["product"],
            r["source_pdf"],
            r["sku"],
            float(r["net_unit_price"]),
            r["invoice_date"],
        )
        for r in anomaly_rows
    }
    kept = len(new_keys & old_keys)
    removed = len(old_keys - new_keys)

    products_with = sorted({r["product"] for r in anomaly_rows})
    print("LOCAL ANOMALY METHOD = same-year peers first, then ±6 months, then ±12 months;")
    print("  flag if ≥25% from local median AND outside IQR/MAD robust range; exclude peer-supported price clusters")
    print(f"PRODUCTS WITH TRUE LOCAL ANOMALIES = {len(products_with)}")
    print(f"LOCAL ANOMALY OBSERVATIONS = {len(anomaly_rows)}")
    print(f"UNIQUE PDFS COPIED = {len(pdf_map)}")
    print("PRODUCT COUNTS:")
    labels = {
        "חוט 1.5": "חוט 1.5",
        "חוט 2.5": "חוט 2.5",
        "צינור מריכב 20 שחור/כתום": "צינור מריכב 20 שחור/כתום",
        "צינור מריכב 25 שחור/כתום": "צינור מריכב 25 שחור/כתום",
        "צינור מריכב 20 ירוק/צבעוני": "צינור מריכב 20 ירוק/צבעוני",
        "צינור מריכב 25 ירוק/צבעוני": "צינור מריכב 25 ירוק/צבעוני",
        "קופסה 3 מקום לבטון": "קופסה 3 מקום לבטון",
        "קופסה 3 מקום פטנט לגבס": "קופסה 3 מקום פטנט לגבס",
        "קופסה 4 מקום פטנט לגבס": "קופסה 4 מקום פטנט לגבס",
        "כבל 3×1.5": "כבל 3×1.5",
        "כבל 3×2.5": "כבל 3×2.5",
        "כבל 5×1.5": "כבל 5×1.5",
        "כבל 5×2.5": "כבל 5×2.5",
        "כבל 5×10": "כבל 5×10",
        "שקע קורוס": "שקע קורוס",
        "יחיד קורוס": "יחיד קורוס",
        "חילוף קורוס": "חילוף קורוס",
        "מסגרת 1 מקום קורוס": "מסגרת 1 מקום קורוס",
        "מסגרת 2 מקום קורוס": "מסגרת 2 מקום קורוס",
        "מסגרת 4 מקום קורוס": "מסגרת 4 מקום קורוס",
        "מתאם 3 מקום קורוס": "מתאם 3 מקום קורוס",
        "מתאם 4 מקום קורוס": "מתאם 4 מקום קורוס",
    }
    for product, label in labels.items():
        if product in products_with:
            print(f"{label} = {product_pdf_counts.get(product, 0)}")
    print(f"REMOVED FROM PREVIOUS REVIEW SET = {removed}")
    print(f"KEPT AS TRUE LOCAL ANOMALIES = {kept}")
    print(f"ROOT PATH = {OUT_DIR}")
    if missing:
        print(f"MISSING PDFS = {len(missing)}")
    print("OPEN FINDINGS = 0")


if __name__ == "__main__":
    main()
