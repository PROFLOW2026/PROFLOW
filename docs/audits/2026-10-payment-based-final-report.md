# דוח סופי — אימות שחרור פיננסי (ProjectFlow)

**ארגון:** `8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec`  
**תאריך:** 2026-10-12  
**Production deploy (GitHub):** `c29c61de2dc9f93d723eacdbbdd08356823eee45` (Production environment, 2026-10-11T22:59:14Z)  
**CI על `c29c61de` (לפני תיקון journal):** **failure** — Migration journal parity (קובץ 0180 היה ב-`drizzle/migrations/` בלי journal).  
**תיקון בסגירה זו:** 0180 הועבר ל-`drizzle/prepared/` → journal parity **ok** (178 קבצים, אחרון `0179_connected_projects`).

---

## 1. אימות שחרור

| בדיקה | תוצאה |
|--------|--------|
| Vercel Production SHA | **`c29c61de`** (מ-GitHub Deployments API) |
| GitHub CI על אותו SHA | **נכשל** (journal) — **מתוקן ב-commit הבא** |
| Smoke Production (ללא session) | `/he-IL/financials/overview`, `/he-IL/cash-flow`, `/he-IL/financials/business-profitability`, `/he-IL/overhead` → **307 → sign-in** (אין 5xx; מסלולים קיימים) |
| Smoke לוגיקה (local unit) | `month-cash-flow`, `cash-flow-sources`, `installment-payment-recognition` — **37 pass** |

---

## 2. מקור אמת מספרי

| מקור | נוצר | תפקיד |
|------|------|--------|
| `.tools/org-all-payments-2026.json` | `export-all-org-payments-2026.mjs` (Production read-only) | **אמת ראשית** — `schemaVersion: 2`, `monthlyTruth` |
| `.tools/payment-reconciliation-2026.json` | `payment-reconciliation-report.mjs` | 7 עסקאות פריסה בלבד |
| `ProjectFlow_Financial_2026.xlsx` | `excel-full-monthly-payments-closeout.py` | §0 יוצאים, §0a תקבולים, §7 חריגות |

### הסבר פער GROSS בין “סיכום עבודה” לדוח קודם

- טבלה ישנה השתמשה ב-`totalsByMonth.grossPaid` = **הוצאות + שכר + תקבולי לקוח** (זרימת מזומן מעורבת).
- **מרץ 2026:** GROSS ~248,401 בטבלה הישנה = **149,925 תקבולים** + **98,476 יוצאים** — לא “GROSS הוצאות”.
- **דוח זה:** עמודות הוצאות = `monthlyTruth.*.expensesOut` בלבד; תקבולים ב-`receiptsIn`; שכר ב-`payrollOut`.

### ב.מ.ש — `PAID_DATE_UNKNOWN`

- GROSS **8,689 ₪** — **רמת ארגון** (`orgLevel.dateUnknownGross`), **לא** מוכר בספטמבר/אוקטובר כתשלום מאומת.
- Excel §7 באוקטובר = **תצוגת חריגה** בלבד; §0 אוקטובר **לא** כולל את הסכום.

---

## 3. טבלה חודשית (ינואר–אוקטובר 2026)

מקור: `.tools/org-all-payments-2026.json` → `monthlyTruth` (מעוגל לאגורה).

| חודש | יוצאים GROSS (הוצאות+שכר) | הוצאות NET | הוצאות VAT | הוצאות GROSS | שכר GROSS | תקבולים GROSS | EMC |
|------|---------------------------|------------|------------|--------------|-----------|---------------|-----|
| 2026-01 | 4,683.23 | 4,148.84 | 534.39 | 4,683.23 | 0.00 | 35,000.00 | 40,661.00 |
| 2026-02 | 33,394.23 | 5,598.84 | 795.39 | 6,394.23 | 27,000.00 | 0.00 | 44,607.00 |
| 2026-03 | 98,476.21 | 60,753.06 | 10,723.15 | 71,476.21 | 27,000.00 | 149,925.00 | 32,574.00 |
| 2026-04 | 73,594.81 | 39,667.13 | 6,927.68 | 46,594.81 | 27,000.00 | 15,840.00 | 40,065.00 |
| 2026-05 | 64,028.31 | 26,792.97 | 4,610.34 | 31,403.31 | 32,625.00 | 0.00 | 49,867.00 |
| 2026-06 | 76,098.33 | 41,788.75 | 7,309.58 | 49,098.33 | 27,000.00 | 0.00 | 47,216.00 |
| 2026-07 | 78,186.66 | 43,558.53 | 7,628.13 | 51,186.66 | 27,000.00 | 192,758.50 | 49,944.00 |
| 2026-08 | 96,193.98 | 59,114.44 | 10,079.54 | 69,193.98 | 27,000.00 | 53,960.00 | 50,485.00 |
| 2026-09 | 117,730.08 | 69,898.37 | 12,581.71 | 82,480.08 | 35,250.00 | 150,916.50 | 58,497.00 |
| 2026-10 | 59,800.40 | 2,849.83 | 300.57 | 3,150.40 | 56,650.00 | 0.00 | 18,883.33 |

**תשלומים ללא תאריך מאומת (ארגון):** 1 רשומה, GROSS **8,689.00** NET **~7,363.56** VAT **~1,325.44** — ב.מ.ש בלבד.

**פריסות (7):** NET מוכר מאומת בספטמבר **~298 ₪** (סלולר) — `.tools/payment-reconciliation-2026.json`; `orgLevel.dateUnknownGross` = **8,689** (BMS), **לא** מיוחס לאוקטובר.

---

## 4. Excel

- `ProjectFlow_Financial_2026.xlsx` עודכן: §0 יוצאים, §0a תקבולים (נפרד), §0b EMC, §7/§8 באוקטובר.
- דוח closeout: `.tools/excel-full-payments-closeout-report.json` (`date_unknown_count`: 1).

---

## 5. מיגרציה 0180 (מוכן — לא Production)

- **קובץ:** `drizzle/prepared/0180_expense_installment_payments.sql`
- **שיפורים:** `SELECT … FOR UPDATE` על תשלום מקור; `pg_advisory_xact_lock`; מניעת void כפול; תקרת זיכוי מצטבר.
- **בדיקות:** `hardening-0180-expense-installment-payments.test.ts` — **5/5 pass** (כולל void כפול + `Promise.allSettled` על זיכויים מקבילים).

```
SQL / MIGRATION PREPARED = YES
FILE = drizzle/prepared/0180_expense_installment_payments.sql
PURPOSE = ledger תשלומי פריסה + reversal/credit
DATA MUTATION = none (לא הורץ)
SCHEMA MUTATION = none (לא הורץ)
RISK = נמוך בהכנה; גבוה בהרצה ללא backfill מאומת
READY FOR OWNER REVIEW = YES
```

---

## 6. סטטוס סגירה

| תחום | סטטוס |
|------|--------|
| BMS 8,689 ₪ | **PAID_DATE_UNKNOWN** — סגור |
| פיצול תקבולים / הוצאות | **סגור** (JSON v2 + Excel) |
| CI journal | **מתוקן** (0180 → prepared) |
| commit/push/CI ירוק | **בביצוע** עם commit סגירה זה |

### נשאר לאישור בעלים בלבד

1. הרצת **0180** + backfill מאומת ב-Production.  
2. Smoke מחובר (session) בדשבורד — רווחיות / תזרים / תקורה.
