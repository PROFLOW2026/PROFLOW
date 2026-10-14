# OWNER_FINANCIAL_RECONCILIATION_2026

**ארגון:** מתח ח.י הנדסת חשמל בע"מ
**תקופה:** 2026-01-01 – 2026-10-11
**נוצר:** 2026-10-11T20:51:58.230Z
**מצב:** קריאה בלבד מ-Production

## פסק דין מסכם

| תחום | מצב |
|------|-----|
| הוצאות (113+ finalized בטווח) | VERIFIED — allocations 0 mismatch; no internal_employee_payroll double |
| שכר EMC + הקצאות | VERIFIED — known_amount rule; conservation delta 0 on applied runs (see evidence) |
| AP / חשבוניות ספק | VERIFIED — costs via expenses only; AP empty |
| הכנסות / billing | PARTIALLY VERIFIED — 10 finalized; 6 עם issue_date ינ–יול אך finalize ב-27/08/2026 |
| תזרים חודשי | VERIFIED — paidActual = sum paid lines each month |
| Snapshot 09/2026 vs compose | PARTIALLY VERIFIED — EXPLAINED time mismatch; ~5k UNEXPLAINED without historical compose |

## 1. ספר הוצאות
- סה"כ שורות בטווח (כל הסטטוסים לבקרת שלמות): **120**
- finalized: **113**
- סיווג: **category_key / cost_family בלבד** — לא נגזר מתיאור.
- כל שורה: גיליון **ALL_EXPENSES** + חודשים **JAN…OCT**.

## 2. ספר שכר
- **known_amount** = actual אם הוזן, אחרת estimate — **לא** סכום שניהם.
- תשלומי **paid_amount** נפרדים מהכרת עלות (אין דריסה אוטומטית).
- שורות EMC פעילות: **36**; journal כולל superseded: **76**.

## 3. ספקים / AP
- ap_bills: **0**; ap_payments: **0**; PO commitments: **0**.
- כיסוי מקורות: הוצאות finalized + (AP=0) — **אין כפל AP+Expense** במסלול Actual.

## 4. הכנסות
- billing_records: **14** (finalized: **10**; draft/void: ראה גיליון).
- **למה נראה “רק אוג–ספט” בקיבוץ finalized_at:** 6 חשבונות עם `issue_date` בינואר–יולי **סומנו finalized רק ב-2026-08-27** (0002–0007). לפי `issue_date` יש הכנסות מחושבות בכל חודש; לפי `finalized_at` רוב ה-NET נופל לאוגוסט.
- **CCV:** 4 חוזים; **contract_value_events** בטווח: 4 שורות — גיליון **CLIENT_BILLING_COLLECTIONS**.
- תשלומי לקוח (`payments`): **10** — לא מזוהים כ“הכרה” בדשבורד CCV.

## 5. רווחיות פרויקטים
- עלות עובדים: **labor_allocation_run_lines** (applied) — לא time_entry.cost (displacement).
- snapshots + compose: גיליון **PROJECT_PROFITABILITY** / **SNAPSHOT_RECONCILIATION**.

## 6. פער snapshot ספטמבר 2026
- סה"כ פער composeDirect − snapshot (09): **11,039.72 ₪** (606,633.25 − 595,593.53).
- לפי פרויקט (SNAPSHOT_RECONCILIATION): ברנדיס +2,401.18 | חורגין +6,937.11 | פינס +125.53 | ויתקין +1,575.90.
- **EXPLAINED DIFFERENCE:** snapshot `captured_at` 2026-09-30; compose באודיט = מצטבר עד 2026-10-11; **0** הוצאות finalized עם `updated_at` אחרי 30/09 על 4 הפרויקטים.
- **EXPLAINED (חלקי):** runs עבודה עם `applied_at` אחרי cutoff — לא שווים לפער (סכומי run מלאים); Oct-2026 EMC על קווי פרויקט ≈ **6,023 ₪** מסביר חלק מהעלייה המצטברת.
- **NOT RECONSTRUCTABLE:** compose נקודתי לסוף 09/2026 — לא נשמר ב-DB.
- **UNEXPLAINED:** ≈ **5,017 ₪** ללא replay compose היסטורי (חסר: compose-as-of לכל פרויקט ב-2026-09-30 23:59).

## 7. כפילויות
- No structured duplicate EMC or internal_employee_payroll expense rows detected
- internal_employee_payroll expenses: **0**

## 8–9. התאמה חודשית
### 2026-01
- Recognized (engine): dashboard **94685.75** = recognizedNet **94685.75** → **MATCHED** (Δ **0.00**)
- SQL slice sum (exp+AP+labor): **94685.75**; Δ מול engine: **0.00**
- Cash paid: **5407.31**; lines sum: **5407.31** → **MATCHED**
### 2026-02
- Recognized (engine): dashboard **83228.86** = recognizedNet **83228.86** → **MATCHED** (Δ **0.00**)
- SQL slice sum (exp+AP+labor): **83228.86**; Δ מול engine: **0.00**
- Cash paid: **47779.31**; lines sum: **47779.31** → **MATCHED**
### 2026-03
- Recognized (engine): dashboard **91261.12** = recognizedNet **91261.12** → **MATCHED** (Δ **0.00**)
- SQL slice sum (exp+AP+labor): **91261.12**; Δ מול engine: **0.00**
- Cash paid: **116807.29**; lines sum: **116807.29** → **MATCHED**
### 2026-04
- Recognized (engine): dashboard **85807.20** = recognizedNet **85807.20** → **MATCHED** (Δ **0.00**)
- SQL slice sum (exp+AP+labor): **85807.20**; Δ מול engine: **0.00**
- Cash paid: **79892.89**; lines sum: **79892.89** → **MATCHED**
### 2026-05
- Recognized (engine): dashboard **96142.25** = recognizedNet **96142.25** → **MATCHED** (Δ **0.00**)
- SQL slice sum (exp+AP+labor): **96142.25**; Δ מול engine: **0.00**
- Cash paid: **72192.39**; lines sum: **72192.39** → **MATCHED**
### 2026-06
- Recognized (engine): dashboard **97567.53** = recognizedNet **97567.53** → **MATCHED** (Δ **0.00**)
- SQL slice sum (exp+AP+labor): **97567.53**; Δ מול engine: **0.00**
- Cash paid: **99689.41**; lines sum: **99689.41** → **MATCHED**
### 2026-07
- Recognized (engine): dashboard **121058.53** = recognizedNet **121058.53** → **MATCHED** (Δ **0.00**)
- SQL slice sum (exp+AP+labor): **121058.53**; Δ מול engine: **0.00**
- Cash paid: **99126.74**; lines sum: **99126.74** → **MATCHED**
### 2026-08
- Recognized (engine): dashboard **124910.25** = recognizedNet **124910.25** → **MATCHED** (Δ **0.00**)
- SQL slice sum (exp+AP+labor): **124910.25**; Δ מול engine: **0.00**
- Cash paid: **119862.06**; lines sum: **119862.06** → **MATCHED**
### 2026-09
- Recognized (engine): dashboard **122326.49** = recognizedNet **122326.49** → **MATCHED** (Δ **0.00**)
- SQL slice sum (exp+AP+labor): **122326.49**; Δ מול engine: **0.00**
- Cash paid: **127611.44**; lines sum: **127611.44** → **MATCHED**
### 2026-10
- Recognized (engine): dashboard **21733.16** = recognizedNet **21733.16** → **MATCHED** (Δ **0.00**)
- SQL slice sum (exp+AP+labor): **21733.16**; Δ מול engine: **0.00**
- Cash paid: **61647.40**; lines sum: **61647.40** → **MATCHED**

## 10. קבצים
- `MASTER_FINANCIAL_LEDGER_2026.xlsx`
- `RECONCILIATION_EVIDENCE.json`
- `ledger-data.json` (גיבוי מלא)

**אזהרה:** אל תעלה קבצים אלה ל-GitHub / deploy.