# PROJECTFLOW — מפת יכולות מערכת סופית

| שדה | ערך |
|-----|-----|
| **תאריך** | 2026-10-09 |
| **סוג משימה** | אימות מלאי + שלמות (READ ONLY) — **ללא** שינוי קוד, SQL, או נתוני Production |
| **מאגר מקומי (HEAD)** | `2f13eec60b827c2e34caa5b7b6e1fed19486abff` (כולל commit שחרור צפוי `2f13eec6`) |
| **Production URL** | https://proflow-two-bice.vercel.app |
| **Production — זיהוי commit** | **לא אומת** (אין גישה מאומתת ל-Vercel deploy SHA; רק HTTP 200 + `X-Vercel-Id` … `dub1`) |
| **יומן מיגרציות (repo)** | עד **`0176_project_access_mode_default_selected`** — 175 קבצי SQL, `db:check-journal` תואם |
| **Production SQL** | **SEC-010 — לא אומת** (Owner חייב להשוות `schema_migrations` ב-Supabase) |
| **סוכני משנה** | **14** סוכני explore מקבילים (A–N) — ראו §0 |
| **מסמכי בסיס** | [complete_implementation_master.plan.md](../../.cursor/plans/complete_implementation_master.plan.md) · [PROJECTFLOW-FINAL-COMPLETE-VERIFICATION-2026-10-09.md](./PROJECTFLOW-FINAL-COMPLETE-VERIFICATION-2026-10-09.md) · [_verification-84-findings-final-disposition-2026-10-09.md](./_verification-84-findings-final-disposition-2026-10-09.md) · [_verification-business-flows-map-2026-10-09.md](./_verification-business-flows-map-2026-10-09.md) · דרישות 2026-10-03 (Dev/GC, צוות פרויקט, קבלנים) — ממופות ב-§L ו-§J |

**מקרא סיווג (חובה בכל טענה):**

| תג | משמעות |
|----|--------|
| **מיושם בקוד** | routes + actions + schema קיימים במאגר |
| **מאומת בבדיקות** | Vitest integration/unit (PGlite/מבודד) — לא Production |
| **מאומת ב-Production** | נדרש login + בדיקה ידנית/E2E — **לא בוצע בגל זה** |
| **לא אומת** | אין ראיה executable מספקת |
| **חלקי** | UI או לוגיקה או קישור בין מודולים חסר/שברירי |
| **חסר** | capability מוצהר / מצופה — אין מימוש |
| **נדחה על ידי Owner** | לא פגם — החלטת מוצר |

---

## §0 — מתודולוגיה וסוכני משנה

הLead הפעיל **14 סוכני משנה מקבילים** (Cursor Task / explore) לפי תחומי A–N. כל סוכן ביצע ניתוח read-only על המאגר הנוכחי ולא הריץ Playwright, מטריצת 387 routes, או סוויטת 600+ integration.

| סוכן | תחום | מזהה (לחידוש שיח) |
|------|------|-------------------|
| A | דשבורד, ניווט, הגדרות, UX גלובלי | [4594cfa7-2194-48bb-b38a-f57b48d9970b](4594cfa7-2194-48bb-b38a-f57b48d9970b) |
| B | CRM, לקוחות | [432852c6-47e5-4038-b295-a2fb3c6362ce](432852c6-47e5-4038-b295-a2fb3c6362ce) |
| C | הצעות מחיר, גרסאות, אישורים | [65e32b95-9149-4454-a9ab-a2f4f5d3cf01](65e32b95-9149-4454-a9ab-a2f4f5d3cf01) |
| D | פרויקטים, חוזים, שינויים | [26b13e53-2f03-4097-828e-8d77cb3fe096](26b13e53-2f03-4097-828e-8d77cb3fe096) |
| E | משימות, לוחות, תכנון, לוח שנה | [3088fb0c-a74e-4df7-becf-031e44296680](3088fb0c-a74e-4df7-becf-031e44296680) |
| F | עובדים, נוכחות, שעות | [e3b27045-56c7-4cb7-8415-1dbfeaef15ef](e3b27045-56c7-4cb7-8415-1dbfeaef15ef) |
| G | עלות מעסיק, הקצאות, סגירת חודש | [b14a9541-bbd6-47a3-9d56-2aabcfd9a25b](b14a9541-bbd6-47a3-9d56-2aabcfd9a25b) |
| H | קבלני משנה, הסכמים, תביעות | [168aa75f-0e25-43ea-831f-6a4b9000db97](168aa75f-0e25-43ea-831f-6a4b9000db97) |
| I | הוצאות, רכש, AP | [96b817ef-3dfe-415f-a7d8-0b0c3f5b096b](96b817ef-3dfe-415f-a7d8-0b0c3f5b096b) |
| J | חיוב, תשלומים, SUMIT, רווחיות | [920ba0a4-13f5-4e21-9940-320f79288068](920ba0a4-13f5-4e21-9940-320f79288068) |
| K | מסמכים, אחסון ענן | [e6529e71-b4ae-4265-a93d-2c208c2cc591](e6529e71-b4ae-4265-a93d-2c208c2cc591) |
| L | Dev/GC, RFI, טפסים שטח | [fbdf2a32-743d-4e57-8da5-9baf951ae75c](fbdf2a32-743d-4e57-8da5-9baf951ae75c) |
| M | דוחות, שוק חומרים | [a39e8ae5-c1fe-46d1-b8eb-11581a30f347](a39e8ae5-c1fe-46d1-b8eb-11581a30f347) |
| N | אבטחה, RBAC, אוטומציות, i18n | [f52340d5-dbc6-48be-b1a1-396f529f6197](f52340d5-dbc6-48be-b1a1-396f529f6197) |

**מדדים סטטיים (מאגר, לא Production):** ~387 דפי UI, ~31 API routes, ~604 server actions, ~60 פריטי nav — לפי [PROJECTFLOW-FINAL-COMPLETE-VERIFICATION-2026-10-09.md](./PROJECTFLOW-FINAL-COMPLETE-VERIFICATION-2026-10-09.md) §23.

---

## A — סיכום מנהלים

### A.1 מוכנות כללית

ProjectFlow היא **מערכת רחבה ומחוברת בקוד** לניהול פרויקטים, כוח אדם, רכש, חיוב, קבלנים ושכבת Developer/GC. רוב היכולות **מיושמות בקוד** עם **כיסוי integration/unit משמעותי** על PGlite — אך **אימות Production end-to-end כמעט לא בוצע** (0/15 תרחישי עסק בדפדפן לפי סגירת 2026-10-09).

**אין לקבוע "100% מוכן לשחרור"** על בסיס קוד בלבד. המערכת **שימושית לייצור** עבור תרחומים רבים כאשר Owner מאשר סכמת DB ו-SUMIT/OAuth חיים — עם **פערי לוגika עסקית ידועים** (57 ממצאי GAP ב-register 84) ו-**3 תקלות מוכחות** ב-audit קודם (OPS-B-002, OPS-B-003, UI-MOB-001) שיש לבדוק מול HEAD הנוכחי לפני כל החלטת go-live.

### A.2 מה שלם (דומיין — לא "הכל ירוק")

| דומיין | מצב מ justified |
|--------|----------------|
| CRM → הצעת מוצר → פרויקט | **מיושם בקוד** + **מאומת בבדיקות** (convert + win sync); **לא אומת ב-Production** |
| שינוי מסחרי מאושר → ערך חוזה | **מיושם בקוד** + **מאומת בבדיקות** (`entry-baseline` 50k→70k) |
| קבלנים: הסכם → תביעה → אישור | **מיושם בקוד** + **מאומת בבדיקות** (claims, contractor-tasks) |
| PO issue → commitment; receive ≠ expense | **מיושם בקוד** + **מאומת בבדיקות** (FIN2-010 intentional) |
| Billing ≠ Payment ≠ statutory | **מיושם בקוד** + בדיקות billing integrity |
| פורטל קבלן (0156+) | **מיושם בקוד** + integration; **Production grants/OAuth לא אומתו** |
| Dev/GC execution hubs | **מיושם בקוד** (7 hubs, 50+ routes פרויקט) |
| עברית RTL, Employee App, FAB quick-create | **מיושם בקוד** + בדיקות unit/UI חלקיות |

### A.3 חלקי

- **כוח אדם:** נוכחות → שעות → אישור → עלות מעסיק → הקצאה — **מנוע קיים**, פערי WF-002/006/007, UI תיקון נוכחות לא מחובר, **לא** שרשרת E2E בדפדפן.
- **SUMIT / חשבונית מס:** הנפקה/קבלה — **מיושם**; ביטול/זיכוי statutory + FIN-005 mapping — **חלקי / GAP**; FIN-003 UX — **חסר/מוסתר** לפי audit.
- **תבניות פרויקט (PM-001/002):** apply כולל BOQ/forms/closeout keys — **קוד**; אינטגרציה רזה + closeout לא נגזר מ-template ב-readiness.
- **תכנון מול משימות (PM-005):** שני מנועים — **by design**, ללא FK.
- **דוחות /analytics:** packs + exports — **מיושם**; `/reports` overflow mobile (UI-MOB-001) — **תקלה מוכחת** ב-audit E2E nav.
- **סגירת חודש (אופציונלי):** מודול **מיושם**; OPS-B-002 / WF-003 — **חלקי** (קוד mitigation + tests; Production + edge supersede — לא אומת).

### A.4 חסר (לא deferred)

- **פורטל לקוח חיצוני מלא** — **נדחה** (UI-001/002) — ראו §L.
- **סנכרון Google/Outlook** — **נדחה** (PM-012).
- **PM-004:** המרת הוראת אתר → שינוי הזמנה — **stub null**.
- **גרסאות מרובות להצעת מוצר (V1/V2)** — **לא מיושם** (מודל מסמך יחיד).
- **CRM sales quote issue/accept ב-UI** — **backend בלבד** (legacy read-only).

### A.5 לא אומת ב-Production

- זהות commit על Vercel מול `2f13eec6`.
- יומן מיגרציות Production (0172–0176, PREPARED headers).
- SUMIT/OAuth/Google Drive **חיים**.
- 387 routes × personas (246 owner LOAD עם 142 ERROR ב-matrix ישן — harness).
- 15 תרחישי עסק money-chain בדפדפן: **0/15**.

---

## B — מלאי מערכת לפי מודול

(לכל שורה: Backend | UI | Nav | הרשאות | DB | סטטוס | ראיה)

### B.1 ליבה, דשבורד, הגדרות (Agent A)

| יכולת | Routes | Nav | Backend | DB | סטטוס |
|--------|--------|-----|---------|-----|--------|
| דשבורד בית (`/`) | `/[locale]/` | dashboard | `get-home-dashboard` | org settings, rollups | **מיושם** · **מאומת חלקית** (unit/integration) |
| Today / מרכז פקודה | `/today` | today | command-center | `command_center_item_states` | **מיושם** |
| `/inbox` → redirect | `/inbox` | — | redirect | — | **מיושם** (לא inbox נפרד — UI-004 GAP תיעוד) |
| הגדרות (30+ מדורים) | `/settings/*` | settings | `settings/actions.ts`, `_lib/access.ts` | tenancy, RBAC, branding | **מיושם** · nav matrix ERROR **לא אומת** |
| FAB quick-create | — | top + FAB | `quick-create.tsx` | — | **מיושם** |
| מיתוג org / onboarding | `/onboarding` | — | `createOrganization` | organizations | **מיושם** |
| התראות | `/notifications` | bell | notifications module | — | **מיושם** |
| דוחות (nav) | `/reports` | reports | reports/financials | — | **חלקי** — UI-MOB-001 overflow @320px |

### B.2 CRM ולקוחות (Agent B)

| יכולת | Routes | Nav | סטטוס |
|--------|--------|-----|--------|
| Pipeline הזדמנויות | `/crm` | `/crm` | **מיושם** · **מאומת** |
| לידים / prospects | `/crm/leads/*`, `/crm/prospects/*` | CRM sub | **מיושם** |
| לקוחות | `/clients/*` | `/clients` | **מיושם** · integration |
| Lead → Opportunity | query `leadId` | — | **מיושם** |
| Opportunity → quote | `/quotes/new?opportunityId=` | quotes | **מיושם** |
| convertQuote + win CRM | `/quotes/[id]` | — | **מיושם** · CRM-001 **מתוקן בקוד** (win sync ללא crm.manage) · CRM-002 **נכון** |
| CRM-003 converted מוקדם | — | — | **חלקי** (רעש רשימה) |

### B.3 הצעות מחיר והערכות (Agent C)

| מודל | Routes | סטטוס |
|------|--------|--------|
| הצעת מוצר (estimates) | `/quotes/*` | **מיושם** — lifecycle, convert, discount approval |
| שינוי מסחרי (quote_versions) | `/changes/*/price`, `/approve` | **מיושם** |
| CRM sales quotes | opp page בלבד | **חלקי** — API, UI legacy read-only |
| גרסאות הצעת מוצר | — | **חסר** |

### B.4 פרויקטים, חוזים, שינויים (Agent D)

| יכולת | Routes / tabs | סטטוס |
|--------|---------------|--------|
| רשימת פרויקטים / hub | `/projects`, `?tab=` hubs | **מיושם** |
| חוזים org | `/contracts` | **מיושם** |
| שינויים org | `/changes/*` | **מיושם** |
| CO מאושר → contract value | approve flow | **מיושם** · **מאומת** integration |
| תוכנית חיוב | `?tab=billingPlan`, print cycle | **מיושם** |
| גישת קבלן | `/contractor-access` | **מיושם** |
| closeout | `?tab=closeout` | **מיושם** · template keys **חלקי** (PM-002) |
| תמונות פרויקט (tab) | — | **חסר** — evidence per entity |
| תבנית פרויקט | apply form | **חלקי** (PM-001 tests דלים) |
| Execution DG | 50+ under `/projects/[id]/…` | **מיושם** (plan §L Oct-3 tracks) |

### B.5 משימות, תכנון, לוח שנה (Agent E)

| יכולת | Routes | סטטוס |
|--------|--------|--------|
| My Work | `/work`, `/work/board`, calendar, timeline | **מיושם** |
| משימה | `/tasks/[taskId]` | **מיושם** |
| תכנון Gantt | `?tab=schedule` | **מיושם** · **לא** מקושר ל-`tasks` (PM-005) |
| לוח שנה מאוחד org | `/calendar` | **מיושם** · PM-011 fragmentation |
| scheduling bookings | `/scheduling` | **מיושם** · נפרד מ-UWM |
| portfolio | `/portfolio` | **מיושם** (UWM, לא P&L) |

### B.6 כוח אדם (Agent F)

| יכולת | Routes | סטטוס |
|--------|--------|--------|
| עובדים HR | `/workforce/employees/*` | **מיושם** |
| שעות / timesheets | `/workforce/time/*`, `/timesheets/*` | **מיושם** · **מאומת** חלקית |
| נוכחות | `/workforce/attendance/*` | **מיושם** |
| Employee App | `/employee/*` (90+ pages) | **מיושם** |
| תיקון נוכחות (workflow) | action only | **חלקי** — UI לא מחובר |
| WF-002/006/007 | — | **GAP לוגי מאומת ב-tests** |

### B.7 עלות מעסיק והקצאה (Agent G)

| יכולת | סטטוס |
|--------|--------|
| `employee_month_costs` + allocation apply | **מיושם** · **מאומת** 6/6 retro |
| displacement / labor → profit | **מיושם** |
| month-close אופציונלי | `/month-close` **מיושם** · **חלקי** (OPS-B-002, WF-003) |

### B.8 קבלני משנה (Agent H)

| יכולת | Routes | סטטוס |
|--------|--------|--------|
| הסכמים / lines / changes | `…/contractors/*` | **מיושם** |
| תביעות / deductions / payments hub | `…/claims`, `deductions`, `contractor-payments` | **מיושם** · **מאומת** |
| פורטל קבלן | `/contractor/projects/…` | **מיושם** |
| משימות שטח קבלן | collaboration | **מיושם** · 7/7 tests |

### B.9 הוצאות, רכש, AP (Agent I)

| יכולת | Routes | סטטוס |
|--------|--------|--------|
| הוצאות | `/expenses/*`, received inbox | **מיושם** |
| PO / RFQ / materials | `/procurement/*` | **מיושם** |
| AP | `/procurement/ap/*` | **מיושם** |
| commitment ≠ expense | schema + tests | **מיושם** · **מאומת** |

### B.10 חיוב, תשלומים, SUMIT (Agent J)

| יכולת | Routes | סטטוס |
|--------|--------|--------|
| billing records | `/billing/*` | **מיושם** |
| payments / allocate | `/billing/payments/*` | **מיושם** |
| statutory SUMIT | settings + detail card | **מיושם** · live **לא אומת** |
| רווחיות | `/financials/business-profitability`, project financials | **מיושם** — VAT ב-margin **לא** (net CCV) |
| FIN-003 credit/cancel UX | invoicing actions | **חלקי/חסר** per audit |
| FIN-005 gross lines → SUMIT | bridge | **GAP מאומת** unit |

### B.11 מסמכים (Agent K)

| יכולת | Routes | סטטוס |
|--------|--------|--------|
| registry | `/documents`, `/company-files` | **מיושם** |
| אחסון ענן OAuth | `/settings/storage` | **מיושם** · live OAuth **לא אומת** |
| OCR review | `/documents/ocr-review` | **מיושם** (feature flag) |
| evidence DG | project entities + APIs | **מיושם** · owner task evidence **חלקי** (PM-009) |

### B.12 Dev/GC ושטח (Agent L)

| יכולת | Routes | סטטוס |
|--------|--------|--------|
| execution 7 hubs | `…/execution*` | **מיושם** |
| coordination | `…/coordination` | **מיושם** |
| RFI / submittals / inspections / defects | quality hub | **מיושם** |
| field-ops (org) | `/field-ops/*` | **מיושם** · dual stack PM-003 |
| PM-004 instruction→CO | — | **חסר** (stub) |
| SEC-004 deep links | — | **חלקי** — לא כל URLs עם `requireDeveloperGc` |

### B.13 דוחות ושוק חומרים (Agent M)

| יכולת | Routes | סטטוס |
|--------|--------|--------|
| report packs PDF | `/reports` | **מיושם** · labor_by_period **בקוד** (RPT-001) |
| exports CSV/XLSX | `/exports/[kind]` | **מיושם** |
| cash-flow forecast | `/cash-flow` | **מיושם** |
| material market | `/material-market/[trade]` | **מיושם** |
| analytics sections | `/reports?section=` | **מיושם** · gate collapsed (RPT-006) |

### B.14 אבטחה, אוטומציות, i18n (Agent N)

| יכולת | סטטוס |
|--------|--------|
| RBAC catalog + project capabilities | **מיושם** |
| RLS 0174/0176 | **מיושם בקוד** · **מאומת** PGlite · **Production SEC-010 לא אומת** |
| automations | `/automations` | **מיושם** · safe actions only |
| dg-events consumer | ops-worker + kick | **מיושם** · **מאומת** 9 integration · **Production worker לא אומת** |
| he-IL RTL + 4 locales | **מיושם** · unit tests |
| integrations | `/settings/integrations` | **מיושם** |

---

## C — מפת חוויית משתמש (Nav + URL)

**Prefix:** `/he-IL` (ברירת מחדל) · מקור nav: `src/components/shell/navigation.ts`

| קבוצה | Nav key (דוגמה) | URL | הרשאה / מודול |
|--------|-----------------|-----|----------------|
| ליבה | dashboard | `/` | — |
| ליבה | today | `/today` | command_center.read |
| פרויקטים | projects | `/projects` | core |
| כספים | expenses | `/expenses` | expenses |
| כספים | billing | `/billing` | billing |
| כספים | vendorBills | `/procurement/ap` | ap.read |
| כספים | reports | `/reports` | project_financials.read |
| כספים | cash-flow | `/cash-flow` | project_financials.read |
| מכירות | quotes | `/quotes` | quotes + module |
| CRM | crm | `/crm` | crm.read |
| לקוחות | clients | `/clients` | clients.read |
| שינויים | changes | `/changes` | changes module |
| כוח אדם | workforce | `/workforce/employees` | workforce.read |
| כוח אדם | attendance | `/workforce/attendance` | attendance.* |
| כוח אדם | time / timesheets | `/workforce/time`, `/timesheets` | time.* |
| עבודה | myWork | `/work` | tasks + work_management |
| שטח | fieldOps | `/field-ops` | field_ops |
| שטח | fieldHome | `/field` | mixed |
| חומרים | materials / material-market | `/procurement/materials`, `/material-market` | materials |
| הגדרות | settings | `/settings` | sections gated |

**פרויקט — hubs (soft tabs):** `overview` · `money` (financials, expenses, billing, billingPlan, budgets) · `work` · `documents` · `details` (closeout, warranty, contracts).

**פרויקט — execution (Developer/GC):** כניסה `…/execution` → hubs: contractors, contracts, payments, planning, quality, team — ילדים: coordination, rfi, submittals, claims, tasks, site-log, וכו'.

**Employee App:** `/employee` — primary mobile: home, time, projects, tasks.

**Contractor portal:** `/contractor/sign-in` → `/contractor/projects/[id]/…`

---

## D — מטריצת תהליכי עסק

| תהליך | שלבים מחוברים בקוד | קישור חסר / חלש | אימות |
|--------|---------------------|------------------|--------|
| **לקוח → רווח** | Lead/Opp → `/quotes` → accept → convert → contract → CO approve → expenses/AP/labor → billing → payment → profit formula | SUMIT statutory chain; FIN-005; void↔cancel (FIN-002); credit UI (FIN-003) | Integration **חלקי** · E2E **0** |
| **עובד → עלות פרויקט** | attendance → time → approve → employer month → allocation → `getProjectLaborCost` | WF-002 overwrite; WF-006 auto-approve; WF-007 dual path; correction UI | **מאומת** חלקית · E2E **0** |
| **קבלן → רווח** | agreement → claim submit → certify → payable/AP → cost control | Retention/mask until 0168 in prod | Integration **חזק** · prod **לא** |
| **Dev/GC** | team caps → RFI/submittal → instruction (**לא** CO) → coordination | PM-004; SEC-004 URL gate; dual field stacks | **מיושם** · E2E **0** |
| **מסמכים** | upload → semantic folder → link → share/portal | statutory PDF→folder (DOC-012); inline preview (DOC-001) | Integration **חלקי** |
| **משימות** | assign → status → activity → reminders (worker) | planning↔task; owner evidence (PM-009) | Unit/integration **חלקי** |

**15 תרחישי Owner (2026-10-09):** ראו [_verification-business-flows-map-2026-10-09.md](./_verification-business-flows-map-2026-10-09.md) — **9/15 strong PARTIAL+** ב-integration; **0/15** browser E2E.

---

## E — מטריצת תפקידים והרשאות

| תפקיד | מנגנון | הערות |
|--------|--------|--------|
| **Owner org** | role template `owner` — כל `PERMISSIONS` | SEC-008 — template רחב by design |
| **Manager** | template `manager` | רחב — תיעוד למנהלי מערכת |
| **Employee (org member)** | RBAC + אופציונלי Employee App grants | settings חסום ל-app users |
| **Employee App** | `employee_permission_grants`, semantic folders | DOC-011 category null — GAP |
| **Subcontractor** | `external_access_grants`, `ext.*` capabilities | scoped vendor/project/agreement |
| **Project-scoped** | `project_team` + `capabilities.ts` | contracts.read וכו' — SEC-003 split app vs SQL **מכוון** אחרי 0174 |
| **client_coordinator** | operational.approve | O-03 tests — **מיושם** |
| **Developer/GC** | delivery profile `developer_gc` | nav + hub pages; לא כל deep links |

מקורות: `src/shared/permissions/catalog.ts`, `src/modules/project-team/domain/capabilities.ts`, `src/shared/external/capabilities.ts`.

---

## F — שלמות פיננסית

| כלל Owner | מימוש | פער |
|----------|--------|-----|
| Billing ≠ Payment | טבלאות נפרדות + revenue-position | — |
| Commitment ≠ Expense | `committed_costs` vs expenses/AP | FIN2-010 preserved |
| VAT לא inflates profit | `computeProfitPosition` על net CCV | FIN-005 statutory lines |
| רק CO מאושר ב-contract value | `contract_value_events` | pending excluded — **מאומת** |
| לא infer category מטקסט חופשי | expense categories | WF-001 free-text payroll — **intentional** warn |
| Month close optional | `/month-close` | OPS-B-002 coupling **חלקי** |

---

## G — מסמכים ואחסון

- **מיושם:** OAuth OneDrive/Google/Dropbox/Box; חובה חיבור לפני upload (DOC-010).
- **חלקי:** inline preview; owner task attachments; statutory archive to project tree (DOC-012).
- **לא אומת Production:** Google OAuth חי (DOC-006).

---

## H — מובייל, RTL, שפות

- **RTL he-IL:** `dir` על html/body, logical CSS — **מיושם** · tests.
- **4 locales:** he, en, ar, ru — **מיושם**.
- **Mobile:** bottom nav employee; shell regression tests — **חלקי**; **UI-MOB-001** `/reports` overflow — **BUG** ב-audit E2E (לא הורץ מחדש בגל זה).

---

## I — אוטומציות ואינטגרציות

| אינטegration | UI | Worker | Production |
|--------------|-----|--------|------------|
| SUMIT statutory | settings/integrations | sumit-expense cron 06:30 | **לא אומת** |
| SUMIT expense ingestion | expenses/received | cron | **לא אומת** |
| OCR Azure | ocr-review | ocr-worker 05:00 | **לא אומת** |
| Material market FRED/CBS | material-market | ops-worker | **לא אומת** |
| dg-events | — | daily ops 06:00 + HTTP kick | **לא אומת** |
| Automations rules | `/automations` | event-driven safe actions | **מיושם** · **לא אומת** prod |

**נדחה:** external calendar sync (PM-012).

---

## J — התאמה ל-84 ממצאים ו-15 ת flows

### J.1 סיכום 84 (disposition סגור 2026-10-09)

| סיווג סופי | כמות |
|------------|------|
| VERIFIED BUSINESS LOGIC GAP | 57 |
| VERIFIED INTENTIONAL DESIGN | 17 |
| VERIFIED MISSING FEATURE | 4 |
| VERIFIED BUG | 3 |
| VERIFIED TEST INFRASTRUCTURE | 2 |
| EXTERNAL-ONLY | 1 (SEC-010) |
| VERIFIED CORRECT | 1 (CRM-002) |

**3 BUGs (לא לפתוח מחדש אם תוקנו ב-2f13eec6 — לא אומת prod):** OPS-B-002, OPS-B-003, UI-MOB-001.

**4 MISSING (3 deferred + FIN-003 UX):** UI-001 portal, UI-002 settings portal, PM-012 calendar, FIN-003 statutory credit/cancel discoverability.

**גל זה:** לא חוזרים על 81 שורות register — ראו [_verification-84-findings-final-disposition-2026-10-09.md](./_verification-84-findings-final-disposition-2026-10-09.md). ממצאים **RESOLVED בקוד** (דוגמה: CRM-001 win sync, RPT-001 labor pack in catalog, SEC-001/002 tests with 0174) **עדיין דורשים apply Production** לפני "סגור".

### J.2 15 business flows

| # | תיאור | קוד | בדיקות | Production E2E |
|---|--------|-----|--------|----------------|
| 1 | CRM→quote→project→contract | ✓ | A | ✗ |
| 2 | CO→contract value | ✓ | A | ✗ |
| 3 | pending CO no $ | ✓ | partial | ✗ |
| 4 | billing→SUMIT→pay→profit | partial | mock | ✗ |
| 5 | attendance→approval | ✓ | ✓ | ✗ |
| 6 | hours→allocation→profit | partial | partial | ✗ |
| 7–8 | employer actual/retro | ✓ | 6/6 | ✗ |
| 9 | retro attendance | partial | WF-002 | ✗ |
| 10–11 | PO/AP/expense/pay | partial | unit | ✗ |
| 12–13 | contractor task→claim | ✓ | ✓ | ✗ |
| 14–15 | dashboard/reports | partial | overflow bug | ✗ |

---

## K — פונקציונליות חסרה / חלקית (severity + ראיה)

| Severity | פריט | ראיה |
|----------|------|------|
| **HIGH** | Production schema drift (SEC-010) | migrations 0172–0176 possibly unapplied |
| **HIGH** | FIN-005 SUMIT line gross mapping | `fin-005-gross-line-sumit-mapping.test.ts` |
| **HIGH** | WF-002 attendance overwrites approved time | `wf-002-attendance-overwrite-approved.test.ts` |
| **MEDIUM** | OPS-B-002 / month-close vs EMC displacement | `ops-b-002-month-close-displacement.test.ts`; audits conflict on "BUG vs fixed" — **verify on deployed code + prod DB** |
| **MEDIUM** | PM-004 instruction→change order | `conversion-port.ts` returns null |
| **MEDIUM** | SEC-004 execution deep URLs without profile gate | audit SEC-004 |
| **MEDIUM** | FIN-002 void without statutory cancel | integration fin-002 |
| **LOW** | UI-MOB-001 `/reports` overflow | nav matrix JSON |
| **LOW** | PM-001/002 template BOQ/closeout automation | apply code vs readiness rules |
| **LOW** | CRM-003 early converted flag | static |

---

## L — נדחה על ידי Owner (לא פגם)

1. **פורטל לקוח חיצוני מלא** — `/portal/*` → notFound (UI-001); `/settings/portal` (UI-002).
2. **סנכרון לוח שנה Google/Outlook** — PM-012 placeholder בלבד.

---

## M — פערי אימות Production

| נושא | מה נבדק | מה לא |
|------|---------|--------|
| Deploy | HTTP 200 `/he-IL`, region dub1 | commit SHA = 2f13eec6 |
| Auth flows | sign-in page HTML | login E2E |
| DB | journal local 0176 | Supabase migrations applied |
| SUMIT / storage OAuth | code paths | live API |
| 387 routes | inventory file | persona matrix post-release |
| 15 flows | PGlite chains | browser money-chain |
| Mobile | unit tests | Playwright 320px reports |

**הבחנה:** התנהגות **לא נבדקה ב-Production** ≠ **פגם מוכח**. הפגמים המוכחים ב-audit 2026-10-09 נשארים **חשודים עד re-verify** על HEAD/deploy הנוכחי.

---

## N — הערכת שלמות לפי דומיין

| דומיין | הערכה | נימוק קצר |
|--------|--------|-----------|
| Tenancy, nav, settings | **שלם בקוד · Production לא אומת** | 387 routes, settings IA |
| CRM + clients + quotes | **שלם-חלקי** | commercial path strong; legacy CRM quotes UI דל |
| Projects + contracts + CO | **שלם בקוד** | CO→value tested |
| Tasks + planning | **שלם-חלקי** | dual models documented |
| Workforce + labor cost | **שלם-חלקי** | engine strong; WF gaps |
| Subcontractors + portal | **שלם בקוד** | DG tracks 0158+ |
| Expenses + procurement + AP | **שלם בקוד** | invariants tested |
| Billing + SUMIT | **חלקי** | FIN gaps + external |
| Documents + cloud | **שלם-חלקי** | dual upload models |
| Dev/GC + field | **שלם-חלקי** | PM-004 missing |
| Reports + analytics | **שלם-חלקי** | mobile defect |
| Security RBAC/RLS | **שלם בקוד · Production תלוי migrate** | 0174/0176 |
| Automations + workers | **שלם-חלקי** | no dedicated dg-events cron (intentional) |

---

## O — תשובות לשאלות Owner

| שאלה | תשובה |
|------|--------|
| **מה אפשר לעשות היום?** | לנהל pipeline מכירות→פרויקט; חוזים ושינויים; כוח אדם ונוכחות; רכש/AP/הוצאות; חיוב ותשלומי לקוח; קבלנים ותביעות; שכבת Dev/GC; מסמכים בענן; דוחות ותזרים — **דרך UI מלא בקוד**, בכפוף להרשאות ומודולים. |
| **מה קיים בקוד ולא אומת?** | רוב ה-387 דפים; SUMIT/OAuth חי; יומן DB Production; 15 שרשראות עסק בדפדפן. |
| **מה הבטחת וחסר?** | פורטל לקוח (deferred); calendar sync (deferred); PM-004; multi-version product quotes; CRM sales quote UI; FIN-003 UX מלא. |
| **מה עובד כשרשרת?** | CRM→quote→project (tests); CO→contract value (tests); PO commitment→AP actual (tests); claim lifecycle (tests); labor allocation→P&L loader (tests) — **לא** end-to-end browser. |
| **מה deferred?** | §L — portal + external calendar. |

---

**סיום גל אימות.** אין המלצת יישום או שחרור בדוח זה. Owner מחליט על תיקונים, apply SQL, ו-smoke Production בנפרד.
