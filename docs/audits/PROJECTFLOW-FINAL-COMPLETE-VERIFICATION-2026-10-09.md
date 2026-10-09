# ProjectFlow — אימות מערכת סופי ומלא (סגירת ביקורת)

| שדה | ערך |
|-----|-----|
| **תאריך** | 2026-10-09 |
| **Commit** | `89e0b9a90c43cffbec24e726675bf8448587833e` |
| **מצב** | **AUDIT ONLY** — ללא תיקוני מוצר, ללא SQL בפרודקשן, ללא צילומי מסך |
| **ממשיך** | [PROJECTFLOW-FULL-SYSTEM-AUDIT-2026-10-09.md](./PROJECTFLOW-FULL-SYSTEM-AUDIT-2026-10-09.md) (גילוי סטטי) · [PROJECTFLOW-OPERATIONAL-VERIFICATION-2026-10-09.md](./PROJECTFLOW-OPERATIONAL-VERIFICATION-2026-10-09.md) (גל אופרציוני 11/11) |
| **ראיות** | Vitest PGlite, סטטיק/מיגרציות; overflow `/reports` מ-regression קודם (**ללא** סריקת דפדפן בגל resolution) |
| **גל אחרון** | **EXECUTABLE PROOF COMPLETE** — §29–§30 + [`_verification-84-findings-final-disposition-2026-10-09.md`](./_verification-84-findings-final-disposition-2026-10-09.md) |

---

## פסק דין מנהלים (Executive Verdict)

**המערכת רחבה, עם מנוע עסקי מוכח חלקית ב-PGlite — לא מוכנה לשחרור "קשיח" לפני תיקון 3 תקלות מוכחות וסגירת פערי לוגיקה בעדיפות גבוהה (§27).**

- **EXEC (גל resolution):** integration ממוקד **86/88** (2× OPS-B-002); unit **59/59**; employer-cost retro **6/6**; subcontract **8/8**; claims **4/4**; contractor-tasks **7/7**; pre0021 **20/20**; tenant-isolation **32/32**; audit vitest **27/27**. מלא: **604/612** (136455, לא הורץ מחדש).
- **מחוץ ל-scope הכרעות (Owner):** Playwright, 387 routes, 60 nav, הרצת 612 מחדש — היסטוריה ב-§25 בלבד.
- **CONFIRMED BUG (3):** **OPS-B-002**, **OPS-B-003**, **UI-MOB-001**.
- **CONFIRMED LOGIC GAP (59 ב-register 81):** רוב הממצאים — STATIC/EXEC חלקי; **לא** 54 "תקלות מוכחות".
- **INTENTIONAL DESIGN (16):** WF-001/FIN2-007, FIN2-001/005/007, קבלן scoped, וכו' — §26.3.
- **MISSING FEATURE (3):** portal, settings/portal, external calendar.
- **TEST / OUTDATED (6 מחוץ ל-register):** session-security, founding, dg-foundation×2, versioning, RPT-002 harness.
- **EXTERNAL:** SEC-010 Production migrations; SUMIT/OAuth חי.
- **כלל "עובדים" בטקסט:** סיווג מובנה בלבד — §177.

**FINAL VERDICT = NOT READY (לוגיקה/תפעול)** — פירוט: **§26–§27**. **אין יישום תיקונים** עד אישור Owner.

---

## §24 — גל השלמת אימות (2026-10-09, **נסגר**)

**מנדט Owner:** השלמת כיסוי חסר — לא דוח נימוקים נוסף. **ללא** הרצת 604/612 מחדש. **ללא** שינויי מוצר.

### תשתית E2E — אבחון ותיקון harness

| בעיה | שורש | פעולה |
|------|------|--------|
| `setup-owner` timeout | כניסה נשארה ב-sign-in; **"האימייל או הסיסמה שגויים"** | `.next` נבנה עם `NEXT_PUBLIC_SUPABASE_URL` מ-`.env.local` (Supabase אמיתי) בעוד ה-harness מריץ auth stub `:55321` |
| `.next/lock` / rebuild | `E2E_SKIP_BUILD=1` על build ישן | `build-for-playwright.mjs` — build עם stub URLs; Playwright config מעודכן |
| Port 3100 | webServer כפול | `reuseExistingServer` + build יחיד, אחר כך `E2E_SKIP_BUILD=1` |

**לוגים:** `_verification-e2e-run-2026-10-09.log`, `_verification-e2e-build-2026-10-09.log` (**136461** exit **0**, ~376s, `build-for-playwright.mjs`)

### מatrix Playwright (387 routes + 60 nav + personas)

| רכיב | מצב | פלט צפוי |
|------|-----|----------|
| `verification-route-matrix.spec.ts` | **רץ אחרי build** | `_verification-route-matrix-results.json`, `_verification-nav-matrix-results.json` |
| `verification-route-personas.spec.ts` | **רץ אחרי build** | `_verification-route-personas-results.json` |
| `_verification-routes-resolved.json` | **387 שורות** | `scripts/audit-verification/resolve-route-urls.mjs` |

**פקודה:** `npm run audit:verification:e2e` (אחרי build ירוק עם stub env)

### 8 כשלונות אינטגרציה — הרצה ממוקדת (**הושלם**)

**33 tests / 6 files → 8 fail | 25 pass** (זהה ל-136455). **3** product defect · **4** outdated test · **1** test infra. [Targeted integration failures](e90ab7b8-c0e5-4aef-9d43-711e56533cf4) · [`_verification-integration-targeted-2026-10-09.md`](./_verification-integration-targeted-2026-10-09.md)

**משלים:** WF-002 atomicity **8/8** (לא מכסה approved+overwrite); PM-001 unit **4/4**; FIN-005 bridge unit **5/5** (ללא gross→net assert); SEC-002 **אין** integration test.

### 15 תרחישי עסק — מיפוי + הרצה חלקית (**הושלם**)

**56/56** integration (9 קבצים) + **20/20** unit (4 קבצים). מפת מלאה + Appendix A–C: [15 business flow map](01c21234-fe79-4e06-98da-8ba94b66c6f1) · [`_verification-business-flows-map-2026-10-09.md`](./_verification-business-flows-map-2026-10-09.md)

**E2E מקושר 15/15:** **0/15** browser chain.

| Run | תוצאה |
|-----|--------|
| **136460** | `setup-owner` fail — Supabase bake |
| **136461** | build stub **OK** (~376s) |
| **136462** | exit **1** (~113s): owner matrix **`ERR_ABORTED`** @ `/he-IL/jobs` (לפני JSON); employee login **timeout** + PGlite **`ECONNRESET`**; **60 nav לא רץ** (סדר ישן). לוג: `_verification-e2e-run-2026-10-09-retry.log` |

**Harness v2 (audit):** nav לפני owner sweep; `commit` + try/catch + flush JSON חלקי; persona login resilient.

### 81 ממצאים — הרצת הוכחות (**הושלם**)

[81 findings execution](07f16b89-344b-4128-afdf-5ecab46ad341) · [`_verification-81-findings-execution-2026-10-09.md`](./_verification-81-findings-execution-2026-10-09.md) — **81/81** שורות; audit vitest **27/27**; **BLOCKER:** SEC-010 Production apply, SEC-004 browser proof.

### סוכני רקע — סטטוס

| סוכן | סטטוס |
|------|--------|
| [Targeted integration failures](e90ab7b8-c0e5-4aef-9d43-711e56533cf4) | **Integrated** |
| [15 business flow map](01c21234-fe79-4e06-98da-8ba94b66c6f1) | **Integrated** |
| [81 findings execution](07f16b89-344b-4128-afdf-5ecab46ad341) | **Integrated** |

---

## §23 — מדדים מדויקים (Measured Totals)

שיטת מלאי: [Action inventory methodology](54a9e84a-55d1-4ee9-b6f9-4ba46f56a7c5) · [\_action-inventory-methodology-2026-10-09.md](./_action-inventory-methodology-2026-10-09.md) (DOM-001…020).

| מדד | ערך | הערה |
|-----|-----|------|
| **D_ui — TOTAL ROUTES** | **387** | `_route-inventory-2026-10-09.txt` |
| **D_api — API ROUTES** | **31** | `route.ts` (ops recount) |
| **D_nav — NAV_ITEMS** | **60** | `navigation.ts` (גל §04 השתמש **58** — drift) |
| **D_sa — SERVER ACTIONS** | **604** | `export async function` ב-**87** קבצי `actions.ts` (**452** ב-owner `(app)`) |
| **D_checkpoint (§22)** | **418** | D_ui + D_api |
| **D_total (מלאי קוד)** | **1,022** | D_ui + D_api + D_sa — **לא** מוסיפים D_nav |
| **NAV ITEMS — browser matrix (60/60)** | **60/60** | `_verification-nav-matrix-results.json`: **58** LOAD, **1** overflow (`reports`), **1** ERROR (`settings`) |
| **ROUTES — owner browser (246/246)** | **246/246** | `_verification-route-matrix-results.json`: **104** LOAD, **142** ERROR |
| **ROUTES — public/contractor/employee (141)** | **0/141 browser** | persona sweep **לא הושלם** — harness session (ראו §25) |
| **ROUTES — inventory resolved** | **387/387** | `_verification-routes-resolved.json` |
| **CAPABILITY ANCHORS VERIFIED (integration)** | **≥71** | §22 — **לא** 1:1 עם 387 דפים |
| **TOTAL USER ACTIONS VERIFIED (executable)** | **~680** | ~612 אינטגרציה + יחידה/UI ממוקד (ללא dedupe) — **מנוע/DB** |
| **TOTAL USER ACTIONS VERIFIED (browser)** | **~25** | shell 9 + overflow matrix + mobile-nav 2 + regressions |
| **TOTAL USER ACTIONS BROKEN** | **3** | OPS-B-002; OPS-B-003; UI-MOB-001 `/reports` |
| **TOTAL USER ACTIONS PARTIAL** | **~120** | תחומים עם אינטגרציה חלקית + 5 nav |
| **TOTAL USER ACTIONS NOT IMPLEMENTED** | **≥3** | `/portal/*`, `/settings/portal` UI, SUMIT credit/cancel UI (FIN-003) |
| **TOTAL USER ACTIONS NOT VERIFIED** | **≥350** | דפים + nav + פעולות UI שלא נוגעו ב-E2E |
| **MOBILE PAGE FAMILIES TESTED** | **6** | regression routes (dashboard, reports, projects, expenses, project detail, settings) |
| **MOBILE FAMILIES WITHOUT OVERFLOW (passed widths)** | **5** | reports **failed** |
| **MOBILE OVERFLOW DEFECTS** | **≥1** | `/reports` @320 (scrollWidth=453) |
| **TOTAL BUSINESS FLOWS** | **15** | מטריצת Owner (A–O + cross) |
| **FLOWS — integration/unit depth** | **9/15 strong PARTIAL+** | `_verification-business-flows-map-2026-10-09.md`; **56+20** tests גל 2 |
| **FLOWS VERIFIED END-TO-END (browser)** | **0/15** | money-chain / journeys לא רצו ירוק |
| **FLOWS PARTIAL** | **12/15** | CRM, subcontract, timesheet, employer-cost, claims, PRE-0021 |
| **FLOWS NOT VERIFIED (browser)** | **3/15** | SUMIT chain; dashboard/report E2E; consultant field E2E |
| **81 — CONFIRMED BUG** | **0** | תקלות מוכחות ב-register המקורי → **CONFIRMED LOGIC GAP** (§26) |
| **81 — CONFIRMED LOGIC GAP** | **59** | static + unit/exec חלקי — §26.3 |
| **81 — MISSING FEATURE** | **3** | UI-001, UI-002, PM-012 |
| **81 — INTENTIONAL DESIGN** | **15** | WF-001, WF-008, WF-010, FIN2-001/005/007, SEC-005/007/008, DOC-003/007/009/010, OPS-003, PM-015 |
| **81 — OUTDATED TEST** | **0** | (ב-register; ראו extras §26.2) |
| **81 — TEST INFRASTRUCTURE** | **2** | RPT-002, OPS-005 |
| **81 — EXTERNAL VERIFICATION REQUIRED** | **2** | SEC-010, DOC-006 (OAuth חי) |
| **81 — NOT REPRODUCED** | **0** | |
| **81 — PARTIAL → LOGIC GAP** | **5** | WF-003, FIN2-004, UI-003, PM-013/014 |
| **Extras (מחוץ ל-81)** | **3 BUG** | OPS-B-002, OPS-B-003, UI-MOB-001 |
| **NEW VERIFIED PRODUCT DEFECTS** | **3** | OPS-B-002 month-close; UI-MOB-001 reports overflow; OPS-B-003 RLS FORCE hygiene |
| **TEST INFRASTRUCTURE FAILURES** | **5** | session-security, versioning, founding, dg-foundation (2) |
| **INTEGRATION SUITE** | **604/612 pass** | terminal 136455 |
| **EMPLOYER COST RETRO CORRECTION** | **VERIFIED WORKING** | `employee-actual-employer-cost.test.ts` 6/6 |
| **RETRO ATTENDANCE / MULTI-DATE** | **PARTIAL** | atomicity integration; WF-002 **CONFIRMED** static overwrite voids approved — audit vitest |
| **SUBCONTRACTOR + "עובדים" TEXT** | **INTENTIONAL DESIGN** | סיווג מובנה בלבד |
| **CONTRACTOR GRANT ISOLATION** | **PARTIAL** | 6/7 session-security; agreement visible = **מוזמן** |
| **PROJECT FINANCIAL RECONCILIATION** | **PARTIAL** | pre0021 + unit NET/GROSS |
| **SUMIT MOCK E2E** | **NOT VERIFIED** | mock unit בלבד |
| **PRODUCTION PARITY** | **NOT VERIFIED** | SEC-010; migrations journal |
| **COVERAGE (דו-מספרי)** | **104/387** owner LOAD; **60/60** nav accounted; **≥71/1,022** integration | **246+141** persona split — §25 |

*(אין אחוז "מוכנות" маркeting — רק מכנה מפורש.)*

---

## חקירת 8 כשלונות האינטגרציה המלאה (terminal 136455)

### 1. `session-security.test.ts` — **TEST INFRA / OUTDATED TEST** ([Integration failure forensics](abc7d60a-2b80-48be-b01f-81503c303c2d))

- **מה קרה:** `subcontractAgreements` SELECT **1**, expected **0** (vendors/projects/expenses **0**).
- **ראיה:** grant + `ext.project.view`; migration **0168** — `subcontract_agreements_read()` / `external_has_scope` מאפשרים קריאת הסכם scoped לקבלן מוזמן.
- **מסקנה (Owner §16):** **לא** VERIFIED BROKEN — ציפיית בדיקה ישנה.

### 2. `migrations.test.ts` — **OPS-B-003 → VERIFIED BROKEN (migration hygiene)** ([Integration failure forensics](abc7d60a-2b80-48be-b01f-81503c303c2d))

- **5 טבלאות** RLS ללא **FORCE** (sequences service-only — ייתכן allowlist ב-gate).
- **מסקנה:** gate repo נכשל; exploit PostgREST **NOT VERIFIED**.

### 3–4. `dg-foundation/foundation.test.ts` — **TEST INFRASTRUCTURE** ([Integration failure forensics](abc7d60a-2b80-48be-b01f-81503c303c2d))

- **Grant (3):** `narrowToAgreement` בלי `narrowToProject` → `project_id` null עם `subcontract_agreement_id` — violates CHECK **0156** (`project_id IS NOT NULL`). תיקון fixture ב-`dg-fixtures.ts`, לא מוצר.
- **Domain events (4):** `addProjectMember` ×2 מפיק אירועים + 2 inserts בבדיקה → count **4** ללא filter; **OUTDATED TEST** scope.

### 5. `documents/versioning.test.ts` — **TEST INFRASTRUCTURE**

- URL: `/api/org-storage/download/{id}?disposition=attachment` vs encoded filename — proxy design.

### 6–7. `closed-period-source-corrections.test.ts` — **OPS-B-002 → VERIFIED BROKEN (product path)**

- **שגיאה:** `employee_month_costs_displacement_coupling` — CHECK דורש `recognition_source = 'monthly_allocated'` כש-`status IN ('applied','closed')`.
- **Default schema:** `recognition_source` default **`time_snapshot`** ([`workforce.ts`](../../drizzle/schema/workforce.ts) L242).
- **תרחיש:** `closeMonth()` → `closeEmployeeMonthCost` מעדכן ל-`closed` בלי להמיר recognition; EMC מוזן/נוצר עם snapshot שעות.
- **השפעה:** סגירת חודש נכשלת DB-level כשעלות חודשית מבוססת snapshot — **בלי** להסיר יכולת retro actual cost (הבדיקות 6/6 employer-cost **עוברות**).
- **תיקון (מחוץ ל-audit):** סגירה חייבת ליישר recognition או לחסום close עם הודעה — **לא** למחוק retro.

### 8. `tenancy/founding.test.ts` — **TEST INFRASTRUCTURE (drift)**

- Roles **5 vs 4** — תבנית תפקיד חדשה ב-seed; לא פגם מוצר.

---

## כלל Owner: תיאור חופשי "עובדים" (מוחלט)

| עקרון | סטטוס |
|--------|--------|
| סיווג מקור האמת | `categoryKey`, `costFamily`, `vendor_id`, `project_id`, קשרי AP — **לא** `description` |
| הוצאת קבלן + תיאור "עובדים" | **INTENTIONAL** — נשארת הוצאת קבלן בפרויקט |
| dedupe מול payroll פנימי | רק `internal_employee_payroll` + מסלול workforce — **WF-001 DESIGN** |
| שינוי/מחיקה/מיגרציה לפי טקסט | **אסור** — לא בוצע ולא מומלץ |

**ראיה:** `labor-expense-integrity.test.ts` — Actual **11,000** = 8k `labor` expense + 3k workforce; generic `labor` **לא** מוחרג.

---

## A. ארכיטקטורה ומודולים

Next.js App Router, tenancy, RBAC, RLS PGlite, מודולים: projects, workforce, financials, CRM, billing, SUMIT adapter, procurement, BOQ, tasks, planning, scheduling, field (dg-field, field-ops), documents + external-storage, contractor-access, month-close, reports, dg-events workers.

**סטטוס:** ארכיטקטורה **קיימת ומוכחת חלקית** באינטגרציה; **NOT VERIFIED** end-to-end UI.

---

## B. מלאי routes, דפים ופעולות

- **387** דפים — [`_route-inventory-2026-10-09.txt`](./_route-inventory-2026-10-09.txt) — ברירת מחדל **NOT VERIFIED (browser)**.
- **31** API · **604** server actions · **87** קבצי `actions.ts` — **PARTIAL** דרך אינטגרציה לפי תחום.
- **60** `NAV_ITEMS` — **5** E2E `goto`; **55** לא.

*(דגימת 20 שורות DOM — [\_action-inventory-methodology-2026-10-09.md](./_action-inventory-methodology-2026-10-09.md); לא ספירה ידנית של כל כפתור.)*

---

## C. סוגי פרויקט והשוואה

| מודל | מה קיים | מה נבדק |
|------|---------|---------|
| `work_kind` project/job/work_order | קוד + integration | projects integration **28** pass |
| 10 structure template keys | metadata + `simple_finish` clone apply | **1/10** DB apply proven |
| 16 team capability templates | unit loop (capabilities) | **PARTIAL** |
| developer_gc vs GC | nav/profile | **NOT VERIFIED** URL (SEC-004 static) |

---

## D–K. תחומים (סיכום ראיות)

| סעיף | תחום | עובד (executable) | חלקי | חסר | לא מאומת |
|------|------|-------------------|------|-----|-----------|
| D | פרויקטים/חוזים | contracts, BOQ 46 tests | templates apply | | רוב tabs UI |
| E–H | כוח אדם | 37+5 int, 418 unit, retro cost **A** | month-close **B** | WF-002 | UI clock |
| G | actual vs estimate | 6/6 employer cost | | | |
| I | הקצאה/רווח | pre0021, compose unit | | | E2E margin |
| J | קבלנים/הוצאות | PO receive, AP | | | טקst "עובדים" = OK |
| K | רכש/מלאי | procurement 50 pass | void PO commitment migration | | |

---

## L–M. CRM, הצעות, חיוב, SUMIT

- CRM convert **4/4** · billing integrity · billing-plan **13** · mock SUMIT **22 unit files** — **VERIFIED WORKING (mock)**.
- **FIN-005** — **CONFIRMED** (static `create-billing-record` + bridge); **NOT VERIFIED** ב-SUMIT HTTP.
- **FIN-002** — **CONFIRMED** (static decouple void/cancel); **NOT VERIFIED** coordination test.

---

## N–U. משימות, שדה, מסמכים, קבלנים, אבטחה, דוחות

| תחום | ראיה | סטטוס |
|------|------|--------|
| Tasks/planning | Agent 02 **63/63** | assign **A**, reports **NOT VERIFIED** |
| Field/docs | Agent 07–08 **40/41** | evidence chain **A**, DOC-002 owner UI gap |
| Contractor | session-security **6/7** | grant scoped agreement **DESIGN** |
| Security | tenant-isolation **32/32** | SEC-001/002 **CONFIRMED** static RLS gap; raw SELECT **NOT VERIFIED** |
| Reports/workers | unit 32 + consumer 9 | E2E money-chain **FAILED** setup |
| Automations | dg-events **A** | OPS-001 cron **PARTIAL** (hobby crons unit) |

---

## V. מובייל — גלילה אופקית

- **VERIFIED BROKEN:** `/reports` @320px — `scrollWidth=453` > `clientWidth=320` ([Agent 11](22c89668-861c-4935-ab5c-4f88b19d9184), `regression.spec.ts`).
- **שאר משפחות:** נבדקו **6** routes ב-regression — **5** pass overflow ב-critical widths; **לא** כיסוי מלא Owner/Employee/Contractor/כל הטאבים (דרישת Owner **NOT MET**).

---

## W. Cross-module (15 זרימות)

ראו [OPERATIONAL §18](./PROJECTFLOW-OPERATIONAL-VERIFICATION-2026-10-09.md) — **PARTIAL** בלבד; **0** E2E מלא.

---

## X. Annex — פירוק 81 ממצאים (כל ID בנפרד)

**רשם מבוצע (סמכותי גל 2):** [`_verification-81-findings-execution-2026-10-09.md`](./_verification-81-findings-execution-2026-10-09.md) — **81/81** שורות ([81 findings execution](07f16b89-344b-4128-afdf-5ecab46ad341)). Reconcile קודם: [81 findings disposition](d46d750c-f629-4870-b0d8-c1c1411baa74). להלן טבלת עברית מקוצרת (עודכנה חלקית בגל 2):

*(עמודות: ID | טענה | סטטוס | ראיה | השפעה | תיקון?)*

| ID | טענה מקורית | סטטוס סופי | ראיה מבוצעת | השפעה | תיקון? |
|----|-------------|------------|-------------|--------|--------|
| WF-001 | כפל labor expense + workforce | **INTENTIONAL DESIGN** | `labor-expense-integrity` 6/6; migration 0070 | סיכון סיווג שגוי | Y (תהליך) |
| WF-002 | overwrite מבטל approved | **CONFIRMED** | audit vitest + `attendance-project-sync.ts` | voids approved/submitted | Y (מדיניות) |
| WF-003 | EMC reopenable | **PARTIAL CONFIRMED** + **OPS-B-002** | employer-cost pass; close fails coupling | סגירת חודש | Y |
| WF-004 | WDM front-load | **CONFIRMED** | audit vitest; `monthly-accrual.ts` | math front-load | Y |
| WF-005 | doc vs code labor key | **CONFIRMED** | unit + doc drift | בלבול תיעוד | Y doc |
| WF-006 | auto-approve attendance | **CONFIRMED** | audit vitest | sync auto-approve | Y |
| WF-007 | dual approval UX | **CONFIRMED** | audit vitest | dual paths | Y |
| WF-008 | no offline clock | **INTENTIONAL DESIGN** | product online-only | צפוי | N |
| WF-009 | pending hours pool | **CONFIRMED** | audit vitest | unallocated fields | N |
| WF-010 | clock correction hint | **INTENTIONAL DESIGN** | static by design | UX link | Y |
| FIN-001 | receipt idempotency | **CONFIRMED** | payment plan unit 14/14 | SUMIT dup risk mitigated | N |
| FIN-002 | void ≠ provider cancel | **CONFIRMED** | static `void-billing-record`; no coord test | AR vs statutory | Y |
| FIN-003 | no SUMIT credit UI | **CONFIRMED** | static actions scope | UX חסר | Y |
| FIN-004 | credit note → SUMIT | **CONFIRMED** | audit vitest | no SUMIT on adjust | Y |
| FIN-005 | gross lineTotal → SUMIT net | **CONFIRMED** | static L68–76 + bridge; no assert test | סיכון SUMIT | Y |
| FIN2-001 | overlap no-op | **INTENTIONAL DESIGN** | `expense-ap-overlap` 4/4 | כפל אם unlinked | Y (מדיניות) |
| FIN2-002 | statement gross vs net labels | **CONFIRMED** | audit vitest | net under invoiced label | N |
| FIN2-003 | discipline unmapped actuals | **CONFIRMED** | `map-line-actuals.test.ts` | unmapped lines | Y |
| FIN2-004 | overhead hub UX | **PARTIAL** | redirect `/overhead` | UX | Y |
| FIN2-005 | cash forecast omits expenses | **NOT VERIFIED** | design static | disclosure | N |
| FIN2-006 | duplicate forecast labels i18n | **NOT VERIFIED** | locales | copy | N |
| FIN2-007 | = WF-001 labor | **INTENTIONAL DESIGN** | same as WF-001 | same | Y process |
| FIN2-008 | GCM stale vs pool | **NOT VERIFIED** | static | timing | N |
| FIN2-009 | legacy org expenses API | **NOT VERIFIED** | static | legacy | N |
| FIN2-010 | receive ≠ expense | **CONFIRMED (model)** | `po-receiving` pass | by design edu | N |
| CRM-001 | convert without CRM perm | **NOT VERIFIED** | CRM 4/4 לא edge | edge case | Y |
| CRM-002 | bridge draft CRM version | **NOT VERIFIED** | static convert | data risk | Y |
| CRM-003 | lead converted early | **NOT VERIFIED** | static | list hygiene | N |
| UI-001 | portal 404 | **NOT IMPLEMENTED** | `notFound()` code | no portal | Y product |
| UI-002 | settings portal 404 | **NOT IMPLEMENTED** | code | admin gap | Y |
| UI-003 | employee attendance revalidate | **PARTIAL** | mobile-nav 2/2 | alias path | Y |
| UI-004 | inbox → today | **NOT VERIFIED** | static nav | legacy | N |
| UI-005 | task-api-stub naming | **NOT VERIFIED** | static TRIVIAL | naming | N |
| SEC-001 | audit_events RLS | **CONFIRMED** | static `0001_rls`; app gate only in tests | PostgREST risk | Y |
| SEC-002 | contracts RLS | **CONFIRMED** | static vs 0073 pattern | PostgREST risk | Y |
| SEC-003 | role project_id SQL vs app | **NOT VERIFIED** | static 0154 | divergence | Y |
| SEC-004 | GC URL without profile | **NOT VERIFIED** | no browser | URL leak risk | Y |
| SEC-005 | GC nav story | **NOT VERIFIED** | static | product | N |
| SEC-006 | default project access all | **NOT VERIFIED** | migration 0050 | onboarding | N |
| SEC-007 | null project_id visible | **NOT VERIFIED** | static | by design | N |
| SEC-008 | manager template powerful | **INTENTIONAL DESIGN** | role-templates | verified design | N |
| SEC-009 | subcontract money mask | **CONFIRMED** | 0168 tests partial | when migrated | N |
| SEC-010 | PREPARED migrations journal | **NOT VERIFIED** | journal headers | prod drift | Owner |
| PM-001 | template metadata not applied | **CONFIRMED** | 1/10 apply tests | BOQ/forms missing | Y |
| PM-002 | closeout keys unused | **NOT VERIFIED** | static JSON | not wired | Y |
| PM-003 | dual field stacks | **CONFIRMED** | dg-field + field-ops pass | UX split | Y |
| PM-004 | instruction→CO stub | **NOT VERIFIED** | static | commercial gap | Y |
| PM-005 | planning ≠ tasks | **CONFIRMED** | Agent 02 tests | separate models | N/doc |
| PM-006 | bookings ≠ tasks sync | **CONFIRMED** | scheduling 2/2 no bridge | no sync | optional |
| PM-007 | no CPM false claim | **NOT VERIFIED** | static honest flag | copy | N |
| PM-008 | manual progress default | **NOT VERIFIED** | no derive-progress int | default | Y |
| PM-009 | owner task no evidence | **CONFIRMED** | no owner UI test | asymmetry | Y |
| PM-010 | jobs skip planning | **NOT VERIFIED** | static eligibility | rule | N |
| PM-011 | four date lenses | **NOT VERIFIED** | static fragmentation | map | N |
| PM-012 | external calendar future | **NOT IMPLEMENTED** | EXTERNAL_CALENDAR | future | N |
| PM-013 | reminder delivery thin | **PARTIAL** | dg-events consumer pass | worker dep | Y |
| PM-014 | assignAll rule | **PARTIAL CONFIRMED** | project-tasks-ux | doc | N |
| PM-015 | work_kind as type | **INTENTIONAL DESIGN** | schema | model choice | N |
| DOC-001 | no inline preview | **NOT VERIFIED** | no preview test | UX | Y |
| DOC-002 | owner task evidence gap | **CONFIRMED** | contractor path A | gap | Y |
| DOC-003 | dual upload models | **INTENTIONAL DESIGN** | field-ops + evidence pass | by design | guide |
| DOC-004 | legacy vs DG evidence | **CONFIRMED** | both pass | dual model | migrate? |
| DOC-005 | audit labels i18n | **NOT VERIFIED** | static | incomplete | N |
| DOC-006 | Google export errors | **NOT VERIFIED** | mock OAuth only | provider | Y |
| DOC-007 | draft hidden contractor | **NOT VERIFIED** | RLS static | intentional | UX |
| DOC-008 | folder skip silent | **NOT VERIFIED** | static apply | toast | Y |
| DOC-009 | revoked share NotFound | **NOT VERIFIED** | static | UX | N |
| DOC-010 | no fallback bucket | **INTENTIONAL DESIGN** | roundtrip + policy | require connect | N |
| DOC-011 | employee docs category null | **NOT VERIFIED** | static | filter | Y |
| DOC-012 | SUMIT PDF archive folders | **NOT VERIFIED** | static invoicing | gap | Y |
| RPT-001 | no labor-by-period pack | **NOT VERIFIED** | static catalog | missing report | Y |
| RPT-002 | no actual on reports E2E | **TEST INFRA** | unit 8/8; PW setup fail | gate broken | Y |
| RPT-003 | dashboard contract ≥ only | **NOT VERIFIED** | static E2E design | test gap | N |
| RPT-004 | period filters semantics | **NOT VERIFIED** | static | labels | N |
| RPT-005 | vendorActual semantics | **NOT VERIFIED** | static KPI | naming | Y |
| RPT-006 | analytics gate | **NOT VERIFIED** | static | UX | N |
| OPS-001 | dg-events cron | **CONFIRMED** | hobby crons 1/1 + consumer 9/9; prod cron **E** | kick-only | Y |
| OPS-002 | storage worker async | **NOT VERIFIED** | static route | poll | Y |
| OPS-003 | hobby cron limits | **INTENTIONAL DESIGN** | vercel hobby test | plan limit | N |
| OPS-004 | kick errors swallowed | **NOT VERIFIED** | static kick-drain | observability | Y |
| OPS-005 | no ops-worker int test | **PARTIAL** | consumer 9/9 | harness gap | Y |

---

## Y. פגמים חדשים (מעבר ל-81)

| ID | סיווג | תיאור |
|----|--------|--------|
| **OPS-B-002** | **VERIFIED BROKEN** | סגירת חודש + `displacement_coupling` ([Forensics](abc7d60a-2b80-48be-b01f-81503c303c2d)) |
| **UI-MOB-001** | **VERIFIED BROKEN** | `/reports` overflow @320px |
| session-security | **TEST INFRA** | 0168 scoped agreement read — **לא** B |
| **OPS-B-003** | **VERIFIED BROKEN (hygiene)** | 5 tables missing FORCE RLS |

---

## §25 — מטריצת 387 דפים + 60 ניווט (תוצאות ביצוע)

סיכום: [`_verification-route-ledger-summary-2026-10-09.md`](./_verification-route-ledger-summary-2026-10-09.md). שורה-שורה: JSON ב-`docs/audits/_verification-*-results.json`.

| Persona | דפים | browser |
|---------|-----:|---------|
| Owner | 246 | **246/246** נספרו — **104** VERIFIED_LOAD, **142** ERROR (timeout/RSC/PGlite תחת sweep ~1h) |
| Public | 14 | **NOT VERIFIED** — persona spec לא רץ (webServer/cookies אחרי sweep) |
| Contractor | 35 | **NOT VERIFIED** — login `ECONNRESET` (136462); לא retest (Owner: no restart) |
| Employee | 92 | **NOT VERIFIED** — login timeout; לא retest |
| **NAV 60** | — | **60/60** — **58** OK, **reports** overflow, **settings** ERR_ABORTED |

**הרצות E2E רלוונטיות:** build stub **136461** OK; matrix **136463** (nav+owner, ~1h, exit 1 timeout); **136462** persona fail; persona continuation **failed** setup (אין sign-in DOM).

---

## Z. כיסוי שלא אומת — סיבות מדויקות

| פער | סיבה |
|-----|------|
| 141 דפי public/contractor/employee | persona browser matrix לא הושלם; harness session ended |
| 142 דפי Owner ERROR | RSC/MISSING_MESSAGE/timeout תחת sweep serial 45s×246 |
| 15/15 E2E business | אין שרשרת browser; integration בלבד |
| SUMIT production HTTP | mock/unit; אין credentials |
| SEC-010 Production | journal local OK; apply state unknown |
| SEC-004 browser | static CONFIRMED; URL proof blocked |
| Mobile כל המשפחות | nav matrix @320 ל-58; לא employee/contractor/project tabs מלא |
| 604 server actions | לא matrix per-action — integration selective |

---

## סגירת גל סופי — Lead integrator

| פריט | סטטוס |
|------|--------|
| 11/11 operational agents | **Integrated** |
| Full integration 136455 | **Parsed** — [Integration failure forensics](abc7d60a-2b80-48be-b01f-81503c303c2d) |
| 81 findings individual | **81/81** — [`_verification-81-findings-execution-2026-10-09.md`](./_verification-81-findings-execution-2026-10-09.md) ([81 findings execution](07f16b89-344b-4128-afdf-5ecab46ad341)) |
| Action inventory D_total | **1,022** — [Action inventory methodology](54a9e84a-55d1-4ee9-b6f9-4ba46f56a7c5) |
| Wave 2 E2E matrix | **136463** nav **60/60** + owner **246/246** counted |
| Master Hebrew report | **This file** |
| Product fixes | **None** (audit only) |
| FINAL FINDINGS RESOLUTION | **§26–§27**; [15 flows](11b51c70-4909-40b9-a680-68bf1cf948c2) SUP **73/73**; [Security](dcf153cd-78e7-4452-a3b4-137046c2e702) |

**FINAL VERDICT = NOT READY (לוגיקה)** — ראו §26–§27; **אין יישום תיקונים** עד אישור Owner מפורש.

---

## §26 — FINAL FINDINGS RESOLUTION (2026-10-09)

**מנדט:** הכרעה בכל ממצא עם ראיה; **ללא** תיקון מוצר, SQL בפרודקשן, Playwright, או סריקת routes.  
**מקורות:** [`_verification-81-findings-execution-2026-10-09.md`](./_verification-81-findings-execution-2026-10-09.md), [`_findings-resolution-security-2026-10-09.md`](./_findings-resolution-security-2026-10-09.md), לוגים `_findings-resolution-*-batch-2026-10-09.log`.

### 26.1 סוגי ראיה

| סוג | משמעות |
|-----|--------|
| **EXEC** | Vitest integration/unit רץ בגל resolution או 136455 |
| **STATIC** | קוד, מיגרציה, audit vitest קריאת קובץ |
| **PRIOR** | ראיה מגל קודם (למשל UI overflow) — לא חוזר |
| **EXT** | דורש Production / SUMIT חי / OAuth — לא בוצע |

### 26.2 סיכום סיווג (81 + 3)

| Disposition | ספירה | הערה |
|-------------|------:|------|
| **CONFIRMED BUG** | **3** | OPS-B-002, OPS-B-003, UI-MOB-001 (מחוץ ל-81) |
| **CONFIRMED LOGIC GAP** | **59** | register 81 (59+16+3+2+1=81) |
| **MISSING FEATURE** | **3** | |
| **INTENTIONAL DESIGN** | **16** | כולל WF-001, FIN2-001, SEC-009, קבלן scoped |
| **TEST INFRASTRUCTURE** | **2** | RPT-002, OPS-005 (+ dg-foundation fixture **מחוץ ל-81**) |
| **OUTDATED TEST** | **4** | session-security, founding, dg-events count, versioning (**מחוץ ל-81**) |
| **EXTERNAL VERIFICATION REQUIRED** | **3** | SEC-010; SUMIT חי (FIN-002/003/004); DOC-006 OAuth |
| **NOT REPRODUCED** | **0** | |

### 26.3 רשם הכרעות — 81 ממצאים + 3 חדשים

**עמודות:** ID · **Disposition** · ראיה · דרישות Owner

| ID | Disposition | ראיה | הערת Owner / השפעה |
|----|-------------|------|---------------------|
| WF-001 | INTENTIONAL DESIGN | EXEC `labor-expense-integrity` 6/6 | רק `internal_employee_payroll` מוחרג; טקסט חופשי לא קובע |
| WF-002 | **VERIFIED BUSINESS LOGIC GAP** | **EXEC** `wf-002-attendance-overwrite-approved.test.ts` **PASS** | overwrite **voids** bulk-approved entry; DB `voidedAt` set |
| WF-003 | CONFIRMED LOGIC GAP | EXEC employer-cost 6/6; close **נכשל** OPS-B-002 | retro actual **עובד**; סגירת חודש **שבורה** |
| WF-004 | CONFIRMED LOGIC GAP | EXEC math audit vitest | WDM נמוך מזין pool מהר |
| WF-005 | CONFIRMED LOGIC GAP | EXEC unit + doc | drift תיעוד LABOR-COST |
| WF-006 | **VERIFIED BUSINESS LOGIC GAP** | **EXEC** `workforce-wf-006-attendance-auto-approve.test.ts` | sync מקדם ל-approved בלי שלב נפרד |
| WF-007 | CONFIRMED LOGIC GAP | STATIC dual modules | שני מסלולי אישור |
| WF-008 | INTENTIONAL DESIGN | product online-only | |
| WF-009 | CONFIRMED LOGIC GAP | STATIC unallocated fields | שעות pending → pool |
| WF-010 | INTENTIONAL DESIGN | by design | |
| FIN-001 | CONFIRMED LOGIC GAP | unit payment plan 14/14 | scope idempotency receipt |
| FIN-002 | **VERIFIED BUSINESS LOGIC GAP** + **EXT** (SUMIT חי) | **EXEC** `fin-002-void-statutory-decouple.test.ts` + unit bundle | void AR; **0** statutory cancel docs |
| FIN-003 | **VERIFIED MISSING FEATURE** | **EXEC** unit bundle + `fin-003-004-sumit-mock-chain` (mock) | אין UI credit/cancel; provider payload קיים בקוד |
| FIN-004 | **VERIFIED BUSINESS LOGIC GAP** | **EXEC** mock chain + unit bundle; **ללא** post-adjustment integration | credit mapping ב-provider; לא מחובר billing adjust |
| FIN-005 | **VERIFIED BUSINESS LOGIC GAP** | **EXEC** `fin-005-gross-line-sumit-mapping.test.ts` **3/3** | gross lineTotal → SUMIT line net |
| FIN2-001 | INTENTIONAL DESIGN | EXEC warn-only 4/4 | |
| FIN2-002 | CONFIRMED LOGIC GAP | STATIC present-financials | net תחת label invoiced |
| FIN2-003 | CONFIRMED LOGIC GAP | EXEC map-line-actuals | discipline unmapped |
| FIN2-004 | CONFIRMED LOGIC GAP | redirect `/overhead` | UX חלקי |
| FIN2-005 | INTENTIONAL DESIGN | disclosure static | |
| FIN2-006 | CONFIRMED LOGIC GAP | STATIC locales | duplicate forecastProfit |
| FIN2-007 | INTENTIONAL DESIGN | = WF-001 | |
| FIN2-008 | CONFIRMED LOGIC GAP | STATIC GCM timing | חודשים פתוחים/קפואים |
| FIN2-009 | CONFIRMED LOGIC GAP | STATIC deprecated API | |
| FIN2-010 | CONFIRMED LOGIC GAP | EXEC po-receiving | receive ≠ expense (מודל) |
| CRM-001 | **VERIFIED BUSINESS LOGIC GAP** | **EXEC** `crm-001-002-convert-edges.test.ts` | convert בלי `crm.manage` — opp **לא** won |
| CRM-002 | **VERIFIED BUSINESS LOGIC GAP** | **EXEC** `crm-001-002-convert-edges.test.ts` | bridge נשען על **accepted** version, לא draft |
| CRM-003 | CONFIRMED LOGIC GAP | STATIC opportunities | lead converted מוקדם |
| UI-001 | MISSING FEATURE | `notFound()` portal | |
| UI-002 | MISSING FEATURE | settings portal | |
| UI-003 | CONFIRMED LOGIC GAP | unit mobile-nav 2/2 | alias attendance |
| UI-004 | CONFIRMED LOGIC GAP | STATIC redirect | inbox→today |
| UI-005 | CONFIRMED LOGIC GAP | STATIC trivial | stub naming |
| SEC-001 | **VERIFIED BUSINESS LOGIC GAP** | **EXEC** `rls-permission-gaps` SEC-001 raw SELECT **≥1 row** | DB bypass vs `audit.read` |
| SEC-002 | **VERIFIED BUSINESS LOGIC GAP** | **EXEC** `rls-permission-gaps` SEC-002 raw SELECT **1 row** | DB bypass vs `contracts.read` |
| SEC-003 | CONFIRMED LOGIC GAP | STATIC 0154 vs roles.repository | |
| SEC-004 | **VERIFIED BUSINESS LOGIC GAP** + **EXT** (browser URL) | **EXEC** `sec-004-execution-nav-gate.test.ts` **2/2** | `loadProjectExecutionNav` — profile gate; deep-link **לא** נבדק בדפדפן |
| SEC-005 | INTENTIONAL DESIGN | product split GC | |
| SEC-006 | CONFIRMED LOGIC GAP | STATIC default `all` | onboarding |
| SEC-007 | INTENTIONAL DESIGN | null project rows | |
| SEC-008 | INTENTIONAL DESIGN | role templates | |
| SEC-009 | INTENTIONAL DESIGN | 0168 mask | when migrated |
| SEC-010 | EXTERNAL VERIFICATION REQUIRED | journal local OK | Production apply unknown |
| PM-001 | CONFIRMED LOGIC GAP | unit templates 4/4; **1/10** apply int | metadata לא מיושם |
| PM-002 | CONFIRMED LOGIC GAP | STATIC closeout keys | |
| PM-003 | CONFIRMED LOGIC GAP | EXEC dg-field + field-ops | dual stacks |
| PM-004 | CONFIRMED LOGIC GAP | STATIC conversion-port null | |
| PM-005 | CONFIRMED LOGIC GAP | Agent 02 tests | planning ≠ tasks |
| PM-006 | CONFIRMED LOGIC GAP | scheduling 2/2 no bridge | |
| PM-007 | CONFIRMED LOGIC GAP | STATIC honest flag | |
| PM-008 | CONFIRMED LOGIC GAP | STATIC default manual | |
| PM-009 | CONFIRMED LOGIC GAP | static UI gap | owner task evidence |
| PM-010 | CONFIRMED LOGIC GAP | STATIC eligibility | |
| PM-011 | CONFIRMED LOGIC GAP | STATIC fragmentation | |
| PM-012 | MISSING FEATURE | EXTERNAL_CALENDAR | |
| PM-013 | CONFIRMED LOGIC GAP | EXEC consumer 9/9 | reminders thin |
| PM-014 | CONFIRMED LOGIC GAP | project-tasks-ux | assignAll rule |
| PM-015 | INTENTIONAL DESIGN | work_kind | |
| DOC-001 | CONFIRMED LOGIC GAP | STATIC download pattern | |
| DOC-002 | CONFIRMED LOGIC GAP | contractor path A | owner gap |
| DOC-003 | INTENTIONAL DESIGN | dual upload | |
| DOC-004 | CONFIRMED LOGIC GAP | field-ops + evidence | dual model |
| DOC-005 | CONFIRMED LOGIC GAP | STATIC i18n audit | |
| DOC-006 | CONFIRMED LOGIC GAP + **EXT** | STATIC provider | OAuth חי |
| DOC-007 | INTENTIONAL DESIGN | draft hidden | |
| DOC-008 | CONFIRMED LOGIC GAP | STATIC apply template | silent skip |
| DOC-009 | INTENTIONAL DESIGN | NotFound revoked | |
| DOC-010 | INTENTIONAL DESIGN | storage policy | |
| DOC-011 | CONFIRMED LOGIC GAP | STATIC null category | |
| DOC-012 | CONFIRMED LOGIC GAP | STATIC invoicing | no auto archive folders |
| RPT-001 | CONFIRMED LOGIC GAP | STATIC catalog | no labor-by-period pack |
| RPT-002 | TEST INFRASTRUCTURE | unit 8/8; PW setup | E2E gate |
| RPT-003 | CONFIRMED LOGIC GAP | static E2E design | |
| RPT-004 | CONFIRMED LOGIC GAP | static semantics | |
| RPT-005 | CONFIRMED LOGIC GAP | STATIC vendorActual | |
| RPT-006 | CONFIRMED LOGIC GAP | static gate UX | |
| OPS-001 | CONFIRMED LOGIC GAP | hobby crons + consumer 9/9 | kick-only prod |
| OPS-002 | CONFIRMED LOGIC GAP | STATIC async worker | |
| OPS-003 | INTENTIONAL DESIGN | hobby limits | |
| OPS-004 | CONFIRMED LOGIC GAP | STATIC kick swallow | |
| OPS-005 | TEST INFRASTRUCTURE | consumer partial | no full ops-worker int |
| **OPS-B-002** | **VERIFIED BUG** | **EXEC** `ops-b-002-month-close-displacement.test.ts` + `closed-period-source-corrections` **2 fail** | סגירת חודש; retro cost **6/6** נפרד |
| **OPS-B-003** | **CONFIRMED BUG** | EXEC migrations.test; [`_findings-resolution-security`](./_findings-resolution-security-2026-10-09.md) | FORCE RLS; exploit **לא** מוכח |
| **UI-MOB-001** | **CONFIRMED BUG** | PRIOR regression scrollWidth | overflow reports |

### 26.4 אימות תחומים A–H (גל resolution)

| תחום | מה נבדק | תוצאה |
|------|---------|--------|
| **A כוח אדם** | employer-cost 6/6, timesheet 4/4, attendance atomicity 8/8, month-close 3/5 | retro actual/company_only **EXEC OK**; **OPS-B-002 FAIL** on time+close |
| **B הוצאות קבלן** | labor-expense unit; subcontract 8/8; claims 4/4 | **INTENTIONAL** — סיווג מובנה; טקסט "עובדים" **לא** נגע |
| **C כספים/SUMIT** | billing integrity, pre0021 20/20, sumit payload unit 5/5 | NET/VAT bridge unit; **EXT** HTTP; FIN gaps STATIC |
| **D פרויקטים** | templates unit 4/4; subcontract change; CRM convert 4/4 | PM-001 logic gap; chains **PARTIAL** |
| **E הרשאות** | tenant-isolation **32/32**, rls-hardening 5/5; [Security resolution](dcf153cd-78e7-4452-a3b4-137046c2e702) | SEC-001/002 **LOGIC GAP** (לא leak מוכח); OPS-B-003 **BUG**; grant scoped **DESIGN** |
| **F מסמכים** | documents tenant-isolation (batch); versioning **OUTDATED TEST** | ללא מחיקה בענן |
| **G CRM/רכש** | opportunity-quote-conversion 4/4; committed-vs-actual unit | |
| **H דוחות/OPS** | reports static; dg-events 9/9 | מנועי דוח — unit/static; לא UI |

**דרישות Owner שלא נפגעו (EXEC):** הזנת/תיקון actual employer retro (**6/6**); company_only (**test 6**); atomicity attendance (**8/8**); **סגירת חודש** — **BUG** נפרד (OPS-B-002).

### 26.5 חמש עשרה זרימות עסקיות (integration בלבד)

**מיפוי מלא:** [15 business flows chain](11b51c70-4909-40b9-a680-68bf1cf948c2) · [`_findings-resolution-15flows-2026-10-09.md`](./_findings-resolution-15flows-2026-10-09.md)  
**הרצות:** W2 **56/56** (לא חוזר) + supplement **73/73** + **EXEC** `business-flow-chains.test.ts` **3/3** + `wf-002-attendance-overwrite-approved.test.ts` **1/1** (זרימה 9).

**סולם Verdict (chain):** **STRONG** = שרשרת DB מקושרת בקובץ/סuite אחד; **LINKED PARTIAL** = ≥2 צעדים בשרשרת אחת (audit chain) אך לא קצה-לקצה; **VERIFIED MISSING CONNECTION** = רק בדיקות מבודדות / אין קישור בין מודולים.

| # | זרימה | Verdict | ראיה EXEC | פער chain |
|---|--------|---------|-----------|-----------|
| 1 | CRM→quote→project→contract | **LINKED PARTIAL** | `business-flow-chains` Flow 1; opportunity-quote 4/4 | פרויקט נוצר; **חוזה/BOQ apply** — לא באותה שרשרת |
| 2 | change מאושר→ערך חוזה | **STRONG** | subcontract-core 8/8 | |
| 3 | change ממתין→ללא כסף | **STRONG** | subcontract pending | |
| 4 | billing→SUMIT→תשלום→רווח | **LINKED PARTIAL** | `business-flow-chains` Flow 4; billing integrity; billing-plan-flow (SUP) | finalize→AR; **אין** SUMIT HTTP / תשלום / רווח |
| 5 | נוכחות→אישור | **LINKED PARTIAL** | `business-flow-chains` Flow 5; timesheet-approval 4/4 | attendance→**labor cost**; לא timesheet approve מלא |
| 6 | שעות→הקצאה→רווח | **VERIFIED MISSING CONNECTION** | pre0021; post0021/financial-wiring (SUP) | P&L rollup; **OPS-B-002** |
| 7 | employer actual | **STRONG** | employer-cost 6/6 | |
| 8 | retro employer | **STRONG** | employer-cost retro tests | |
| 9 | retro/multi-date attendance | **LINKED PARTIAL** | atomicity 8/8; **EXEC** `wf-002` overwrite→void approved | atomicity **STRONG**; מדיניות overwrite **מוכחת** (gap) |
| 10 | PO receive | **STRONG** | po-receiving (SUP) | |
| 11 | AP/expense/payment | **VERIFIED MISSING CONNECTION** | pre0021; expenses (SUP) | אין chain מאוחד PO→AP→expense |
| 12 | grant→task | **STRONG** | contractor-tasks 7/7 | |
| 13 | task→claim | **STRONG** | claims 4/4 | |
| 14 | progress→wiring | **LINKED PARTIAL** | BOQ sweep; project-financials-wiring (SUP) | לא dashboard |
| 15 | progress→reports | **VERIFIED MISSING CONNECTION** | pre0021; UI-MOB-001 PRIOR | אין reconcile מנוע דוח |

**מסקנה (עברית):** **0/15** browser E2E. **7/15 STRONG**, **5/15 LINKED PARTIAL** (כולל 1/4/5/9/14), **3/15 VERIFIED MISSING CONNECTION** (6/11/15). גל `business-flow-chains` סגר חלקית את פערי 1/4/5; **WF-002 EXEC** מחליף static בזרימה 9 — הפער העסקי נשאר, הראיה executable.

### 26.6 רשימות מרוכזות

**תקלות אמיתיות (CONFIRMED BUG):** OPS-B-002, OPS-B-003, UI-MOB-001.

**פערים עסקיים/לוגיים (CONFIRMED LOGIC GAP — עדיפות גבוהה):** WF-002, WF-003 (reopen), FIN-002/004/005, SEC-001/002, PM-001, CRM-001/002, DOC-002, month-close coupling with retro policy.

**מכוון — לא תיקון:** WF-001, FIN2-001/007, FIN2-005, subcontractor visibility, expense/AP warn-only, טקסט "עובדים".

**תשתית בדיקות:** session-security, founding, dg-foundation fixture/events, versioning URL, RPT-002, OPS-005.

---

## §27 — תוכנית תיקונים (לא לביצוע — לאישור Owner)

| # | עדיפות | בעיה | התנהגות נכונה | שינוי נדרש | מודולים | שימור נתונים | מבחן הוכחה | מיגרציה | סיכון |
|---|--------|------|---------------|------------|---------|--------------|------------|---------|-------|
| 1 | **P0** | OPS-B-002: close month נכשל על `displacement_coupling` | סגירת חודש מצליחה כש-EMC `applied`; retro actual **נשאר** | לפני `closed`: set `recognition_source=monthly_allocated` או block+message; **לא** למחוק retro | month-close, workforce EMC | כל actual/estimate/history | `closed-period-source-corrections` 5/5 + month-close suite | **כן** אם CHECK/policy | ש breakage retro אם ננעל מוקדם |
| 2 | **P0** | OPS-B-003: 5 tables ללא FORCE RLS | כל טבלת tenant עומדת ב-gate | additive `ALTER … FORCE ROW LEVEL SECURITY` (5 tables) | drizzle migrations | ללא data mutation | `migrations.test.ts` green | **כן** — Owner SQL approve | נמוך ל-sequences; attendance/quotes עם grants |
| 3 | **P1** | UI-MOB-001 reports overflow | ללא scroll אופקי @320 | CSS/layout reports shell | reports UI | — | regression overflow @320 | לא | regression desktop |
| 4 | **P1** | WF-002 overwrite voids approved | תיקון נוכחות לא מבטל approved; מסלול correction | guard ב-`attendance-project-sync` או correction-only path | workforce | history voids קיימים | **חדש** int: approve→overwrite→still approved/correction | לא | UX attendance |
| 5 | **P1** | FIN-005 gross→SUMIT net | lines net ל-statutory | subtotal on lines / assert bridge | billing, invoicing | invoices issued | unit gross→net assert + mock payload | לא | SUMIT reject |
| 6 | **P1** | FIN-002/004 void/credit vs SUMIT | void פנימי מתואם cancel/credit | wire `void-billing-record` + adjustment hook | billing, sumit adapter | statutory refs | mock integration cancel chain | לא | double statutory |
| 7 | **P2** | SEC-001/002 RLS vs permissions | SELECT דורש `audit.read` / `contracts.read` | migration policies כ-0073 | drizzle RLS | — | int under-privileged SELECT | **כן** | break raw SQL tools |
| 8 | **P2** | PM-001 template apply | BOQ/forms/navigation מ-template | implement apply readers | projects, templates | metadata קיים | integration 10/10 apply | לא | partial apply |
| 9 | **P2** | CRM-001/002 convert edges | opp won + accepted version only | require CRM_MANAGE / reject draft bridge | CRM, quotes | — | convert-flow edge tests | לא | stuck opps |
| 10 | **P3** | FIN-003 MISSING UI | credit/cancel actions | server actions + UI | billing settings | — | manual QA / component test | לא | |
| 11 | **P3** | DOC-002 owner task evidence | parity contractor gallery | UI on owner task page | tasks, evidence | — | integration upload list | לא | |
| 12 | **EXT** | SEC-010 Production migrations | journal = applied | Owner verify DB | ops | — | check applied list | **Owner only** | drift |

**SQL / MIGRATION PREPARED = NO** — §27 תיאור בלבד; קבצי migration **לא** נוצרו בגל זה.

---

---

## §29 — EXECUTABLE PROOF PHASE (2026-10-09, **COMPLETE**)

**מנדט Owner:** כל ממצא שניתן להוכיח מקומית — **EXEC** (לא STATIC בלבד). **ללא** Playwright / 612 מלא / תיקוני מוצר.

### תשתית הוכחה חדשה (audit-only tests)

| Suite | קבצים | תוצאה (הרצה מקומית 2026-10-09) |
|-------|------:|--------------------------------|
| `tests/integration/audit-verification/` | **9** | **16/16 PASS** |
| `tests/unit/audit-verification/` | **4** | **18/18 PASS** |
| **סה״כ audit-verification** | **13** | **34/34 PASS** — [`_executable-proof-audit-verification-run-2026-10-09.log`](./_executable-proof-audit-verification-run-2026-10-09.log) |

**integration (9):** WF-002, WF-006, WF-007, OPS-B-002, SEC-001/002/003/006 (`rls-permission-gaps`), SEC-004, FIN-002, CRM-001/002, `business-flow-chains` (זרימות 1/4/5).

**unit (4):** WF-004, FIN-005 (3), FIN-003/004 mock (2), `finance-crm-pm-executable-proof-2026-10-09` (12).

### סיווג מעודכן (דוגמאות EXEC)

| ID | Classification | ראיה |
|----|----------------|------|
| WF-002 | **VERIFIED BUSINESS LOGIC GAP** | integration overwrite → void approved |
| WF-004/006/007 | **VERIFIED BUSINESS LOGIC GAP** | unit + integration; WF-007 **container drift** |
| OPS-B-002 | **VERIFIED BUG** | displacement_coupling repro |
| SEC-001/002/003/006 | **VERIFIED BUSINESS LOGIC GAP** | `rls-permission-gaps` raw SELECT / RBAC drift |
| SEC-004 | **VERIFIED BUSINESS LOGIC GAP** + EXT browser | `sec-004-execution-nav-gate` 2/2 |
| CRM-001/002 | **VERIFIED BUSINESS LOGIC GAP** | `crm-001-002-convert-edges` 2/2 |
| FIN-002/004/005 | **VERIFIED BUSINESS LOGIC GAP** | int void decouple + unit gross→SUMIT + mock credit |
| FIN-003 | **VERIFIED MISSING FEATURE** | unit actions scope + mock cancel surface |

**רשם מלא (84 שורות):** [`_verification-84-findings-final-disposition-2026-10-09.md`](./_verification-84-findings-final-disposition-2026-10-09.md) · ledger: [`_findings-executable-proof-ledger-2026-10-09.md`](./_findings-executable-proof-ledger-2026-10-09.md) — DOC/RPT/OPS/UI/PM ([DOC/RPT/OPS index](c727e0e1-a0ec-4f08-a895-ff5191f77194): unit **134/134**, integration **46/46**, UI **2/2**).

### סגירת EXEC מקומי

כל ID שניתן להוכיח ב-Vitest/PGlite **סווג** ב-annex 84 — **0 OPEN** מסוג "ניתן לבדיקה מקומית". נותרו רק **EXTERNAL-ONLY** (SEC-010 Production journal; SUMIT/OAuth חי; SEC-004 deep URL browser; UI-MOB-001 Playwright re-run).

**FINAL COMPLETE (Owner gate — executable proof):** **מסופק** — annex **84/84** disposition + ledger; **0** locally testable OPEN; **FINAL VERDICT מוצר** נשאר **NOT READY** (§26–§27, 3 BUG, chain/browser gaps).

---

## §30 — נספחים וצריכת תשתית (2026-10-09)

| נספח | תוכן |
|------|------|
| [`_verification-84-findings-final-disposition-2026-10-09.md`](./_verification-84-findings-final-disposition-2026-10-09.md) | הכרעה סופית **84/84** (81 register + OPS-B-002/003 + UI-MOB-001) — taxonomy Owner |
| [`_vercel-supabase-consumption-audit-2026-10-09.md`](./_vercel-supabase-consumption-audit-2026-10-09.md) | Vercel Hobby crons + ops-worker fan-out ↔ Postgres egress — CONFIRMED vs SPECULATIVE |

*End of final complete verification report — 2026-10-09 (executable proof wave **COMPLETE**).*


