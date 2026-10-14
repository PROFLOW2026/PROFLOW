"""
Final Excel cleanup: reversals, installment recognition vs Production engine.
Edits ProjectFlow_Financial_2026.xlsx in place only.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(r"c:\Users\ERAN YOSEF\Desktop\final projects\FINAL-WEB\projectflow")
XLSX = ROOT / "ProjectFlow_Financial_2026.xlsx"
AUDIT = ROOT / ".tools" / "excel-installment-audit.json"
REPORT = ROOT / ".tools" / "excel-final-cleanup-report.json"

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.I,
)

# voided charge + reversal — net zero technical pair
REMOVE_IDS = {
    "b068332b-ac7b-469d-935e-dd237eb94956",
    "6906893f-9748-4e86-81e5-5da5c83a3a69",
    "7f31c326-2f00-4130-a866-9b15bf417196",
    "f59305ca-886e-4a92-a6b3-d1c1ecd3a82d",
    "9637b0ad-e611-4943-bb47-de6f41d241f1",
    "227eaec3-48ec-4cf0-a4b2-46ec0d4d3032",
}

SHEET_YM = {
    "01 ינואר": "2026-01",
    "02 פברואר": "2026-02",
    "03 מרץ": "2026-03",
    "04 אפריל": "2026-04",
    "05 מאי": "2026-05",
    "06 יוני": "2026-06",
    "07 יולי": "2026-07",
    "08 אוגוסט": "2026-08",
    "09 ספטמבר": "2026-09",
    "10 אוקטובר": "2026-10",
}
YM_SHEET = {v: k for k, v in SHEET_YM.items()}

ENGINE_NET = {
    "2026-01": Decimal("47133.138474"),
    "2026-02": Decimal("40534.494406"),
    "2026-03": Decimal("53062.111695"),
    "2026-04": Decimal("48628.213389"),
    "2026-05": Decimal("48486.264237"),
    "2026-06": Decimal("52562.555423"),
    "2026-07": Decimal("73085.425424"),
    "2026-08": Decimal("67925.027795"),
    "2026-09": Decimal("64741.500507"),
    "2026-10": Decimal("3761.840508"),
}

OVERVIEW_ROWS = [
    ("2026-01", 5),
    ("2026-02", 6),
    ("2026-03", 7),
    ("2026-04", 8),
    ("2026-05", 9),
    ("2026-06", 10),
    ("2026-07", 11),
    ("2026-08", 12),
    ("2026-09", 13),
    ("2026-10", 14),
]

# installment cash: gross / count (Production)
CELLULAR_ID = "e800507f-2ff4-468b-aa32-63a849ba398d"
CELLULAR_GROSS_PER = Decimal("8450") / Decimal("24")


def q2(v: Decimal) -> float:
    return float(v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def d(v) -> Decimal:
    if v is None or v == "":
        return Decimal("0")
    return Decimal(str(v))


def cell_id(ws, row: int) -> str | None:
    v = ws.cell(row, 13).value
    if not v:
        return None
    s = str(v).strip().lower()
    return s if UUID_RE.match(s) else None


def is_expense_row(ws, row: int) -> bool:
    t = ws.cell(row, 2).value
    return t in ("הוצאה", "הכרת עלות (פריסה)", "תשלום (פריסה)")


def find_section2_row(ws) -> int:
    for r in range(1, ws.max_row + 1):
        v = ws.cell(r, 1).value
        if v and str(v).startswith("2 |"):
            return r
    return ws.max_row + 1


def load_mgr_by_expense(audit: dict) -> dict[str, dict[str, Decimal]]:
    out: dict[str, dict[str, Decimal]] = defaultdict(dict)
    for line in audit["mgrLines"]:
        if line["status"] == "void":
            continue
        eid = line["expense_id"].lower()
        out[eid][line["year_month"]] = d(line["amount"])
    return out


def load_install_meta(audit: dict) -> dict[str, dict]:
    meta = {}
    for row in audit["installments"]:
        if row["status"] != "finalized":
            continue
        eid = row["id"].lower()
        meta[eid] = row
    return meta


def main() -> None:
    lock = ROOT / "~$ProjectFlow_Financial_2026.xlsx"
    if lock.exists():
        raise SystemExit("Close Excel (lock file present) and retry.")

    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    mgr_by_exp = load_mgr_by_expense(audit)
    install_meta = load_install_meta(audit)

    wb = load_workbook(XLSX)
    removed: list[dict] = []
    updated: list[dict] = []
    inserted: list[dict] = []

    # --- pass 1: remove reversal pairs ---
    for ws in wb.worksheets:
        ws.sheet_view.rightToLeft = True
        if ws.title not in SHEET_YM:
            continue
        to_del = []
        for row in range(1, ws.max_row + 1):
            eid = cell_id(ws, row)
            if eid and eid in REMOVE_IDS and ws.cell(row, 2).value == "הוצאה":
                to_del.append(row)
                removed.append({"sheet": ws.title, "row": row, "id": eid})
        for row in sorted(to_del, reverse=True):
            ws.delete_rows(row, 1)

    # --- pass 2: installment recognition + cellular payments ---
    inserts_by_sheet: dict[str, list[list]] = defaultdict(list)

    for eid, months in mgr_by_exp.items():
        if eid not in install_meta:
            continue
        meta = install_meta[eid]
        supplier = meta.get("supplier_name") or meta.get("description") or "—"
        desc = meta.get("description") or "פריסת תשלומים"
        inst_count = int(meta.get("installment_count") or 1)
        purchase_ym = str(meta["expense_date"])[:7]

        for ym, amt in sorted(months.items()):
            if ym not in YM_SHEET:
                continue
            sheet = YM_SHEET[ym]
            ws = wb[sheet]
            found_row = None
            for row in range(1, ws.max_row + 1):
                if cell_id(ws, row) == eid and ws.cell(row, 2).value == "הוצאה":
                    found_row = row
                    break
            if found_row:
                ws.cell(found_row, 12).value = q2(amt)
                note = ws.cell(found_row, 10).value or ""
                tag = f"פריסה {inst_count} חודשים | מוכר בחודש זה בלבד"
                if tag not in str(note):
                    ws.cell(found_row, 10).value = (
                        f"{note} | {tag}".strip(" |")
                        if note
                        else tag
                    )
                if eid == CELLULAR_ID:
                    ws.cell(found_row, 11).value = "סופי / בתשלומים (7/24)"
                    ws.cell(found_row, 8).value = q2(CELLULAR_GROSS_PER)
                    ws.cell(found_row, 9).value = q2(d("5985.44"))
                updated.append(
                    {"sheet": sheet, "row": found_row, "id": eid, "recognized": str(amt)}
                )
            else:
                inserts_by_sheet[sheet].append(
                    [
                        f"{ym}-01",
                        "הכרת עלות (פריסה)",
                        supplier,
                        f"{desc} — חלק הכרה חודשי",
                        None,
                        None,
                        None,
                        None,
                        None,
                        f"מזהה עסקה {eid[:8]}… | פריסה",
                        "סופי / scheduled",
                        q2(amt),
                        eid,
                    ]
                )
                inserted.append({"sheet": sheet, "id": eid, "ym": ym, "recognized": str(amt)})

    # cellular payments Mar–Sep 2026 (7 paid installments)
    pay_months = [
        "2026-03",
        "2026-04",
        "2026-05",
        "2026-06",
        "2026-07",
        "2026-08",
        "2026-09",
    ]
    for i, ym in enumerate(pay_months, start=1):
        sheet = YM_SHEET[ym]
        remaining = q2(d("8450") - CELLULAR_GROSS_PER * i)
        inserts_by_sheet[sheet].append(
            [
                f"{ym}-01",
                "תשלום (פריסה)",
                "סלולר",
                f"תשלום {i}/24 — עסקת סלולר",
                None,
                None,
                None,
                q2(CELLULAR_GROSS_PER),
                remaining if remaining > 0 else 0,
                "מזומן — לא הכרת עלות נוספת",
                "paid",
                None,
                CELLULAR_ID,
            ]
        )
        inserted.append({"sheet": sheet, "id": CELLULAR_ID, "ym": ym, "payment_gross": str(CELLULAR_GROSS_PER)})

    for sheet, rows in inserts_by_sheet.items():
        if not rows:
            continue
        ws = wb[sheet]
        at = find_section2_row(ws)
        for offset, data in enumerate(rows):
            ws.insert_rows(at + offset, 1)
            for col, val in enumerate(data, start=1):
                ws.cell(at + offset, col).value = val

    # --- pass 3: section headers + overview ---
    for ws in wb.worksheets:
        if ws.title not in SHEET_YM:
            continue
        cnt = sum(
            1
            for row in range(1, ws.max_row + 1)
            if ws.cell(row, 2).value == "הוצאה" and cell_id(ws, row)
        )
        hdr = ws.cell(4, 1).value
        if hdr and str(hdr).startswith("1 | הוצאות"):
            ws.cell(4, 1).value = f"1 | הוצאות — {cnt} רשומות (סופיות / תקפות)"

    overview = wb["סקירה שנתית"]
    overview.sheet_view.rightToLeft = True
    for ym, r in OVERVIEW_ROWS:
        overview.cell(r, 3).value = q2(ENGINE_NET[ym])

    wb.save(XLSX)

    # --- validate ---
    wb2 = load_workbook(XLSX, data_only=True)
    monthly_sum: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    expense_primary = 0
    for ws in wb2.worksheets:
        if ws.title not in SHEET_YM:
            continue
        ym = SHEET_YM[ws.title]
        for row in range(1, ws.max_row + 1):
            if not is_expense_row(ws, row):
                continue
            rec = ws.cell(row, 12).value
            if rec is not None and rec != "":
                monthly_sum[ym] += d(rec)
            if ws.cell(row, 2).value == "הוצאה" and cell_id(ws, row):
                expense_primary += 1

    mismatches = []
    for ym, eng in ENGINE_NET.items():
        delta = q2(monthly_sum[ym]) - q2(eng)
        if abs(Decimal(str(delta))) > Decimal("0.05"):
            mismatches.append(
                {
                    "ym": ym,
                    "excel_sum_col12": q2(monthly_sum[ym]),
                    "engine": q2(eng),
                    "delta": delta,
                }
            )

    report = {
        "removed_rows": removed,
        "updated_installment_rows": updated,
        "inserted_rows": inserted,
        "expense_primary_count": expense_primary,
        "monthly_mismatches": mismatches,
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    if mismatches:
        raise SystemExit(f"Monthly recognition mismatch: {mismatches}")

    try:
        import win32com.client  # type: ignore

        excel = win32com.client.Dispatch("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False
        wb_com = excel.Workbooks.Open(str(XLSX.resolve()))
        open_ok = True
        wb_com.Close(SaveChanges=False)
        excel.Quit()
    except Exception as exc:  # noqa: BLE001
        open_ok = str(exc)

    report["excel_com_open"] = open_ok
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": True,
                "removed": len(removed),
                "inserted": len(inserted),
                "expense_primary": expense_primary,
                "excel_open": open_ok,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
