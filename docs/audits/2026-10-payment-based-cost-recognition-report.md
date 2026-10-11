# דוח — הכרת עלות לפי תשלום בפועל (מדיניות בעלים)

**ארגון:** `8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec` | **Production:** קריאה בלבד  
**תאריך:** 2026-10-12  

---

## 1. האם המערכת יישמה את המדיניות לפני התיקון?

**לא.** לפני השינוי:

| מסלול | התנהגות | התאמה למדיניות |
|--------|---------|----------------|
| Project Actual / `loadExpenseContributions` | פריסת **managerial schedule** (`expense_managerial_schedule_lines`) | **לא** — הכרה לפי חודש מתוכנן |
| דשבורד `costsThisMonth` | **expense_date** מלא לרוב ההוצאות | **לא** — לא לפי תשלום |
| תזרim `expandExpenseMonthCash` | תשלומי פריסה לפי **due date** של תשלום שסומן paid | **חלקי** — לא `paid_at` לכל פעימה; תואם backfill אוטומטי בסלולר |
| שכר EMC | חודשי — **לא** שונה | **כן** |

---

## 2. מסלולים שתוקנו בקוד

- `src/modules/expenses/domain/installment-payment-recognition.ts` — לוגיקת NET/GROSS לפי **תשלומים שבוצעו** (פריסה + תשלום חלקי).
- `src/modules/financials/data/expenses.repository.ts`:
  - `loadInstallmentAmountByExpenseForMonth` / `loadInstallmentRecognitionByExpense` — **payment-based**.
  - `sumOrganizationRecognizedCostPairInDateRange` — הוצאות לפי תשלום + AP + EMC.
- בדיקות: `tests/unit/expenses/installment-payment-recognition.test.ts` (דוגמת 1,000 ₪ / 5 תשלומים).

---

## 3. מסלולים שעדיין דורשים יישור (לא הושלמו בגל זה)

- SQL ב-`sumUnallocatedExpensesForMonth`, `sumCompanyOnlyExpensesForMonth`, `general-cost-sources.repository.ts` — עדיין **managerial schedule** ב-SQL.
- `sumOrganizationRecognizedCostsInDateRange` (NET בלבד, legacy) — עדיין **expense_date**.
- **Excel** `ProjectFlow_Financial_2026.xlsx` — מבנה «תשלומים בראש החודש» (סעיף 10) **לא** הושלם; הקובץ משקף ניקוי קודם + פריסה ישנה.

**סטטוס:** **לא COMPLETE** לכל המערכת — רק מסלולי Actual/דשבורד pair הראשיים.

---

## 4. עסקת סלולר `e800507f-2ff4-468b-aa32-63a849ba398d`

| שדה | ערך Production |
|-----|----------------|
| GROSS | 8,450 ₪ |
| NET | 7,161.02 ₪ |
| תשלומים | 24 |
| שולמו | **7** (`installments_paid_count=7`, gross paid **2,464.56 ₪**) |
| יתרה | **5,985.44 ₪** gross |
| `payment_status` | upcoming |

**audit_events:** 7× `expense.payment_confirmed` (אוטומטי) — **352.08 ₪ gross** לכל פעימה, `paidAt` מרץ–ספטמבר 2026.

**הכרה לפי מדיניות (NET ≈ 298.38 לחודש paid):** מצטבר ~**2,088.66 ₪ NET** (7 תשלומים), **לא** 7,161 ₪ במרץ.

---

## 5. עסקאות בתשלומים (finalized, 2026)

7 עסקאות (כולל void אחת שלא ב-Actual): ב.מ.ש, צמיגים, סלולר, ברדוגו, דלק, אספקה טכנית, סלולר/מחשוב (3×700 gross עתידי).

---

## 6–8. השפעה

- **רווחיות / Actual:** ירידה בחודשי רכישה (מרץ סלולר ~298 במקום ~7,161) והעברה לחודשי **תשלום**.
- **תזרim:** ללא שינוי קוד בגל זה — עדיין `month-cash-flow`.
- **היסטוריה:** שינוי **תצוגה/מנוע** בלבד — **ללא** SQL על Production.

---

## 9. בדיקות

- `installment-payment-recognition.test.ts` — **עבר**.
- `expense-installment-purchases.test.ts` — **עבר**.
- CI מלא / Deploy — **ממתין** לריצת preflight לפני push.

---

## 10. Excel

**לא עודכן** למבנה «תשלומים בראש החודש» במסגרת גל זה. נדרשת הרצת ייצוא מחדש לאחר deploy.

---

## 11. Commit / Deploy

י בוצעו לאחר אימות typecheck/tests מקומיים (ראה הודעת commit).
