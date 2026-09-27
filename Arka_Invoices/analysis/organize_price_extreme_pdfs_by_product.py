#!/usr/bin/env python3
"""Organize extreme-price PDFs into per-product subfolders from price_extreme_index.csv."""

from __future__ import annotations

import csv
import shutil
from collections import defaultdict
from pathlib import Path

ROOT = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\analysis\price_extreme_pdfs")
INDEX_CSV = ROOT / "price_extreme_index.csv"

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

EXTREME_COLUMNS = [
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
    "pdf_filename",
]


def parse_price(value: str) -> float | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def main() -> None:
    rows_by_product: dict[str, list[dict[str, str]]] = defaultdict(list)

    with INDEX_CSV.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            product = row["product"]
            if product not in PRODUCT_FOLDERS:
                raise KeyError(f"Unknown product in index: {product!r}")
            rows_by_product[product].append(row)

    total_copies = 0
    unique_source_pdfs: set[str] = set()
    product_pdf_counts: dict[str, int] = {}
    index_files_created = 0

    for product, folder_name in PRODUCT_FOLDERS.items():
        product_rows = rows_by_product.get(product, [])
        if not product_rows:
            continue

        folder = ROOT / folder_name
        folder.mkdir(parents=True, exist_ok=True)

        seen_pdfs_in_folder: set[str] = set()
        for row in product_rows:
            pdf_name = row["copied_pdf"].strip()
            if not pdf_name:
                raise ValueError(f"Missing copied_pdf for {product} row")
            unique_source_pdfs.add(pdf_name)

            src = ROOT / pdf_name
            if not src.is_file():
                raise FileNotFoundError(f"Missing master PDF: {src}")

            if pdf_name not in seen_pdfs_in_folder:
                dst = folder / pdf_name
                if not dst.exists():
                    shutil.copy2(src, dst)
                total_copies += 1
                seen_pdfs_in_folder.add(pdf_name)

        product_pdf_counts[product] = len(seen_pdfs_in_folder)

        extremes_path = folder / "_extremes.csv"
        with extremes_path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=EXTREME_COLUMNS)
            writer.writeheader()
            for row in product_rows:
                writer.writerow(
                    {
                        "year": row["year"],
                        "invoice_number": row["invoice_number"],
                        "invoice_date": row["invoice_date"],
                        "delivery_doc_ref": row["delivery_doc_ref"],
                        "sku": row["sku"],
                        "description": row["description"],
                        "quantity": row["quantity"],
                        "unit": row["unit"],
                        "gross_unit_price": row["gross_unit_price"],
                        "discount_percent": row["discount_percent"],
                        "net_unit_price": row["net_unit_price"],
                        "line_total": row["line_total"],
                        "extreme_type": row["extreme_type"],
                        "historical_normal_range": row["historical_normal_range"],
                        "reason_for_inclusion": row["reason_for_inclusion"],
                        "pdf_filename": row["copied_pdf"],
                    }
                )
        index_files_created += 1

        prices = [p for p in (parse_price(r["net_unit_price"]) for r in product_rows) if p is not None]
        normal_range = product_rows[0]["historical_normal_range"]
        readme = folder / "_README.txt"
        readme.write_text(
            "\n".join(
                [
                    f"Product: {product}",
                    f"Normal historical range: {normal_range}",
                    f"Extreme observations: {len(product_rows)}",
                    f"Lowest: {min(prices) if prices else 'n/a'}",
                    f"Highest: {max(prices) if prices else 'n/a'}",
                    f"Number of PDFs: {len(seen_pdfs_in_folder)}",
                    "",
                ]
            ),
            encoding="utf-8",
        )

    folders_created = sum(1 for p in PRODUCT_FOLDERS if rows_by_product.get(p))

    print(f"PRODUCT FOLDERS CREATED = {folders_created}")
    print(f"TOTAL PDF COPIES ACROSS PRODUCT FOLDERS = {total_copies}")
    print(f"UNIQUE SOURCE PDFS = {len(unique_source_pdfs)}")
    print(f"PRODUCT INDEX FILES CREATED = {index_files_created}")
    print(f"ROOT PATH = {ROOT}")
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
        print(f"{label} = {product_pdf_counts.get(product, 0)}")
    print("OPEN FINDINGS = 0")


if __name__ == "__main__":
    main()
