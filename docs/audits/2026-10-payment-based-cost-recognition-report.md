# דוח סופי — הכרת עלות לפי תשלום בפועל (מדיניות בעלים)

**ארגון:** `8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec` (מתח ח.י הנדסת חשמל בע"מ)  
**Production:** קריאה בלבד | **תאריך דוח:** 2026-10-12  
**סטטוס כולל:** **לא COMPLETE** — ליבת Actual/דשבורד/GCM יושרה בקוד; Excel §10, תזרim מלא, ורגרסיה חודשית מול Production לא נסגרו עד האגורה.

---

## 1. האם המערכת יישמה את המדיניות לפני התיקון?

**לא.** לפני השינוי:

| מסלול | התנהגות ישנה | התאמה |
|--------|--------------|--------|
| Project Actual / `loadExpenseContributions` | פריסת **managerial schedule** | לא |
| דשבורד `costsThisMonth` (pair) | **expense_date** מלא | לא |
| GCM / תקורה (`sumUnallocated*`, `general-cost-sources`) | **managerial schedule** ב-SQL | לא |
| `sumOrganizationRecognizedCostsInDateRange` | **expense_date** | לא |
| תזרim `month-cash-flow` | תשלומי פריסה לפי **due date** (לא `paid_at` לכל פעימה) | חלקי |
| שכר EMC | חודשי — **לא נגע** | כן |

---

## 2. מסלולים שתוקנו בקוד (אחרי deploy)

| קובץ / פונקציה | שינוי |
|----------------|--------|
| `installment-payment-recognition.ts` | NET/GROSS לפי תשלומים שבוצעו (פריסה + חלקי) |
| `loadExpenseContributions`, `loadInstallmentAmountByExpenseForMonth` | Actual פרויקט — payment-based |
| `sumOrganizationRecognizedCostPairInDateRange` | הוצאות לפי תשלום + AP + EMC |
| `sumOrganizationRecognizedCostsInDateRange` | מפנה ל-pair (NET) |
| `sumUnallocatedExpensesForMonth`, `sumUnallocatedExpensesGroupedByYearMonth` | payment-based |
| `sumCompanyOnlyExpensesForMonth` | payment-based |
| `loadGeneralCostExpenseSourceTotalsByMonths` + `general-cost-sources.repository` | מקורות תקורה — payment-based |

**Commits:** `cca3f330` (ליבה Actual + דשבורד pair), commit נוסף בגל המשך (GCM + overview NET).

**Deploy:** push ל-`main` בוצע; CI/Vercel — לא אומת מהסביבה (אין `gh auth`); יש לאמת ב-GitHub/Vercel לפי SHA.

---

## 3. מסלולים שעדיין לא מיושרים / מגבלות מודל

1. **`listUnallocatedExpenseContributionsForMonth`** (UI פירוט חודש) — עדיין SQL managerial — **סטייה אפשרית בתצוגת שורות**, לא בסכום GCM אחרי התיקון.
2. **תזרim (`month-cash-flow`)** — לא שונה; עלול להסתמך על due date מול `paid_at` בפעימות נפרדות.
3. **הכרה בפריסה:** אין ב-DB `paid_at` לכל תשלום בפריסה — רק `installments_paid_count`, `paid_gross_amount`, `paid_at` אחרון. המנוע מייחס תשלומים שסומנו כ-paid ל**חודש due date** של כל פעימה (מתאים ל-backfill `automatic_installment_policy` עם audit `paidAt` לכל index). **תשלום מאוחר באותו חודש** (דוגמה §2 אפריל) **לא** ממופה במלואו לחודש התשלום האמיתי ללא audit/שדות per-installment — דורש הרחבת מודל או קריאת audit.
4. **Excel** `ProjectFlow_Financial_2026.xlsx` — **לא** עודכן למבנה §10 (תשלומים בראש כל חודש + RTL מלא).
5. **התאמה מספרית חודשית 2026-01…2026-10** מול Production — חלקית (ראה §5–6); לא הוכרז COMPLETE.

---

## 4. עסקת סלולר (חובה) `e800507f-2ff4-468b-aa32-63a849ba398d`

| שדה | Production |
|-----|------------|
| GROSS / NET / VAT | 8,450 / 7,161.02 / 1,288.98 ₪ |
| תשלומים | 24 |
| שולמו | **7** — gross מצטבר **2,464.56 ₪** |
| יתרה gross | **5,985.44 ₪** (= 8,450 − 2,464.56) |
| `payment_status` | upcoming (יתרה פתוחה — תקין) |

**Audit (7× `expense.payment_confirmed`):** כל פעימה **352.08 ₪ gross**, `paidAt` **2026-03-01 … 2026-09-01** (index 0–6).  
**NET לפעימה ≈ 298.38 ₪** (יחס net/gross).

**הכרה לפי מדיניות (אחרי תיקון):**  
- מרץ–ספטמבר 2026: ~**298.38 NET** לחודש (7 חודשים) → מצטבר ~**2,088.66 NET**.  
- **לא** 7,161 ₪ במרץ (רכישה).  
- מרץ–פברואר 2026 לפני תשלום: **0** ברווחיות.

**Excel / מנוע:** הקובץ בשורש הפרויקט עדיין משקף ניקוי קודם + פריסה ישנה — **לא** אומת מול מנוע payment-based.

---

## 5. עסקאות בתשלומים (finalized, org, 2026)

| מזהה (קצר) | ספק | תשלומים | שולמו | GROSS | הערה |
|------------|-----|---------|-------|-------|------|
| bbd3cdce… | ב.מ.ש | 12 | 9 | 8,689 | paid_at אחרון 2026-09-06 |
| 332bedd7… | צמיגים | 6 | 6 | 1,700 | paid |
| e800507f… | סלולר | 24 | 7 | 8,450 | §4 |
| 253c6631… | ברדוגו | 2 | 2 | 1,593 | paid |
| 23b26eee… | דלק | 8 | 8 | 8,286 | paid |
| 85c2986b… | אספקה טכנית | 8 | 8 | 1,710 | paid |
| 0205f694… | סלולר/מחשוב | 3 | 0 | 2,100 | עתידי — **0** ברווחיות |

(מקור: `.tools/payment-audit-cellular.json` — `allInstall`.)

---

## 6. סיכום NET / תזרim (מדיניות — לא מול Production post-deploy)

| חודש | עיקרי (NET מוכר מפריסות ששולמו — סלולר בלבד) | הערה |
|------|-----------------------------------------------|------|
| 2026-03 … 2026-09 | ~298.38/חודש (סלולר) | + עסקאות אחרות לפי paid/due |
| 2026-10 | 0 (סלולר — תשלום 8 לא שולם) | |

**GROSS ששולם (סלולר):** 352.08 × 7 = 2,464.56 ₪.  
**סכום צפוי / התחייבות:** יתרה 5,985.44 gross על סלולר + לוחות עתידיים על 0205f694…

---

## 7. השפעת התיקון

| תחום | השפעה |
|------|--------|
| **רווחיות / Actual** | ירידה בחודש רכישה של פריסות; העברה לחודשי תשלום (paid indices) |
| **דשבורד costs** | NET לפי תשלום (pair) |
| **GCM / תקורה** | אותה לוגיקה — לא schedule |
| **תזרim** | ללא שינוי קוד בגל זה |
| **Production DB** | **ללא** שינוי |
| **היסטוריה** | שינוי חישוב באפליקציה בלבד |

---

## 8. בדיקות רגרסיה (מקומיות)

| בדיקה | תוצאה |
|--------|--------|
| `installment-payment-recognition.test.ts` (1,000 NET / 5 תשלומים, ללא מע"מ) | עבר |
| `expense-installment-purchases.test.ts` | עבר (גל קודם) |
| `tests/unit/financials/**` | עבר (358+) |
| מatrix §11 (16 סוגרים) | **לא** הושלם end-to-end |
| Excel §17–18 | **לא** |

---

## 9. Excel

- קובץ: `ProjectFlow_Financial_2026.xlsx` (שורש repo).  
- **לא** עודכן למבנה §10.  
- **לא** נפתח ב-Microsoft Excel במסגרת גל זה.

---

## 10. Commit / Push / Deploy

| שלב | סטטוס |
|-----|--------|
| Commit `cca3f330` | בוצע |
| Push `main` | בוצע |
| Commit גל GCM (מקומי) | ממתין commit/push |
| CI | לא נבדק (gh לא מאומת) |
| Smoke Production | לא בוצע |

---

## 11. ממצאים שלא הושלמו + סיבה

| ממצא | סיבה |
|------|------|
| Excel §10 | היקף ייצוא + RTL — לא בוצע |
| התאמה חודשית מלאה 2026 | דורש סקריפט/read-only + deploy חי |
| תזרim לפי `paid_at` | לא בוצע |
| UI list contributions SQL | נשאר managerial |
| per-installment paid month (תשלום מאוחר) | אין שדה DB — מגבלת מודל |
| הכרזת COMPLETE | אין התאמות מספריות מלאות Excel↔מנוע↔Production |

---

## 12. מסקנה

המערכת **לא** יישמה את מדיניות ההכרה לפי תשלום בפועל לפני התיקון. **לאחר** השינויים ב-repo, מסלולי **Actual פרויקט**, **דשבורד עלות מוכרת**, ו-**GCM/תקורה (סכומים)** מיושרים ללוגיקת `installment-payment-recognition`.  
**עדיין נדרש:** deploy מאומת, Excel, תזרim, פירוט UI, וסגירה מספרית לכל 2026 — לפני COMPLETE.
