# דוח סופי — הכרת עלות לפי תשלום (סגירת פערים)

**בעלים:** 18eran@gmail.com  
**ארגון:** `8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec`  
**Git HEAD (גל זה):** לאחר commit closeout — ראה `git log -1`  
**Production:** קריאה בלבד  
**תאריך:** 2026-10-12  

---

## סטטוס כולל: **לא COMPLETE**

| קriterion | סטטוס |
|----------|--------|
| קוד + audit evidence + BMS lump | **הושלם** |
| מיגרציה 0180 מתוקנת (מוכנה) | **הושלם** — **לא הורץ** |
| התאמה מספרית 7 עסקאות + חודשים | **הושלם** (מנוע + JSON) |
| Excel — גיליון התאמה + פתיחה ב-Excel | **חלקי** — לא מבנה §5 מלא לכל חודש |
| Deploy SHA / CI | **לא אומת** מהסביבה |

---

## 1. מה תוקן בפועל

- **`resolveInstallmentPaymentState`** — סטטוסים: `UNPAID`, `PAID_VERIFIED`, `PAID_DATE_UNKNOWN`, `PARTIALLY_VERIFIED`.
- **תשלום מרוכז (lump)** — audit בלי `installmentIndex` (ב.מ.ש) → **PAID_VERIFIED** בחודש `paidAt` בלבד.
- **סכום ששולם ללא חודש מאומת** → `dateUnknownGross` (לא 0 מדומה, לא שיוך לחודש).
- **מיגרציה 0180** — תוקנה: partials, `reverses_payment_id`, idempotency על `audit_event_id`, **הוסר** UNIQUE שגוי על `(index, status)`.
- **Excel** — גיליון `Payment_Reconciliation_2026` (RTL), נשמר ו**נפתח ב-Microsoft Excel** (COM).
- **סקריפטים:** `.tools/payment-reconciliation-report.mjs`, `scripts/excel-payment-recognition-update.ps1`.

---

## 2. מה עדיין תלוי במיגרציה

- טבלת `expense_installment_payments` ב-Production — **לא קיימת**.
- Idempotency ו-void/credit ברמת DB — **רק בקובץ SQL**.
- **אין לפרוס** קוד ש**דורש** את הטבלה עד אישור + הרצה.

**קובץ:** `drizzle/migrations/0180_expense_installment_payments.sql`  
**Journal Drizzle:** עדיין **לא** נוסף ל-meta (מכוון — לא מיושם).

---

## 3. מה עדיין תלוי ב-backfill

- כתיבת שורות ledger מ-`audit_events` → **תוכנית בלבד**, **לא הורץ**.
- עסקאות עתידיות: audit + (אופציונלי) ledger אחרי migration.

---

## 4. שבע עסקאות Production (2026)

| ספק | פעימות | שולמו | סטטוס | GROSS שולם | מאומת | יתרה GROSS | audits |
|-----|--------|-------|--------|------------|-------|------------|--------|
| ב.מ.ש | 12 | 9* | PAID_VERIFIED | 8,689 | 8,689 | 0** | 1 (manual lump) |
| טיפולי רכב (צמיגים) | 6 | 6 | PAID_VERIFIED | 1,700 | 1,700 | 0 | 6 |
| סלולר | 24 | 7 | PAID_VERIFIED | 2,464.56 | 2,464.56 | 5,985.44 | 7 |
| ברדוגו | 2 | 2 | PAID_VERIFIED | 1,593 | 1,593 | 0 | 2 |
| דלק | 8 | 8 | PAID_VERIFIED | 8,286 | 8,286 | 0 | 9 |
| אספקה טכנית | 8 | 8 | PAID_VERIFIED | 1,710 | 1,710 | 0 | 8 |
| סלולר/מחשוב | 3 | 0 | UNPAID | 0 | 0 | 2,100 | 0 |

\* שדה `installments_paid_count=9` אך `paid_gross` = **מלוא** 8,689 — סתירת ספרים בנתוני מקור; המנוע משתמש ב-audit + `paid_gross`.  
\*\* יתרה 0 לפי gross−paid; ייתכן פער מול 3 פעימות “לא שולמו” בלוח.

**ב.מ.ש:** audit יחיד — `paidAt` **2026-09-06**, GROSS **8,689** → רווחיות **ספטמבר** NET ≈ **7,363.56** (לא פריסה לפי due).

**סלולר:** 7×352.08 GROSS → NET ≈298.37 בכל חודש **מרץ–ספטמבר 2026**.

**חריגות `dateUnknownGross`:** **0** לכל 7 (כולם מאומתים או לא שולמו).

---

## 5. התאמה חודשית (NET מוכר / GROSS מאומת) — מנוע + Production audit

| חודש | NET מוכר (≈) | GROSS מאומת (≈) |
|------|--------------|-----------------|
| 2026-01 | 1,299 | 1,533 |
| 2026-02 | 1,299 | 1,533 |
| 2026-03 | 2,272 | 2,681 |
| 2026-04 | 2,272 | 2,681 |
| 2026-05 | 1,597 | 1,885 |
| 2026-06 | 1,597 | 1,885 |
| 2026-07 | 1,357 | 1,602 |
| 2026-08 | 1,357 | 1,602 |
| 2026-09 | 14,684 | 17,327 |
| 2026-10 | 0 | 0 |

מקור: `.tools/payment-reconciliation-2026.json` (קריאה בלבד).

---

## 6. Excel

- **קובץ:** `ProjectFlow_Financial_2026.xlsx` (שורש repo).
- **נוסף:** גיליון `Payment_Reconciliation_2026` (RTL), סיכום חודשי + 7 עסקאות.
- **נפתח:** Microsoft Excel (COM) — **בוצע**.
- **לא הושלם:** מבנה §5 (גיליון נפרד לכל חודש עם A–H מלא + EMC + תזרim).

---

## 7. בדיקות

| בדיקה | תוצאה |
|--------|--------|
| Unit expenses (payment evidence) | **עבר** |
| Unit financials (358) | **עבר** |
| Typecheck | **עבר** |
| Lint / build מלא | **לא הורץ** בגל זה |

---

## 8. Git / CI / Deploy

| | |
|--|--|
| Commits קודמים | `cca3f330`, `2e659407`, `5465b85e` |
| Commit גל זה | ממתין push |
| CI / Production SHA | **לא אומת** |

---

## 9. נדרש אישור בעלים

1. **הרצת migration 0180** ב-Production (אחרי review SQL + RLS).  
2. **Backfill** `expense_installment_payments` מ-audit (סקריפט נפרד).  
3. (אופציונלי) השלמת Excel — גיליונות חודשיים מלאים בעברית.

---

## 10. מסקנה

המערכת **אינה** מציגה 0 לתשלומים עם כסף ששולם (BMS lump → ספטמבר).  
**לא** משתמשת ב-due_date כתאריך תשלום כשיש audit.  
**COMPLETE** נחסם על: Excel §5 מלא, אימות post-deploy, ו-ledger ב-DB (0180).
