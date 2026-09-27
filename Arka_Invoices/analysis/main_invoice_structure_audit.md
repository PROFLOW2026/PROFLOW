# Main Invoice Structure Audit

Generated: 2026-09-26T18:11:46.651364

## Step 1 — File Inventory

- **Total main invoice PDFs:** 476
- **By year:** {"2017": 1, "2018": 7, "2019": 67, "2020": 60, "2021": 84, "2022": 57, "2023": 70, "2024": 64, "2025": 36, "2026": 30}
- **By confidence:** {"HIGH": 327, "MEDIUM": 82, "LOW": 67}
- **Size distribution:** {">=500KB": 5, "100-200KB": 333, "50-100KB": 101, "200-500KB": 37}
- **Size stats (bytes):** {"min_bytes": 73446, "max_bytes": 737636, "median_bytes": 135681, "mean_bytes": 141885}
- **Exact duplicate extra copies (SHA-256):** 8

## Step 2 — Text Capability (all main invoices, no OCR)

| Class | Count | % |
|-------|------:|--:|
| TEXT_NATIVE | 472 | 99.2% |
| IMAGE_SCAN | 1 | 0.2% |
| MIXED | 3 | 0.6% |
| UNREADABLE | 0 | 0.0% |

## Step 3–5 — 40-Invoice Sample

- **Sample status:** PASS
- **Format families discovered:** 3

### FORMAT_UNKNOWN
- **Label:** Unknown / mixed ERCO layout
- **Year range:** various
- **Columns:** שורה, הנחה, כמות, מק"ט, תעודה.ש
- **Feasibility:** {"ITEM_CODE": "YES", "DESCRIPTION": "NO", "QUANTITY": "YES", "UNIT": "PARTIAL", "UNIT_PRICE": "NO", "LINE_TOTAL": "NO"}
- **RTL / row order:** Hebrew RTL causes column labels to appear reversed in plain text extraction; numeric fields often remain readable but row grouping requires layout-aware parsing.
- **Sample files:** main_invoices\2017\2017-10-03__Nir-Sayag__R3417309113 - הדפסת חשבונית מרכזת.pdf, main_invoices\2021\2021-01-27__קרן-ממויה__image2021-01-27-130613.pdf, main_invoices\2022\2022-09-12__קרן-ממויה__(מסמך ממוחשב) הדפסת קבלה - 25602204205.pdf

### FORMAT_A_2017_2018
- **Label:** ERCO computerized central invoice — classic layout (2017–2018)
- **Year range:** 2017-2018
- **Columns:** סה"כ מחיר, הנחה, מחיר ליחידה, כמות, תאור מוצר, מק"ט
- **Feasibility:** {"ITEM_CODE": "YES", "DESCRIPTION": "YES", "QUANTITY": "YES", "UNIT": "PARTIAL", "UNIT_PRICE": "YES", "LINE_TOTAL": "YES"}
- **RTL / row order:** Hebrew RTL causes column labels to appear reversed in plain text extraction; numeric fields often remain readable but row grouping requires layout-aware parsing.
- **Sample files:** main_invoices\2018\2018-08-30__Mira-Yarimi__P5118435784.pdf, main_invoices\2019\2019-01-13__Keren-Inao__p3845601787.pdf, main_invoices\2019\2019-04-11__Keren-Inao__p2368000013.pdf

### FORMAT_B_2019_2021
- **Label:** ERCO computerized central invoice — standard layout with line number (2019–2021)
- **Year range:** 2019-2021
- **Columns:** שורה, סה"כ מחיר, מחיר ליחידה, כמות, תאור מוצר, מק"ט, תעודה.ש
- **Feasibility:** {"ITEM_CODE": "YES", "DESCRIPTION": "YES", "QUANTITY": "YES", "UNIT": "NO", "UNIT_PRICE": "YES", "LINE_TOTAL": "YES"}
- **RTL / row order:** Hebrew RTL causes column labels to appear reversed in plain text extraction; numeric fields often remain readable but row grouping requires layout-aware parsing.
- **Sample files:** main_invoices\2018\2018-12-09__Nir-Sayag__p0414400593.pdf, main_invoices\2018\2018-12-09__Nir-Sayag__p3285200593.pdf, main_invoices\2018\2018-12-09__Nir-Sayag__p2764000593.pdf

## Business Observations

- **prices_before_vat:** YES — line totals and footer show pre-VAT amounts with separate VAT line
- **line_level_discounts:** YES — discount % column present on most formats
- **negative_quantities_credits:** YES — observed in sample text (credit/return lines)
- **credit_invoices_in_archive:** LIKELY — negative qty/amount lines present; not all messages are credit notes
- **double_billed_line_items:** POSSIBLE — central invoice aggregates delivery-note rows (doc ref per line)
- **central_invoice_contains_dn_items:** YES — each line includes delivery document reference (תעודה.ש / 445… / R… / M…)

## Final Summary

- DIRECT EXTRACTION WITHOUT OCR: **99.2%**
- OCR REQUIRED: **0.2%**
- HISTORICAL PRICE DATASET FEASIBILITY: **HIGH**

## Recommendation

Proceed with layout-aware text/table extraction (pdfplumber or PyMuPDF blocks) for TEXT_NATIVE ERCO central invoices (~99.2% of archive). Build per-format-family parsers for 3 discovered layouts. Reserve OCR for IMAGE_SCAN/UNREADABLE only (~0.2%). Do not OCR delivery notes. Validate parsers on 40-sample CSV, then batch-extract line items into staging tables before building the historical price dataset.