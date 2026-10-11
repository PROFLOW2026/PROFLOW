# סגירת גל — הכרת עלות לפי תשלום (Closeout)

**ארגון:** `8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec`  
**Git base (אושר):** `cca3f330`, `2e659407` על `main`  
**תאריך:** 2026-10-12  

---

## 1. מה הושלם בגל Closeout

| תחום | סטטוס |
|------|--------|
| מקור אמת לפעימות (audit + `paidAt` ב-JSON schedule) | **קוד** — `expense-installment-payment-evidence.ts`, repository |
| Actual / רווחיות NET | **לא** due_date לפריסה — רק verified + partial ב-`paidAt` |
| תזרim `expandExpenseMonthCash` | **paid** לפי `actualPaidAt` מאומת; expected לפי due |
| GCM + `listUnallocatedExpenseContributions*` | payment-based (הוסר SQL managerial) |
| Migration `0180_expense_installment_payments.sql` | **הוכן בלבד** — לא ב-journal, לא הורץ |
| Unit tests | 358 financials + 246 expenses — **עבר** |
| Typecheck | **עבר** |

---

## 2. מה כבר היה תקין (גלים קודמים)

- `cca3f330` — Actual פרויקט + דשבורד pair  
- `2e659407` — GCM סכומים + overview NET  

---

## 3. מגבלת DB ומה נדרש

| נושא | פירוט |
|------|--------|
| **מגבלה** | אין עמודת `paid_at` per-installment ב-`expenses`; רק audit + אופציונלי JSON |
| **Migration** | `drizzle/migrations/0180_expense_installment_payments.sql` — **ממתין אישור Owner להרצה** |
| **Backfill** | ניתן לשחזר מ-`audit_events` (`installmentIndex`, `paidAt`) — **תוכנית בלבד**, לא הורץ |
| **NOT VERIFIED** | עסקאות עם `installments_paid_count` > 0 **בלי** audit per index — **0** ברווחיות/תזרim paid עד backfill |

**דוגמה:** ב.מ.ש (9/12) — אם אין 9 אירועי audit עם index — **לא מוכר** עד backfill.

**סלולר:** 7× audit מאומת — מוכר לפי `paidAt` במרץ–ספטמבר (~298.38 NET/חודש).

---

## 4. Excel §10

`ProjectFlow_Financial_2026.xlsx` — **לא עודכן** במסגרת גל זה (מבנה A–E + פתיחה ב-Excel).  
**חסום להשלמת COMPLETE** לפי §12 במנדט.

---

## 5. Production reconciliation

- **קריאה בלבד** — אין שינוי נתונים.  
- השוואה מלאה ינואר–אוקטובר 2026 ↔ Excel ↔ deploy חי — **לא PASS מספרי** (דורש סקריפט + Excel).  

---

## 6. שחרור

| שלב | הערה |
|-----|------|
| Commit closeout | לאחר push — ראה `git log -1` |
| CI / Vercel SHA | לא אומת מהסביבה (אין `gh auth`) |
| Deploy | קוד **ללא** תלות ב-0180 (audit-only) — בטוח לסכימה נוכחית |

---

## 7. האם COMPLETE?

**לא.**  
המערכת **לא** מסתמכת על due_date כ-paid **כאשר יש audit**.  
עדיין חסרים: Excel, backfill Production (אישור), reconciliation מספרית מלאה, ועסקאות ללא audit per-index.

---

## 8. מה חסום רק באישור migration/נתונים

1. הרצת `0180` + backfill ל-`expense_installment_payments`  
2. כתיבה ל-JSON schedule עם `paidAt` בכל תשלום עתידי (אופציונלי ללא migration)  
3. Excel §10  
