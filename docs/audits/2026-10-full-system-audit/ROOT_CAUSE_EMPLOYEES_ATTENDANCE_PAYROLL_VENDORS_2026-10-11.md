# ProjectFlow — חקירת שורש-סיבה: נוכחות, שכר, ספקים וממשק אנשים

| שדה | ערך |
|-----|-----|
| **מזהה** | `ROOT_CAUSE_EMPLOYEES_ATTENDANCE_PAYROLL_VENDORS_2026-10-11` |
| **מצב** | **חקירה בלבד** — ללא שינוי קוד, SQL, migrations, commit או deploy |
| **Baseline קוד** | `35e2ff0f` (`main`, 2026-10-10) |
| **תאריך** | 2026-10-11 |
| **שיטה** | 5 סוכני משנה במקביל (תחומים 1–5) + אימות Vitest ממוקד (34 בדיקות PASS) |
| **Production DB** | **לא נסרק** — ערן יוסף אומת בנתיב קוד ובדיקות, לא בשורות חיות |
| **מקורות צולבים** | `PROJECTFLOW_FINAL_UNIFIED_FINDINGS.md`, AGENT_08/09, WF-006/007, V09-002–006 |

**סוכני משנה:** [נוכחות והרשאות](e7f400d0-3368-49db-af29-19d4eaba0ce5) · [שכר ועלות מעסיק](3f2581e7-6617-4baa-b4de-8ca8e370a195) · [ספקים ותשלומים](a6855046-17f2-4ab7-88af-3c656b9bd92b) · [ממשק אנשים/מובייל](42dc1e1b-2a79-47a3-91c4-d553b7de6184) · [Git ורגרסיה](eff17530-734e-4fc5-baa5-771b2b8f21ca)

---

## 1. רגרסיות מאומתות ומה השתנה מאז ש«עבד»

| # | תסמין חי (דיווח) | שינוי / מנגנון | מתי (Git) | ודאות |
|---|------------------|----------------|-----------|--------|
| R1 | עדכון נוכחות מהאפליקציה הראשית עם **שיוך פרויקט** → שעות **ממתינות** (draft), לא מאושרות | `canPromote = time.approve ∧ org.attendanceProjectTimeApproval === 'auto_approve'`; ברירת מחדל **`draft`** | **`705438a1`** (2026-10-09) — לפני כן קידום היה רק `canApprove` | **גבוהה** |
| R2 | «מאגר שעות ממתינות» גדל; תור אישורים לא מציג הכל | `pendingHours` = **draft + submitted**; `/workforce/time/approvals` מסנן **`submitted` בלבד** | התנהגות מצטברת; חידוד ב-705438a1 | **גבוהה** |
| R3 | מנהל/מזכירה עם `attendance.manage` מצפים ל**אישור מיידי** — בפועל לא | **`attendance.manage` ≠ `time.approve`**; Actual לפרויקט דורש `approval_status=approved` | ארכitektura + WF-006 | **גבוהה** |
| R4 | אישור גיליון / תור — «לא נמצא» במקום «אין הרשאה» | `approveTimesheet` טוען גיליון **לפני** בדיקת הרשאה (**W08-007**) | 705438a1 (scoped approval) | **גבוהה** (באג מאומת) |
| R5 | מאשר פרויקט (`operational.approve`) מאשר רשומה אך **לא רואה תור ארגוני** | `listTimeApprovalQueue` עדיין דורש **`time.approve`** | 705438a1 | **גבוהה** |
| R6 | מסך עובד — כל הסעיפים פתוחים; גלילה ארוכה | `EmployeeAppAccessPanel`: `defaultOpen` על גישה ופעולות חשבון; שכר/עריכה **ללא אקורדיון** | **`05cd7bbe`** (2026-09-17); לא 5176cbcc | **גבוהה** |
| R7 | אותה הוצאה/ספק ב«שולם» וב«צפוי» | שכבות נפרדות: **מזומן חודשי**, **תחזית 90 יום** (`recurring_draft`), **Actual** (הוצאה+AP) — UX מציג במקביל | c247c11d, תחזית org | **בינונית** (תקין לעיתים; בלבול UX) |
| R8 | Actual פרויקט / ספק **מנופח** (14k וכד') | **V09-002**: bill מלא + יתרת expense אחרי match חלקי | compose + unit tests | **גבוהה** (קוד) |
| R9 | שכר/עלות מעסיק — UI מציג **27,000** אך חודש פתוח ב-EMC **פחות** | accrual חודש פתוח vs **unit pool** מלא | עיצוב, לא רגרסיית commit יחיד | **גבוהה** (הבנה) |
| R10 | Employee App — אישור/עדכון שכר ממסלול חדש | **`5176cbcc`** — grants נדרשים ל-mutations | 2026-10-10 | **בינונית** |

**מה לא הוכח כרגרסיה:** שינוי נוסחת 18,000+50%→27,000 (נוסחה **עקבית** בקוד). כפל מזומן payroll **מכוון** נפרד מ-Actual (canonical payroll cash).

---

## 2. מסלולי הרשאות וסטטוסים — עובד מול מנהל/מזכירה/בעלים

### 2.1 מפת הרשאות (Org RBAC)

| פעולה | עובד / worker | manager (תבנית) | finance | owner |
|--------|---------------|-----------------|---------|-------|
| שעון נוכחות היום | `attendance.self` | `attendance.manage` + self | `attendance.read` בלבד | הכל |
| נוכחות ידנית / טווח / רטרו (אירועים) | לא | **`attendance.manage`** | לא | כן |
| רשומת **שעות פרויקט** | `time.manage` (self) | כן + **`time.approve`** | **`time.approve`** (ללא `time.manage`) | כן |
| אישור שעות → Actual | לא | **`time.approve`** (לא נגזר מ-manage) | approve בלבד | כן |
| שיוך לצוות פרויקט | לא | **`workforce.manage`** | לא | כן |
| תיקון נוכחות **בקשה** (עובד) | `attendance.self` → **pending** | manager יכול להגיש בשם — עדיין **pending** עד review | — | review עם manage |
| אישור תיקון / שעות בפרויקט בלבד | — | **`operational.approve`** (יכולת פרויקט) | — | + org-wide manage |

**אין תבנית RBAC «מזכירה»** — רק preset באפליקציית עובד (`secretary` ב-`presets.ts`) + grants ידניים.

### 2.2 שני מנגנוני «אישור» (חובה להבדיל)

| שכבה | ישות | סטטוסים | מי מאשר |
|------|------|---------|---------|
| **נוכחות (אירועים)** | `attendance_days` / events | open / complete / void — **ללא pending** | manager עם `attendance.manage` — **מיידי** |
| **בקשת תיקון נוכחות** | `attendance_correction_requests` | pending → approved/rejected | `attendance.manage` org-wide או **`operational.approve`** scoped |
| **שעות פרויקט (Actual)** | `time_entries` | draft → submitted → approved | **`time.approve`** (+ לא self); או `auto_approve` org + approve ב-sync |

### 2.3 דיאגרמת זרימה (טקסט)

```
[עובד: שעון] → attendance events (ללא אישור רטרו)

[עובד: תיקון עבר] → correction_request.pending → [מנהל/operational] → events מעודכנים

[מנהל: נוכחות + פרויקט] → events מיידי
                        → syncProjectWorkFromAttendance
                           אם auto_approve + time.approve → approved → Actual
                           אחרת → draft → pendingHours (+ אולי לא בתור submitted)
```

### 2.4 פער מול דרישת בעלים

| דרישה | HEAD | הערה |
|--------|------|------|
| manage נוכחות → רטרו **מאושר** + Actual מיידי | **רק נוכחות**; שעות פרויקט **draft** כברירת מחדל | WF-006 **מכוון** draft; OWNER DECISION על `auto_approve` |
| שיוך פרויקט לא מ-manage נוכחות | **`workforce.manage`** | **עומד** |
| עובד רטרו דורש אישור | correction requests | **UI לא מחובר:** `AttendanceCorrectionRequestForm` / `AttendanceCorrectionRequestsPanel` — אין import מ-`src/app`; submit עובד רק דרך `employee/.../correction-actions.ts` — **פער מימוש** |

---

## 3. ערן יוסף — שכר 18,000 ₪, העמסה 50%, 27,000 ₪ מ-01/2026

### 3.1 מה הקוד **חייב** לחשב

- `calculateUnitEmployerCostPool`: base **18,000** + burden **50%** → **27,000.000000** ₪ (ILS).
- חודש מלא עם `rate_versions.valid_from ≤ 2026-01-01`: `calculateMonthlyEmployerCostPoolForMonth` → pool **27,000**.
- **`owner_manager` + `company_only`**: allocation מלא ל-company_only (בדיקת integration עם 27,000 — לא seed בשם ערן).

### 3.2 אימות חי

| בדיקה | סטטוס |
|--------|--------|
| שורות Production לעובד «ערן יוסף» | **לא בוצע** (פרטיות / מדיניות) |
| התאמת UI ↔ EMC ↔ compose | **NOT VERIFIED** בפרוד |
| Vitest `employee-actual-employer-cost` (6/6) | **PASS** מקומי |
| Vitest month-cash עם שורה «ערן יוסף» 27,000 | **PASS** (fixture) |

### 3.3 סיכוי לפערים (לא אומת בנתונים)

1. **חודש פתוח:** EMC `known_amount` = accrual **< 27,000** בעוד כרטיס שכר מציג pool מלא.
2. **`actual_amount` > estimate:** מנצח ב-`deriveKnownEmployerCost`; מזומן חודשי קורא actual (**1a096b95**).
3. **כפל Actual:** הוצאות payroll שלא `internal_employee_payroll` + workforce (**W08-008**).
4. **Displacement:** time entries באותו employee-month לא נספרים כש-monthly_allocated applied — **לא** אמור לכפול 18k+27k אם displacement תקין (`labor-month-displacement.test` PASS).

### 3.4 שאילתות read-only לבעלים (לא הורצו)

ראה נספח בדוח סוכן Domain 2 — `employees`, `rate_versions`, `employee_month_costs`, `labor_allocation_runs`, `employee_payroll_payments` לפי `:org_id` / `:employee_id`.

---

## 4. טבלת התאמה: צפוי מול שולם — כפילות אמיתית מול תחזית תקינה

| תרחיש | מזהים לבדוק | שולם בפועל (מזומן) | Actual / עלות | צפוי / תחזית | סוג |
|--------|-------------|-------------------|---------------|--------------|-----|
| תשלום AP + bill matched | `ap_payments.id`, `ap_bills.id`, `ap_po_matches` | `paymentDate`, gross | bill NET ב-compose | outstanding AP | **תקין** — שכבות שונות |
| Expense 10k + bill 10k + match 6k | expense id, bill id, match amount | לפי paid flags | **14,000** Actual (**V09-002**) | — | **באג גאומטריה** |
| Header project_id + allocation | expense id, allocation lines | installment gross | **כפל NET** (**V09-003**) | — | **באג** |
| Expense paid + `recurring_draft` | `recurring_financial_drafts.id`, `nextRunDate` | `paidAt` / month cash | expense finalized | **חודש הבא** בתחזית | **לרוב תקין** — לא אותה occurrence |
| ביטוח/רואה חשבון — שם דומה | template id ≠ expense id | שורת cash | שורת expense | שורת draft | **לא כפל** אם IDs שונים |
| Payroll ערן 27k paid + expected 27k | `employee_payroll_payments` | `paidAt` | EMC / allocation | `expected_amount` | **תקין** אם אותו חודש — expected≈paid |
| Match AP מלא → expense נופל מ-cash forecast | `recognizedApMatch` logic | AP cash | — | expense לא ב-90d | **V09-006** — semantic gap, לא בהכרח double |

**Billing ≠ Payment, Commitment ≠ Expense, VAT ≠ רווח** — מאומת ב-domain tests.

---

## 5. השפעה על פרויקטים, Cash Out, דוחות, סגירת חודש והיסטוריה

| אזור | השפעה |
|------|--------|
| **Project Actual / labor** | שעות **draft/submitted** **לא** ב-Actual; pending מנוכחות+פרויקט **מוריד** עלות עד approve |
| **Project Actual vendor** | V09-002/003/005 — סכומים גבוהים / פאנל ≠ compose |
| **Cash Out חודשי** | AP payments + expense gross + payroll; matched expense **מסונן** — partial match **מסתיר** שורת expense (**V09-006**) |
| **Dashboard KPI** | cash vs recognized **נפרדים** מ-2026-09-25; כרטיס כפול אחד תוקן ב-3096af59 |
| **רווחיות F11** | `include_general` — consumers על `estimatedFinalCost` vs compose (**F11-001–004**) |
| **Month close** | pending corrections (**3096af59**); `missing_employer_cost_actual`; trigger חודש סגור (**db69059e**); GCM recompute (**6933dfc2**) |
| **היסטוריה** | retro EMC supersede; displacement — **לא** לשנות migrations ישנים; actual preserved |

---

## 6. ממשק אנשים ומובייל

| נושא | ממצא |
|------|------|
| מסלול | `(app)/workforce/employees/[employeeId]/page.tsx` |
| אקורדיון | רק **`EmployeeAppAccessPanel`**: גישה + פעולות חשבון **פתוחים**; הרשאות **פתוח** אם אין חשבון פעיל; מסמכים **סגורים** |
| שכר / תנאי העסקה | **`EmployeeCompensationSummaryPanel`**, `#salary-update`, **`EmployeeEditPanel`** — **תמיד גלויים** |
| סיכון UX | «שמור הרשאות» **בתוך** collapsible סגור — **מוסתר** |
| מובייל | גלילה ארוכה; FAB quick-create **נשאר** (נתיב לא `/new`); `RateHistoryTable` + `overflow-x-auto`; שורות הרשאות `min-w-[200px]` |
| 5176cbcc / 705438a1 | **לא** שינו defaultOpen |

---

## 7. ממצאים מאומתים מול חשדות ונתיבים שלא נבדקו

### מאומת (קוד / בדיקות)

- WF-006: sync → **draft** default (**PASS**).
- employee-actual-employer-cost, labor-month-displacement, month-cash-flow (**34 tests PASS**).
- W08-007, V09-002–006 paths (unified findings + unit).
- 705438a1 `canPromote` gate (git show).

### חשד שלא אומת בפרוד

- ערך org `attendanceProjectTimeApproval` בפרוד.
- grants מזכירה / finance-only approver.
- Playwright E2E מסלולי חיים.
- `schema_migrations` 0173–0179 (**PRODUCTION UNKNOWN**).
- UI corrections wired end-to-end.

### צולב ל-`PROJECTFLOW_FINAL_UNIFIED_FINDINGS.md`

| ID | קשר לחקירה זו |
|----|----------------|
| W08-007 | תור אישורים «שבור» |
| W08-012 / WF-006 | draft default — **לא באג** אלא **פער מדיניות** מול ציפיית בעלים |
| W08-008 | כפל payroll expenses |
| V09-001 | warn-only overlap |
| V09-002–006 | Actual / cash / panel |
| F11 | דוחות רווחיות |
| FIN2-001 | לא לחסום overlap בלי החלטה |

---

## 8. פתרון מומלץ (ללא ביצוע — ממתין לאישור בעלים)

| # | בעיה | כיוון תיקון מומלץ | סיכון |
|---|------|-------------------|--------|
| P1 | manage+פרויקט → pending | **מדיניות:** `attendanceProjectTimeApproval=auto_approve` **או** קוד: `attendance.manage` ⇒ promote כמו owner (עם audit) | Actual ללא approve — דורש החלטה |
| P2 | draft לא בתור approvals | ברירת מחדל תור **draft+submitted** או KPI «טיוטות מנוכחות» | UX |
| P3 | W08-007 | טען timesheet **אחרי** authZ / הודעת Forbidden | נמוך |
| P4 | operational vs queue | תור scoped לפרויקט או הרחבת `listTimeApprovalQueue` | RBAC |
| P5 | correction UI חסר | חבר panels ל-`/workforce/attendance` + employee | מימוש |
| P6 | UI עובד אקורדיון | `defaultOpen={false}` + sticky «שמור» | UX |
| P7 | V09-002 14k | OWNER DECISION: cap bill / full match / warn | פיננסי |
| P8 | V09-003/004/005/006 | dedupe header+alloc; יישור loaders | פיננסי |
| P9 | שכר UI vs EMC | תוויות «pool מלא» vs «נצבר בחודש פתוח» | UX |
| P10 | W08-008 | חסימת finalize לקטגוריות payroll-like כש-EMC קיים | תהליך |

**אין להריץ SQL/migrations** עד אישור נפרד.

---

## 9. היקף ומנגנוני בדיקה ממוקדים (לאחר אישור)

| גל | מטרה | כלים |
|----|------|------|
| A | אימות org setting + role grants (read-only SQL) | §3.4 queries |
| B | Vitest: scoped approver + queue; partial AP compose integration | PGlite חדש |
| C | WF-006 מול מדיניות חדשה (אם P1) | עדכון test + feature flag |
| D | V09 geometry regression suite | unit + loader integration |
| E | Playwright: manager attendance range + project → אין draft **או** תור visible | staging |
| F | Employee detail accordion + mobile Hebrew | snapshot / e2e קצר |
| G | Eran: השוואת rate_versions / EMC / compose לחודש 2026-01 | read-only, owner |

**Preflight לפני release:** CI gates קיימים; **לא** full E2E א unless Owner מבקש.

---

## נספח — קבצי עוגן

| נושא | נתיב |
|------|------|
| Sync pending | `src/modules/workforce/application/attendance-project-sync.ts` |
| ברירת מחדל draft | `src/modules/tenancy/domain/labor-cost-defaults.ts` |
| Pending pool | `src/modules/workforce/data/time-entries.repository.ts` |
| Employer pool | `src/modules/workforce/domain/employer-cost-pool.ts` |
| Compose Actual | `src/modules/financials/application/compose-project-financials.ts` |
| Access panel | `src/modules/employee-app/ui/employee-app-access-panel.tsx` |

---

**סטטוס:** חקירה הושלמה. **עצירה — ממתין לאישור בעלים** לפני כל תיקון, migration או שינוי נתונים.
