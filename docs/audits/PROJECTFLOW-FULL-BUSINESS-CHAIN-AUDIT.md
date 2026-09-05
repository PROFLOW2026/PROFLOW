# PROJECTFLOW — FULL BUSINESS CHAIN AUDIT

**תאריך:** 2026-09-05  
**גרסה:** 1.1 (Phase 1 audit + Phase 2 E2E closure pointer)  
**ביצוע:** Full codebase read + 5 parallel domain agents  

**Phase 2 closure (2026-09-05):** all original CRITICAL / HIGH / MEDIUM findings are implemented. Scenario traces, residual polish, and validation results are in [PROJECTFLOW-FULL-BUSINESS-CHAIN-CLOSURE-REPORT.md](./PROJECTFLOW-FULL-BUSINESS-CHAIN-CLOSURE-REPORT.md). **FINAL STATUS = READY FOR OWNER REVIEW.** Migrations 0073–0076 pending Owner SQL. No commit / push / deploy.  

---

## מיפוי מערכת נוכחית

### Routes / Pages (63 routes)
| Domain | Routes |
|--------|--------|
| Dashboard | `/` (home) |
| Today (Command Center) | `/today` |
| Projects | `/projects`, `/projects/[id]`, `/projects/[id]?tab=financials` |
| Jobs | `/jobs`, `/jobs/[id]` |
| Clients | `/clients`, `/clients/[id]` |
| Contracts | `/contracts` |
| Changes (COs) | `/changes`, `/changes/[id]` |
| Billing (AR) | `/billing`, `/billing/[id]`, `/billing/new`, `/billing/payments/new` |
| Billing Plans | `/projects/[id]/billing-plan/...` |
| BOQ | `/projects/[id]/boq-measure` |
| Expenses | `/expenses`, `/expenses/[id]`, `/expenses/new` |
| Vendors | `/vendors`, `/vendors/[id]`, `/vendors/new` |
| AP (Vendor Bills) | `/procurement/ap`, `/procurement/ap/[id]`, `/procurement/ap/new`, `/procurement/ap/aging` |
| AP Credits | `/procurement/ap/credits`, `/procurement/ap/credits/[id]` |
| POs | `/procurement`, `/procurement/[id]`, `/procurement/new` |
| Subcontracts | `/subcontracts` |
| Employees | `/workforce/employees`, `/workforce/employees/[id]`, `/workforce/employees/new` |
| Attendance | `/workforce/attendance` |
| Time Entries | `/workforce/time`, `/workforce/time/new`, `/workforce/time/approvals` |
| Timesheets | `/workforce/timesheets`, `/workforce/timesheets/[id]` |
| Month Close | `/month-close` |
| Overhead | `/overhead` |
| Cash Flow | `/cash-flow` |
| Reports | `/reports` |
| Budgets (in projects) | embedded in project financials tab |
| Quotes | `/quotes`, `/quotes/[id]` |
| CRM | `/crm/leads`, `/crm/opportunities`, `/crm/prospects` |
| Work Orders | `/work-orders`, `/work-orders/[id]` |
| Field Ops | `/field-ops/logs`, `/field-ops/inspections`, `/field-ops/punch` |
| Safety | `/safety`, `/safety/[id]` |
| Forms | `/forms`, `/forms/[id]` |
| Assets | `/assets`, `/assets/[id]`, `/assets/fleet`, `/assets/inventory`, `/assets/maintenance` |
| Planning | `/scheduling` |
| Documents | `/documents` |
| Compliance | `/compliance`, `/compliance/[id]` |
| Warranty | `/warranty` |
| Settings | `/settings/*` (15 sub-routes) |

### מודולים ראשיים
60+ מודולים בארכיטקטורה `domain/data/application/ui/validation`.

### Database Migrations
0000–0072 applied (0067–0072 latest). Next migration: **0073+**

---

## FINDINGS — מציאות נוכחית

---

### CRITICAL

---

#### FIN-CRITICAL-001 — `costsThisMonth` על ה-Dashboard כולל רק הוצאות ישירות (Expenses) — לא AP Bills ולא Labor

| שדה | תוכן |
|-----|------|
| **ID** | FIN-CRITICAL-001 |
| **Domain** | Dashboard / Financial Summary |
| **Severity** | CRITICAL |
| **Current behavior** | `organizationSummary.costsThisMonth` מחושב מ-`sumOrganizationCostsInDateRange` שמסתכל רק על טבלת `expenses` (הוצאות ישירות בסטטוס `finalized`). לא כולל: AP bills (חשבוניות ספקים), עלויות עובדים (labor), חשבוניות קבלן משנה. |
| **Expected business behavior** | "עלויות החודש" על ה-Dashboard צריך להציג את סך כל העלויות המוכרות בתקופה: הוצאות + AP + עלויות עובדים. |
| **Source of Truth** | `src/modules/financials/data/expenses.repository.ts:262` — `sumOrganizationCostsInDateRange` |
| **Root cause** | הפונקציה query-ת רק את `expenses` table. הKPIs הראשיים (בחלק העליון) נכונים כי מגיעים מ-`getOrganizationProjectRollup`. אבל ה-"summary this month" משתמש בפונקציה הנפרדת הזו. |
| **Financial impact** | בעל עסק שמשתמש ב-AP module יראה "עלויות החודש: 10,000 ₪" כשהמציאות היא 150,000 ₪ (כולל חשבוניות ספקים ושכר עובדים). הטעיה קריטית. |
| **UX impact** | בעל עסק יסיק שעסקו רווחי יותר ממה שהוא באמת. |
| **Data integrity impact** | המספר הוצג כ-"עלויות החודש" אך הוא חסר ≥80% מהעלויות בעסקים עם AP/Labor. |
| **Recommended fix** | להרחיב את `sumOrganizationCostsInDateRange` לכלול: (1) AP bills לפי `billDate` (סטטוס `open/partially_matched/matched`), (2) עלויות עובדים חודשיות לפי תקופה, (3) לשנות שם ל-`sumOrganizationRecognizedCostsInDateRange` כדי למנוע עירוב עם cash paid. |
| **Tests required** | Unit: Scenario B vendor bill + expense = correct total. Integration: Month with labor + AP bills + expenses → correct sum. |

---

#### LAB-CRITICAL-001 — אין תצוגת לוח שנה חודשי לנוכחות לפי עובד

| שדה | תוכן |
|-----|------|
| **ID** | LAB-CRITICAL-001 |
| **Domain** | Workforce / Attendance / Owner Visibility |
| **Severity** | CRITICAL |
| **Current behavior** | דף הנוכחות (`/workforce/attendance`) מציג **רשימה טבולרית** של ימי נוכחות עם פילטר `fromDate`/`toDate`. אין תצוגת לוח שנה (calendar grid) חודשי שמציגה לכל עובד כל יום בחודש. |
| **Expected business behavior** | בעל עסק צריך לפתוח עובד + חודש ולראות ב-2 שניות: אילו ימים עבד, אילו ימים חסרים, אילו ימים ממתינים לאישור, אילו ימים אושרו. "עובד שכח לדווח ב-14 לחודש" צריך להיות מיידי ולא לדרוש חיפוש ידני. |
| **Source of Truth** | `src/app/[locale]/(app)/workforce/attendance/page.tsx` + `src/modules/workforce/ui/attendance-days-table.tsx` |
| **Root cause** | לא נבנה component של monthly calendar grid. קיים רק טבלה. |
| **Financial impact** | ימי עבודה שלא דווחו = עלויות שלא מוכרות בפרויקטים = רווחיות מסולפת. |
| **UX impact** | בעל עסק לא יכול לנהל נוכחות ב-30+ עובדים ברשימה. |
| **Data integrity impact** | מחסורי דיווח לא מגולים = labor cost לא מושלם = project actual לא מדויק. |
| **Recommended fix** | (1) בנות `AttendanceMonthCalendar` component — calendar grid חודשי לפי עובד. (2) עמוד חודשי: `/workforce/attendance?month=2026-09&employeeId=X` → grid עם 30 ימים, כל תא מציג סטטוס (עבד/חסר/ממתין/אושר/חופש). (3) ניתן לסנן לפי חודש עם חצים (חודש קודם/הבא). |
| **Tests required** | Unit: calendar renders correct days. UI: month navigation. Edge: Feb 28/29 days. |

---

#### LAB-CRITICAL-002 — אין תצוגת "מי לא דיווח היום" ברמת ארגון

| שדה | תוכן |
|-----|------|
| **ID** | LAB-CRITICAL-002 |
| **Domain** | Workforce / Daily Owner Visibility |
| **Severity** | CRITICAL |
| **Current behavior** | ה-Command Center (`/today`) מציג items כמו "נוכחות ב-DATE פתוחה" ו-"תקופת timesheet בטיוטה" — אך כ-items בתוך inbox כללי. אין תצוגת **roster** שמציגה את כל העובדים ומשנה את הסטטוס שלהם להיום. |
| **Expected business behavior** | בעל עסק צריך לראות כל בוקר: **רשימת כל העובדים הפעילים + סטטוס נוכחות היום**: דיווח/לא דיווח/ממתין לאישור. כמו "roster" – מי נמצא, מי לא, מי באיזה פרויקט. |
| **Source of Truth** | `src/modules/command-center/data/collect-sources.ts:184` + `src/modules/workforce/data/attendance.repository.ts` |
| **Root cause** | ה-command center מחפש attendance records קיימים ומציג אותם. אין query של "עובדים שאין להם attendance record היום". |
| **Financial impact** | עובד שלא דיווח = עלות שלא משויכת לפרויקט = פגיעה ברווחיות. |
| **UX impact** | בעל עסק 30+ עובדים צריך לבדוק ידנית כל עובד. |
| **Data integrity impact** | דיווח חסר = labor allocation חלקי. |
| **Recommended fix** | (1) הוסף query ל-collect-sources: `listEmployeesWithoutAttendanceToday` — עובדים שאין להם `attendance_day` ליום הנוכחי. (2) צור `today_missing_attendance` source type עם severity `medium`. (3) הצג ב-Today page: "X עובדים לא דיווחו עדיין היום" עם רשימה. |
| **Tests required** | Integration: Employee without attendance today appears in missing list. Employee who clocked in disappears. |

---

### HIGH

---

#### FIN-HIGH-001 — AP Payables (חוב לספקים) לא מוצג ב-Dashboard

| שדה | תוכן |
|-----|------|
| **ID** | FIN-HIGH-001 |
| **Domain** | Dashboard / AP Visibility |
| **Severity** | HIGH |
| **Current behavior** | ה-Dashboard מציג AR (billing/collections) אבל **לא מציג** את סך ה-AP outstanding (כמה אנחנו חייבים לספקים). אין KPI של "Open Payables" בדשבורד הראשי. |
| **Expected business behavior** | בעל עסק צריך לראות ב-Dashboard: בנוסף לכמה חייבים לנו לקוחות (AR) — גם כמה אנחנו חייבים לספקים (AP outstanding). |
| **Source of Truth** | `src/modules/financials/application/get-home-dashboard.ts` — אין reference ל-AP payables |
| **Root cause** | `getHomeDashboard` לא מכיל קריאה ל-`getOrganizationApPayables` או לשום AP aggregation. |
| **Financial impact** | בעל עסק יראה "AR Outstanding: 500,000 ₪" בלי לדעת שיש "AP Outstanding: 300,000 ₪" → תמונת cash flow מוטעית. |
| **UX impact** | HIGH. |
| **Data integrity impact** | אין — הנתונים קיימים ב-DB, רק לא מוצגים. |
| **Recommended fix** | הוסף ל-`getHomeDashboard` קריאה ל-AP payables total (sum of outstanding AP bills). הצג כ-KPI "יתרה לתשלום לספקים" בצד ה-AR outstanding. |
| **Tests required** | Integration: Dashboard includes AP outstanding when bills exist. |

---

#### FIN-HIGH-002 — "עלויות החודש" ו-"חיובים החודש" נעולים לחודש נוכחי ללא date-range

| שדה | תוכן |
|-----|------|
| **ID** | FIN-HIGH-002 |
| **Domain** | Dashboard / Date Range |
| **Severity** | HIGH |
| **Current behavior** | ה-`organizationSummary` מחושב תמיד לחודש הנוכחי (`startOfMonth(today)` — `endOfMonth(today)`). אין אפשרות לבעל העסק לבחור חודש אחר ולראות "כמה עלה לי ספטמבר?". |
| **Expected business behavior** | בעל עסק צריך לעבור בין חודשים ולהבין מגמות. |
| **Source of Truth** | `src/modules/financials/application/get-home-dashboard.ts:196-200` |
| **Root cause** | `monthStart`/`monthEnd` נגזרים מ-`today` ללא query parameter. |
| **Financial impact** | בעל עסק לא יכול לענות על "כמה הוצאתי בחודש שעבר?" |
| **UX impact** | HIGH. |
| **Recommended fix** | (1) הוסף query param `?month=2026-08` ל-Dashboard. (2) הצג navigation חצים (חודש קודם/הבא). ברירת מחדל = חודש נוכחי. |
| **Tests required** | UI: Month navigation updates KPIs. Previous month shows correct totals. |

---

#### LAB-HIGH-001 — אין תקציר תקופתי לפי עובד (Employee Period Summary)

| שדה | תוכן |
|-----|------|
| **ID** | LAB-HIGH-001 |
| **Domain** | Workforce / Reporting |
| **Severity** | HIGH |
| **Current behavior** | בחירת עובד ב-workforce מציגה פרופיל, פרויקטים, compensation — אבל **אין תצוגה של**: "בתקופה X-Y: עובד עבד N ימים, M שעות, בפרויקטים A/B/C, עלה K ₪, מתוכן K1 ₪ לפרויקט A, K2 ₪ לפרויקט B, K3 ₪ unallocated". |
| **Expected business behavior** | בחירת עובד + date range → summary מלא. |
| **Source of Truth** | `src/app/[locale]/(app)/workforce/employees/[employeeId]/page.tsx` |
| **Root cause** | אין application use-case ל-employee period summary. |
| **Financial impact** | לא ניתן לבדוק "כמה עלה לי עובד X בחודש שעבר?". |
| **UX impact** | HIGH — אחת משאלות השאלות 49.4-49.6 של acceptance test. |
| **Recommended fix** | הוסף tab "סיכום תקופה" ל-employee page. Date range selector + breakdown: ימים/שעות/פרויקטים/עלות/unallocated. |
| **Tests required** | Scenario F (multi-project worker). Scenario G (missing timesheet). |

---

#### DATE-HIGH-001 — חסרים date range presets (היום/שבוע/חודש/שנה/custom) בדפים קריטיים

| שדה | תוכן |
|-----|------|
| **ID** | DATE-HIGH-001 |
| **Domain** | UX / Date Range System |
| **Severity** | HIGH |
| **Current behavior** | רוב הדפים עם פילטר תאריכים (attendance, time entries, expenses, AP, billing) מציגים רק שדות `fromDate` / `toDate` ידניים. אין preset buttons: "היום / השבוע / החודש / חודש קודם / השנה". |
| **Expected business behavior** | בעל עסק צריך לקבל תוצאות מהירות ללא הקלדה ידנית. |
| **Source of Truth** | `src/app/[locale]/(app)/workforce/attendance/page.tsx:190-234` + דפים נוספים |
| **Root cause** | אין shared `DateRangePresets` component. |
| **Financial impact** | לא ישיר, אבל ה-UX נכשל = פחות שימוש = פחות גילוי בעיות. |
| **UX impact** | HIGH. |
| **Recommended fix** | צור `DateRangeSelector` component עם presets: היום, השבוע, החודש, חודש קודם, 30 יום, רבעון, שנה, custom. השתמש בו ב-attendance, time, expenses, AP, billing, collections, subcontracts, reports. |
| **Tests required** | Unit: presets generate correct fromDate/toDate. |

---

#### FIN-HIGH-003 — UX: אין הפרדה ויזואלית ברורה בין "עלות מוכרת" ל-"שולם במזומן"

| שדה | תוכן |
|-----|------|
| **ID** | FIN-HIGH-003 |
| **Domain** | UX / Financial Semantics |
| **Severity** | HIGH |
| **Current behavior** | ב-Dashboard ובפרויקטים מוצג "Actual Cost" / "עלות בפועל". משתמשים רבים מניחים שזה אומר "כסף שיצא". בפועל זו עלות מוכרת (כולל AP bills שלא שולמו). אין הסבר ברור ב-UI. |
| **Expected business behavior** | UI חייב להסביר: "עלות מוכרת (לא בהכרח שולמה)" לעומת "שולם במזומן". |
| **Source of Truth** | `src/modules/financials/ui/home-dashboard-owner-view.tsx:122`, project financials panel |
| **Root cause** | label `actualCostToDate` / `עלות בפועל` ללא tooltip/hint מסביר. |
| **Financial impact** | הטעיה קריטית: בעל עסק עם AP Bills גדולים יחשוב ש"Actual = Cash Out". |
| **UX impact** | CRITICAL confusion potential. |
| **Recommended fix** | הוסף tooltip/hint לכל KPI של Actual: "עלות מוכרת — כוללת חשבוניות ספקים שטרם שולמו. לראות כמה שולם בפועל, ראה יתרת AP". |
| **Tests required** | Hebrew audit: hint visible. |

---

#### AP-HIGH-001 — חסרת תצוגת "AP due this month" ב-Dashboard / Cash Flow

| שדה | תוכן |
|-----|------|
| **ID** | AP-HIGH-001 |
| **Domain** | AP / Cash Flow |
| **Severity** | HIGH |
| **Current behavior** | קיים `/cash-flow` page + `/procurement/ap/aging` page. ה-Dashboard לא מציג "כמה ₪ יוצא החודש הבא לספקים" (AP bills עם due date בחודש הקרוב). |
| **Expected business behavior** | בעל עסק צריך לדעת: "בעוד 30 יום — צפויות לצאת X ₪ לספקים". |
| **Source of Truth** | `src/modules/financials/domain/cash-flow.ts`, `src/modules/financials/application/get-organization-cash-flow.ts` |
| **Root cause** | cash flow outlook קיים ב-domain אבל לא מוצג ב-Dashboard. |
| **Recommended fix** | הוסף ל-Dashboard "upcoming payments" widget: AP bills due in next 30/60 days. Link to `/cash-flow`. |

---

### MEDIUM

---

#### RPT-MEDIUM-001 — אין דוח labor לפי עובד + תקופה

| שדה | תוכן |
|-----|------|
| **ID** | RPT-MEDIUM-001 |
| **Domain** | Reports / Labor |
| **Severity** | MEDIUM |
| **Current behavior** | `/reports` מציג דוחות כלליים. אין דוח ייעודי: "עובד X בתקופה Y: ימים, שעות, פרויקטים, עלות, unallocated". |
| **Expected business behavior** | Acceptance questions 49.3-49.6 דורשות מענה מדוח כזה. |
| **Recommended fix** | הוסף ל-reports section: "דוח שעות עובדים" עם פילטר עובד + תקופה + export. |

---

#### AP-MEDIUM-001 — due_date לא מוצג ב-AP list page

| שדה | תוכן |
|-----|------|
| **ID** | AP-MEDIUM-001 |
| **Domain** | AP / UX |
| **Severity** | MEDIUM |
| **Current behavior** | `/procurement/ap` מציג רשימת AP bills. לא ברור אם due_date מוצג בlist (צריך לאמת). |
| **Expected business behavior** | due_date + days_until_due + payable_status חייבים להיות גלויים ב-list. |
| **Recommended fix** | אמת שה-AP list מציג due_date, payable_status (unpaid/partial/paid), ימים לפירעון. |

---

#### LAB-MEDIUM-001 — open month — בדיקת `recognizeFullMonth` flag

| שדה | תוכן |
|-----|------|
| **ID** | LAB-MEDIUM-001 |
| **Domain** | Labor / Month Close |
| **Severity** | MEDIUM |
| **Current behavior** | קוד `monthly-accrual.ts` תומך ב-`recognizeFullMonth` flag. כשהחודש פתוח (in-progress), `recognizeFullMonth=false` ו-`accruedWorkDayCount` = ימים שדווחו בפועל. צריך לאמת שה-application layer מעביר את הפרמטרים נכון. |
| **Expected business behavior** | חודש פתוח → עלות פרופורציונלית לימים שדווחו בלבד. חודש סגור → עלות מלאה. |
| **Source of Truth** | `src/modules/workforce/domain/monthly-accrual.ts:95-120` |
| **Recommended fix** | הרץ Scenario B labor test: עובד חודשי + 10 ימים בפועל מתוך 22 → עלות מוכרת = (10/22) × שכר. |

---

#### FIN-MEDIUM-001 — project Actual breakdown לא מראה paid vs recognized בנפרד

| שדה | תוכן |
|-----|------|
| **ID** | FIN-MEDIUM-001 |
| **Domain** | Project Financials |
| **Severity** | MEDIUM |
| **Current behavior** | ב-project financials: "Actual Cost" = עלות מוכרת (כולל AP). אין שורה נפרדת ל-"Cash Paid" ו-"AP Outstanding" ברמת הפרויקט. |
| **Expected business behavior** | לכל פרויקט: Actual (recognized) | Paid (cash out) | Payable (owed but not paid). |
| **Recommended fix** | הוסף ל-project financials panel שורת breakdown: Actual | Paid | Payable. |

---

#### FIN-MEDIUM-002 — unallocated expenses מוצגות ב-Dashboard אבל ללא drilldown לרשימה

| שדה | תוכן |
|-----|------|
| **ID** | FIN-MEDIUM-002 |
| **Domain** | Dashboard / Expenses |
| **Severity** | MEDIUM |
| **Current behavior** | ה-Dashboard מציג `unallocatedBusinessCosts` אבל לא מקשר ישירות לרשימת ההוצאות הלא-משויכות. |
| **Recommended fix** | הוסף link "הצג הוצאות לא-משויכות" → `/expenses?unallocated=true`. |

---

#### ATT-MEDIUM-001 — attendance "status: all" מציג void records

| שדה | תוכן |
|-----|------|
| **ID** | ATT-MEDIUM-001 |
| **Domain** | Attendance |
| **Severity** | MEDIUM |
| **Current behavior** | פילטר attendance ברירת מחדל הוא "all" הכולל void. לבעל עסק שמחפש "מי עבד" void records מבלבלות. |
| **Recommended fix** | ברירת מחדל = "all active" (ללא void). void רק כשמבקשים במפורש. |

---

#### ORG-MEDIUM-001 — אין תצוגת "monthly collections view" עם date range

| שדה | תוכן |
|-----|------|
| **ID** | ORG-MEDIUM-001 |
| **Domain** | AR / Collections Visibility |
| **Severity** | MEDIUM |
| **Current behavior** | `/billing` מציג רשימת חיובים עם פילטרים. אין "Collection Report": "בחודש X נגבו Y ₪ מ-Z לקוחות, פירוט לפי לקוח/פרויקט". |
| **Expected business behavior** | בעל עסק צריך לדעת: מה נגבה החודש? מה עדיין פתוח? מי באיחור? |
| **Recommended fix** | הוסף collection summary view ל-`/billing` page עם date range + aggregation by client. |

---

#### ORG-MEDIUM-002 — אין תצוגת "monthly vendor payments" עם date range

| שדה | תוכן |
|-----|------|
| **ID** | ORG-MEDIUM-002 |
| **Domain** | AP / Cash Outflow |
| **Severity** | MEDIUM |
| **Current behavior** | `/procurement/ap` מציג bills. `/procurement/ap/aging` מציג aging. אין "payments made this period": "בחודש X שילמנו Y ₪ ל-Z ספקים". |
| **Recommended fix** | הוסף payments summary view ל-AP page עם date range selector. |

---

## מה עובד נכון — Positive Findings

### AP Domain — מצוין

✅ **הפרדה מוחלטת Actual ≠ Cash Paid**: `vendor-cost-recognition.ts` מגדיר בבירור שתשלומים לעולם לא מגדילים Actual Cost. Bill posted = Actual. Payment = cash only.

✅ **AP payment terms ו-due date**: תנאי תשלום (EOM+30/60/90/120, Net30, Net60) מחושבים אוטומטית ב-`suggestDueDateFromPaymentTerm`. Due date מאוחסן בנפרד מ-bill date.

✅ **Partial payments**: `computeBillOutstanding` = bill total − payments − credits − retention. נכון לחלוטין.

✅ **Vendor credits**: מוגדרים בנפרד, מופחתים מ-outstanding. לא נספרים כ-"paid cash".

✅ **AP Aging**: `computePayablesAging` מחושב לפי due_date עם buckets: current/1-30/31-60/61-90/90+.

✅ **Immutability**: posted bills לא ניתנים לעריכה. Void + replace הוא מסלול התיקון. Payments immutable (void only).

✅ **Multi-project allocation**: `ap_bill_project_allocations` מאפשרת חלוקת bill בין פרויקטים + overhead.

✅ **Expense-AP dedup**: `expense-ap-dedup.ts` מבטיח שאין double-counting בין expenses ל-AP bills.

### Labor Domain — מוצק

✅ **Monthly accrual correct formula**: `recognizeMonthlyEmployerPoolToDate` = (accruedWorkDayCount / workingDaysPerMonth) × fullMonthlyEmployerCost. חודש פתוח ≠ עלות מלאה.

✅ **Multi-project allocation**: `allocateMonthlyRecognizedPoolByWorkDays` — עלות יומית מתחלקת לפי שעות לפרויקטים. שמירת conservation (סכום חלוקה = pool מוכר).

✅ **Unallocated labor tracked**: `NON_PROJECT_COST_BUCKET` — ימי admin/unassigned מוכרים כ-overhead.

✅ **Month close integration**: attendance range write בודק אם חודש סגור ומסרב לשינויים.

✅ **Attendance lifecycle**: clock in/out, manual entry, void event, replace event — הכל עם audit trail.

### Billing / AR — מוצק

✅ **Billed ≠ Collected**: billing records מכילים `totalAmount` (חויב) + payment applications (נגבה) = `outstandingAmount`.

✅ **Retention**: נשמר ומנוהל נפרד.

✅ **Aging**: AR aging מחושב לפי due_date.

✅ **Cash Flow**: `/cash-flow` page + `get-organization-cash-flow.ts` מראים outlook מלא.

### Project Financials — מוצק

✅ **Drilldown**: `project-actual-breakdown-view.tsx` + `get-project-actual-breakdown.ts` — breakdown מלא של Actual לפי source (labor/AP/expenses/subcontractor).

✅ **Budget vs Actual**: project budgets קיימים.

✅ **Commitment**: PO commitment → AP bill settles commitment. Subcontract commitment tracking.

✅ **Forecast**: `resolve-forecast-cost-basis.ts` מחשב ETC + Projected Final Cost.

### RLS / Multi-tenant — בסיסי תקין

✅ כל queries כוללים `organizationId` filter + RLS policies ב-migrations.

✅ Employees לא יכולים לראות שכר של אחרים (workforce_cost_authz).

### Hebrew / RTL

✅ Hebrew hardening כבר בוצע. Translation keys קיימים. RTL תקין.

---

## Reconciliation Status (Pre-Fix)

| Gate | Status | Notes |
|------|--------|-------|
| Project Actual = sum of underlying | LIKELY PASS | breakdown UI קיים |
| Labor allocated + unallocated = pool | LIKELY PASS | conservation logic in accrual |
| AP: recognized = sum of bill lines | LIKELY PASS | schema enforces net+tax=gross |
| Payments = sum of applications | LIKELY PASS | assertPaymentApplicationsValid |
| AR: billed - collected = receivable | LIKELY PASS | billing domain |
| Org: `costsThisMonth` = all costs | **FAIL** | FIN-CRITICAL-001 |
| Missing attendance detection | **FAIL** | LAB-CRITICAL-002 |

---

## Migrations Required

| ID | Description | New Migration |
|----|-------------|---------------|
| FIN-CRITICAL-001 | No DB change needed — logic fix only | NO |
| LAB-CRITICAL-001 | No DB change — UI only | NO |
| LAB-CRITICAL-002 | No DB change — query + UI | NO |
| FIN-HIGH-001 | No DB change — query + UI | NO |
| All others | No DB changes | NO |

**Summary: לא נדרשות migrations חדשות לאף אחת מהבעיות שזוהו.**

---

## Summary Table

| ID | Domain | Severity | Fix Type |
|----|--------|----------|---------|
| FIN-CRITICAL-001 | Dashboard/Financial | CRITICAL | Logic fix: extend `sumOrganizationCostsInDateRange` |
| LAB-CRITICAL-001 | Attendance/UX | CRITICAL | New component: monthly calendar grid |
| LAB-CRITICAL-002 | Attendance/Daily | CRITICAL | New query + UI: "who hasn't reported today" |
| FIN-HIGH-001 | Dashboard/AP | HIGH | Add AP outstanding to dashboard |
| FIN-HIGH-002 | Dashboard/Date | HIGH | Add month navigation to dashboard summary |
| LAB-HIGH-001 | Employee/Reports | HIGH | Employee period summary view |
| DATE-HIGH-001 | UX/Date Range | HIGH | Shared DateRangeSelector with presets |
| FIN-HIGH-003 | UX/Semantics | HIGH | Tooltip: Actual ≠ Cash Paid |
| AP-HIGH-001 | AP/Cash Flow | HIGH | Upcoming payments widget on dashboard |
| RPT-MEDIUM-001 | Reports/Labor | MEDIUM | Employee labor report |
| AP-MEDIUM-001 | AP/UX | MEDIUM | Due date visible in AP list |
| LAB-MEDIUM-001 | Labor/Month Close | MEDIUM | Verify open-month accrual |
| FIN-MEDIUM-001 | Project Financials | MEDIUM | Recognized vs paid breakdown in project |
| FIN-MEDIUM-002 | Dashboard | MEDIUM | Link to unallocated expenses |
| ATT-MEDIUM-001 | Attendance | MEDIUM | Default filter excludes void |
| ORG-MEDIUM-001 | AR/Collections | MEDIUM | Monthly collections view |
| ORG-MEDIUM-002 | AP/Payments | MEDIUM | Monthly vendor payments view |

**CRITICAL: 3 | HIGH: 6 | MEDIUM: 8 | LOW: 0**
