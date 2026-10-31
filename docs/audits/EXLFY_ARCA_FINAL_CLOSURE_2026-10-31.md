# EXLFY — ארכה: אימות סופי, 799 ₪, איחוד ספק, נטו/ברוטו

**תאריך:** 2026-10-31  
**Production read-only verification:** `scripts/local-audit/arca-final-verify-and-799.mjs`

## 1. טבלת התאמה סופית (בסיס אחיד)

**היקף:** «ארכה» + «ארכה בע"מ», הוצאות פעילות `finalized` (ללא void / reversal / מקור שהוחלף).  
**תשלום:** installments + כותרת, ללא כפילות; **לא** נספר תשלום על מקור `hasActiveReversal`.

| מדד | ברוטo (₪) |
|-----|----------:|
| הוצאות פעילות | **131,044.00** |
| תשלומים על פעילות | **70,905.00** |
| יתרה לתשלום | **60,139.00** |
| **131,044 − 70,905 − 60,139** | **0.00** |

**תזרim גולמי (כולל שורות לא-פעילות):** 71,704.00 ₪ (הפרש 799.00 ₪ — ראו §2).

## 2. הסבר מוכח ל־799.00 ₪

| רשומה | תאריך הוצאה | תפקיד |
|--------|-------------|--------|
| `7f31c326…` | 2026-02-28 | מקור 799 ₪ — **הוחלף** |
| `f59305ca…` | 2026-02-28 | **reversal** −799 ₪ על המקור (2026-08-27) |
| `48c5d620…` | 2026-03-31 | הוצאה **פעילה** 799 ₪ — **שולם** 2026-07-31 |

**Audit:** `expense.payment_confirmed` על `7f31c326…` ב-**2026-09-07** (paidAt **2026-06-30**, 799 ₪) — **אחרי** ה-reversal.

**מסקנה:** **לא כפילות תשלום לספק על אותה חשבונית פעילה.**  
- ההכרה העסקית הפעילה למרץ (`48c5d620`) מכוסה בנפרד (799 ₪ ב-31.07).  
- 799 ₪ על המקור שהוחלף הוא **שארית רישום תשלום על שורה מבוטלת** — לא נספר ב«תשלומים על פעילות» / יתרה.  
**אין המלצה למחיקה/שיוך מחדש** ללא החלטה תפעולית מפורשת.

## 3. איחוד ספק במערכת (ללא מחיקת היסטוריה)

**מצב:** שני `vendor_id`; «ארכה» בארכיון מאז 2026-08-27; «ארכה בע"מ» פעיל.

**קוד (ללא שינוי DB):**
- `normalizeVendorLegalNameForAlias` — קיבוץ שמות «ארכה» / «ארכה בע"מ».
- `resolveVendorAggregateScope` — `parent_vendor_id` + alias; `getVendorFinancialActivity` שולף `vendor_id IN (…)`.

**SQL מומלץ (metadata בלבד):** `docs/audits/sql-prepared/arca_link_archa_parent_vendor.sql` — **לא הופעל**; דורש אישור Owner נפרד.

## 4. שינויי קוד

- `get-vendor-financial-activity.ts` — aggregate vendors, installments ב-paid, totals net/gross.
- `vendor-financial-activity-view.tsx` — toggle נטו/ברוטo.
- `vendor-expense-cash-paid.ts`, `resolve-vendor-aggregate-ids.ts`.
- i18n `vendors.financialActivity.*` (he/en/ar/ru).
- Tests: `vendor-expense-cash-paid.test.ts`, `normalize-vendor-legal-name.test.ts`.

## 5. בדיקות

- `npx vitest run tests/unit/vendors/vendor-expense-cash-paid.test.ts tests/unit/vendors/normalize-vendor-legal-name.test.ts tests/unit/vendors/vendor-expense-activity-display.test.ts` — **pass**.
