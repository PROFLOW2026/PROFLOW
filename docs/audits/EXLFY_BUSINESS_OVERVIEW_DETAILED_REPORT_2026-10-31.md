# EXLFY — דוח עסקי מפורט (סקירה עסקית)

**תאריך:** 2026-10-31

## מה נוסף

- במסך `/financials/overview` — תפריט **הדפסה / PDF** עם **דוח מקוצר** (payload קיים, ללא שינוי) ו**דוח מפורט** (פרקים + כל השורות).
- מקורות: `getFinancialsOverview`, `getRecognizedCostBreakdown`, `getCashPaidBreakdown`, `listBillingRecords` (תקופה + snapshot), `listPaymentApplications`, `getOrganizationApPayables`, `getOrganizationProjectRollup` — **ללא מנוע חישוב חדש**.

## פרקים בדוח מפורט (ספירת רשומות בכותרת)

| פרק | תוכן |
|-----|------|
| סיכום מנהלים | KPIs כמו דוח מקוצר |
| עלות מוכרת | סיכום + טבלת כל השורות + rollup לפי צד/פרויקט/מקור/חודש |
| שולם בפועל | סיכום + כל שורות התשלום + rollup + יציאות צפויות בתקופה |
| הכנסות | חיובים בתקופה, תקבולים בתקופה, חייבים פתוחים (snapshot) |
| התחייבויות | AP פתוח (snapshot), התחייבויות לפי פרויקט, AP צפוי 30 יום |

## התאמת סכומים

- סיכום עלות מוכרת בדוח = `getRecognizedCostBreakdown` (totalNet / KPI); אזהרת parity כמו בדף הפירוט.
- שולם בפועל = `getCashPaidBreakdown` / `MonthCashFlow.display.paid`.
- מדדי snapshot וחלון 30 יום — מוסבר בהערות הדוח.

## בדיקות

- `tests/unit/financials/financial-print-reports.test.ts` — ללא שינוי התנהגות HTML.
- `tests/unit/financials/financial-overview-detailed-report.test.ts` — כותרת מקוצר, שורות מלאות במפורט.

## לא נגע

- Dashboard, דפי פירוט נפרדים, רווחיות העסק, `buildFinancialOverviewPrintPayload` (לוגיקה).
