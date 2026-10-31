# EXLFY — תיקון: התראות על הוצאה מבוטלת (void + needs_classification)

**תאריך:** 2026-10-31  
**סטטוס:** תיקון קוד מקומי — **ללא Push / Deploy** (ממתין לאישור הבעלים)

---

## 1. אימות Production (READ-ONLY)

**מקור:** `scripts/local-audit/verify-void-expense-attention-readonly.mjs` → `DATABASE_URL` מ-`.env.local`  
**ארגון:** `8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec`

### הוצאה שדווחה (מבוטלת)

| שדה | ערך |
|-----|-----|
| **id** | `c7cb968d-2b51-4135-884d-15f28496fcb3` |
| status | `void` |
| classification_status | `needs_classification` |
| cost_category_id | null |
| expense_date | 2026-10-11 |
| gross_amount | 245.00 |
| supplier | אספקה טכנית |
| project | חורגין 36 רמת גן |
| payment_status | paid (paid_at 2026-10-11) |
| updated_at | 2026-10-25 (תואם ביטול) |

### הערה — שורה נוספת באותו חיפוש

קיימת **הוצאה נפרדת** `401d07f9-e74f-47e6-bb7b-4a3c53cb2147` — אותו סכום/תאריך/ספק/פרויקט, **finalized + classified** (פעילה, לא הבעיה).

### הוצאות void נוספות שעמדו ליפול ב-SQL הישן

| מ metric | ערך |
|--------|-----|
| void + needs_classification (ללא reversal/adjustment) | **1** (רק `c7cb968d…`) |

---

## 2. סיבת שורש (מאומתת)

- `voidExpense` משאיר `classification_status = needs_classification`.
- SQL ל-attention/count סינן reversal/adjustment אך **לא** `status = void`.
- הדומיין (`isExpenseAttentionEligible`) כבר מוציא void — פער SQL בלבד.
- מרכז התראות: `collectExpensesNeedingClassification` → `listExpenses` + `attentionFilter: classification`.
- מונה רשימה: `countExpensesNeedingAttentionForOrg`.

---

## 3. תיקון

**קובץ:** `src/modules/expenses/data/expenses.repository.ts`

- פונקציה **`appendExpenseAttentionEligibilityConditions`** — מirror ל-`isExpenseAttentionEligible`:
  - `status <> void`
  - `voids_expense_id` / `adjusts_expense_id` null
  - אין reversal פעיל
- **`appendActionableExpenseAttentionConditions`** — קורא ל-helper (רשימות + CC collectors).
- **`countExpensesNeedingAttentionForOrg`** — אותו helper (מונה org-wide).

**לא בוצע:** auto-handle, שינוי DB, מחיקת התראות, backfill.

---

## 4. מסלולים מכוסים

| מסלול | מנגנון |
|--------|--------|
| פעמון / Today — סיווג | `listExpenses` + classification filter |
| פעמון — allocation / approval / any | `appendActionable…` |
| מונה «דורשות טיפול» | `countExpensesNeedingAttentionForOrg` |
| תשלומים (overdue וכו') | כבר `isExpensePaymentObligationEligible` → ללא שינוי |

---

## 5. בדיקות מקומיות

```
npx vitest run tests/unit/expenses/expense-attention.test.ts tests/unit/expenses/expense-attention-sql-parity.test.ts
```

**תוצאה:** 16/16 passed  
**eslint** על `expenses.repository.ts`: נקי

---

## 6. התנהגות צפויה אחרי פריסה

- `c7cb968d…` **לא** יופיע ב-`expense_needs_classification` ובמונה attention.
- הוצאות **פעילות** עם `needs_classification` / draft / shared unallocated — **נשארות** actionable.
- void בעתיד — אוטומטית מחוץ ל-attention (ללא backfill).

---

## 7. קבצים

| קובץ | שינוי |
|------|--------|
| `src/modules/expenses/data/expenses.repository.ts` | eligibility SQL |
| `tests/unit/expenses/expense-attention-sql-parity.test.ts` | parity tests |
| `scripts/local-audit/verify-void-expense-attention-readonly.mjs` | אימות read-only (לא חלק מ-runtime) |
