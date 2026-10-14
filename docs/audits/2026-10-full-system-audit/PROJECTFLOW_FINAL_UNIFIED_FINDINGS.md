# ProjectFlow — דוח מרכזי מאוחד: הבנה, אימות והכרעות

| שדה | ערך |
|-----|-----|
| **מזהה** | `PROJECTFLOW_FINAL_UNIFIED_FINDINGS` |
| **מטרה** | הבנה מלאה של מצב המערכת **לפני** כל תיקון, תוכנית ביצוע או שינוי SQL |
| **Baseline קוד** | `35e2ff0f7f12d0a3ec94ea0aed23b8c97b6bb00e` (`main`) |
| **תאריך אימות** | 2026-10-11 (+ 4 גלי אימות סוכנים) |
| **שיטה** | סynthesis מ־16 דוחות סוכנים + PHASE1/4/6 + 4 גלי אימות סוכנים (נספח ג׳); Vitest (ללא שינוי קוד מוצר); **ללא** Playwright מלא, **ללא** Production DB/SQL |
| **מקורות** | `PROJECTFLOW_FULL_SYSTEM_AUDIT_2026-10.md`, `subagents/AGENT_*.md`, `resolution/*`, `E2E_VERIFICATION_LEDGER.json`, `.cursor/plans/*` (כחומר בלבד) |
| **הערה** | תוכנית `audit_findings_resolution_e2e_verification.plan.md` **לא** אושרה לביצוע — נבדקה כמקור בלבד |

---

## חלק א׳ — תמונת מצב כללית

### האם המערכת «עובדת»?

**ProjectFlow היא מוצר גדול, קohérent וממומש ברוב שרשראות הליבה של קבלן/ארגון יחיד** (CRM → הצעה → פרויקט → עבודה → עלויות → חשבוניות → רווחיות), עם עומק סכימה (~360 טבלאות), 408 מסלולי UI, ומאות בדיקות יחידה/אינטגרציה PGlite.

**אין הוכחה ל«מוכנות מלאה לייצור»** עבור:

- **Mode B — פרויקטים מקושרים (0179)** אחרי החלת מיגרציה (אי־התאמה קוד↔SQL).
- **אמת Production** — האם `schema_migrations` תואם ל־HEAD (0173, 0174, 0179 ועוד PREPARED ONLY).
- **שרשראות דפדפן מלאות** — `playwright:regression` לא הורץ בגל האימות הזה.
- **SUMIT חי** — Milestone B / ארגון בדיקות לא אומת.

**מסקנה תמציתית:** המערכת **עובדת וניתנת להפעלה מוגבלת** לתרחישי «ארגון אחד + פורטל קבלן אורח (Mode A)» עם מגבלות ידועות בפיננסים, UI יזם/מכרז, ואוטומציה תלוית סביבה. **לא מאומת** כמוצר יזם↔קבלן רשום end-to-end.

### שרשראות שאומתו (ראיות)

| שרשרת | ראיה | סטטוס |
|--------|------|--------|
| CRM → הצעה → המרה לפרויקט | `opportunity-quote-conversion-flow` 4/4; `business-flow-chains` Flow 1 | **עובד** (אינטגרציה) |
| שעות → אישור → עלות שכר בפרויקט | Flow 5; `approve-time-sum-project-labor-cost`; EMC 6/6 | **עובד** |
| תיקון רטרו עלות מעסיק → Actual | `employee-actual-employer-cost` 6/6 | **PASS** (יחיד בלדger E2E) |
| תביעות DG → certify (ללא AP bill) | `dg-claims/claims` ב-batch Phase 4 | **עובד** (התראת projection ללא DATABASE_URL) |
| RFI / תוכניות / OAuth bind | batch Phase 4 77/79 | **עובד** (אינטגרציה) |
| רווחיות — מנוע compose | 777+ unit profitability/financials (AGENT_11) | **עובד** (יחידה; לא כל המסכים) |
| פורטל קבלן — רoutes | unit parity 68+ | **עובד** (סטטי) |

### שרשראות שלא אומתו / נשברות

| שרשרת | מגבלה |
|--------|--------|
| לקוח → תשלום → SUMIT חי → רווחיות UI | E2E + SUMIT Production **NOT VERIFIED** |
| יזם → קוד → קבלן רשום → mapping → תזרים | **FAIL** — K05 + אין אינטegration; 0179 PREPARED |
| מכרז יזם UI → award → הסכם | **MISSING IMPLEMENTATION** — D04-001 (backend בלי `src/app`) |
| יועץ על roster עבודה בלבד → RFI | **PRODUCT GAP** — R06-001 (שני מנגנונים; לא bug אוטומטי) |
| קבלן multi-developer בידוד | **2 כשלים** אינטגרציה — lifecycle locale + session-security |
| Playwright 15 תרחישי ledger | רוב **PARTIAL**; רק SCENARIO_10 **PASS** |

### מה «שבור» (מוכח בקוד/בדיקה)

1. **K05-001/002/011** — לאחר **החלת 0179**: mapping SQL שגוי (`vendor_id`, סטטוסים); **K05-004** — CTA פורטל → `(app)`/`withOrgContext` ללא OrgContext.
2. **B10-001** — שורת חיוב ברירת מחדל **ברוטו** → SUMIT **net** (+8,730 ₪ FIN-005 exclusive VAT).
3. **B10-003** — recovery ללא `externalId` (תלוי B10-002).
4. **V09-002 (14k)** — 10k/10k/6k → **14,000 Actual** (Vitest compose); **V09-003/004/005/006** — כפילות/פיצול/פאנל/תזרים.
5. **F11-001–004** — רק ב-`include_general`: consumers על `estimatedFinalCost` vs compose מלא.
6. **C02-014** — CRM RLS membership-wide (לעומת `crm.read`/`crm.manage` באפל).
7. **D04-004** — סטטוס tender `evaluating` לא מופעל במעברים.
8. **W08-007** — `approveTimesheet` ללא `time.approve` → `NotFoundError` במקום AuthZ.
9. **O14-006** — `retryClaimCashProjectionOutbox` לא awaited.
10. **U15-001** — (עם K05-004) חוויית connect שבורה מפורטל אורח.

### מה «תקין בכוונה»

- **V09-001 / FIN2-001** — חפיפה expense/AP **warn-only** (מדיניות; בדיקות מצפות ללא throw).
- **FIN2-010** — קבלת PO **אינה** יוצרת הוצאה Actual.
- **W08-008 / WF-001** — מניעת כפילות שכר דרך `internal_employee_payroll` + שלמות; סיכון נותר מסיווג שגוי ידני.
- **הפרדת נוכחות ↔ שעות פרויקט ↔ אישור מנהל** — מיושמת; WF-006 מצביע על ברירת מחדל «אישור אוטומטי בנוכחות» — **OWNER DECISION** (מדיניות).
- **K05-003** — Mode B דורש **גם** grant פורטל ל-embed יזם — **INTENTIONAL DESIGN** (חוסר playbook).
- **O14** — אין cron נפרד ל-DG events; outbox cross-org **daily** — ארכיטקטורה מודעת, סיכון SLA.

### מה חסר (לא «שבור»)

- UI מכרזים (D04-001), B10-002, F11-005, R06-006 submittals-without-agreement UX, K05-006 integration, wave2 sync (H16-007), Playwright (H16-009).

---

## חלק ב׳ — רישום ממצאים מאומת (טבלאות לפי תחום)

**מקרא סיווג סופי:**  
`CONFIRMED BUG` · `INTENTIONAL DESIGN` · `FALSE POSITIVE` · `TEST OR DOCUMENTATION ISSUE` · `MISSING IMPLEMENTATION` · `PRODUCT GAP` · `NOT VERIFIED` · `PRODUCTION UNKNOWN` · `OWNER DECISION REQUIRED` · `PREVIOUSLY DEFERRED`

עמודות: **החלטה מקורית** = סיווג בדוח אוקטובר / financial cross-ref; **סיווג סופי** = לאחר אימות זה.

### LEAD + חוצה-מודולים

| ID | תחום | מה נטען בביקורת | מה התגלה באימות | החלטה מקורית | סיווג סופי | ראיות |
|----|------|-----------------|-----------------|--------------|------------|--------|
| LEAD-001 | פורטל קבלן | כשל lifecycle — locale `/en` vs `/he-IL` | האפליקציה מפנה ל-locale ארגון/ברירת מחדל; הבדיקה קובעת `/en` | MEDIUM bug | **TEST OR DOCUMENTATION ISSUE** (ייתכן **INTENTIONAL DESIGN** locale) | `contractor-access/lifecycle.test.ts`; Phase 4 batch |
| LEAD-002 | session-security | — | external principal קרא 1 שורת `subcontractAgreements` | — | **CONFIRMED BUG** (או **NOT VERIFIED** אם seed test שגוי) | `session-security.test.ts` FAIL Phase 4 |

### A01 — ארכיטקטורה, DB, אבטחה

| ID | מה נטען | אימות | מקור | סיווג סופי | ראיות |
|----|---------|-------|------|------------|--------|
| A01-001 | Production לא תואם HEAD | לא ניתן לקרוא Production | BLOCKER | **PRODUCTION UNKNOWN** | PREPARED ONLY ×25; `db:check-journal` מקומי OK |
| A01-002 | audit_events SELECT חלש | 0174 ב-repo, לא מוכח ב-Prod | HIGH gap | **CONFIRMED BUG** (אם 0174 לא הוחל) / **NOT VERIFIED** Prod | `0001` vs `0174`; `rls-permission-gaps` |
| A01-003 | 0174 מכוסה בטests | spec קיים | INFO | **NOT VERIFIED** (rerun) | test spec |
| A01-004 | backlog PREPARED | מאומת | HIGH | **INTENTIONAL DESIGN** (תהליך Owner) + **PRODUCTION UNKNOWN** | כותרות SQL |
| A01-005 | journal תקין | PASS | INFO | **INTENTIONAL DESIGN** | vitest journal |
| A01-006 | export כפול connected-projects | כפילות ב-index | LOW | **CONFIRMED BUG** (קosmetic/build) | `drizzle/schema/index.ts` |
| A01-007–009, 012–014, 018 | tenancy/RBAC | static OK | INFO | **INTENTIONAL DESIGN** | קוד + tests cited |
| A01-010 | assertPermission vs authorize | שני surfaces | MEDIUM | **INTENTIONAL DESIGN** | employee vs owner |
| A01-011 | getAdminDb sprawl | סיכון תהליך | MEDIUM | **OWNER DECISION REQUIRED** (גovernance) | grep admin paths |
| A01-015 | 0179 RLS | SQL OK; app mismatch | HIGH | **CONFIRMED BUG** (with K05) + **PRODUCTION UNKNOWN** | 0179 + mapping repo |
| A01-016 | 0173 FORCE RLS | PREPARED | MEDIUM | **PRODUCTION UNKNOWN** | migration file |
| A01-017 | PDF share token | path verified | MEDIUM | **NOT VERIFIED** (rate/entropy) | share route code |
| A01-019 | API v1 org pin | static OK | MEDIUM | **INTENTIONAL DESIGN** | API routes |
| A01-020 | project_access default | SEC-006: unset → `selected` | LOW | **INTENTIONAL DESIGN** | `rls-permission-gaps` per [Domains 1–4](9f72fb0a-c8f0-46a3-afa5-b83d8b1f2c76) |

### C02 — CRM

| ID | נטען | סיווג סופי | ראיות |
|----|------|------------|--------|
| C02-001 | שני מנועי quote | **INTENTIONAL DESIGN** | ארכיטקטורה |
| C02-007 | אין Playwright CRM | **NOT VERIFIED** | לא הורץ |
| C02-008 | CRM-001 refuted | **FALSE POSITIVE** (ביחס לביקורת ישנה) | `convert-quote` wins opp |
| C02-009 | CRM-002 resolved | **INTENTIONAL DESIGN** | integration |
| C02-012 | orphan action | **PRODUCT GAP** / dead code | grep UI |
| C02-014 | RLS membership-wide | **CONFIRMED BUG** (app gates; SQL `is_org_member` only) | `0009_wave2_foundations.sql` |

*(שאר C02-002–006, 010–017: ראה `AGENT_02` — INFO/MEDIUM static; רוב **NOT VERIFIED** UI או **INTENTIONAL DESIGN** RLS עם app gate.)*

### P03 — פרויקטים רגילים

| ID | סיווג סופי | הערה |
|----|------------|------|
| P03-001 | **NOT VERIFIED** | closeout לא ב-E2E |
| P03-002 | **INTENTIONAL DESIGN** / UX debt | dual team tab |
| P03-004 | **NOT VERIFIED** | 52 routes ללא browser |
| P03-012 | **INTENTIONAL DESIGN** | compose משותף overview/financials |
| P03-013 | **TEST OR DOCUMENTATION ISSUE** | env היסטורי |

### D04 — יזם / GC

| ID | סיווג סופי | ראיות |
|----|------------|--------|
| D04-001 | **PRODUCT GAP** | tenders backend; אין UI create/invite/award ב-`src/app` |
| D04-002 | **MISSING IMPLEMENTATION** (workflow) | award לא מזין agreement value |
| D04-003 | **INTENTIONAL DESIGN** | BOQ vs claims parallel |
| D04-007 | **NOT VERIFIED** | E2E commercial |

### K05 — קבלנים / מקושרים

| ID | נטען | סיווג סופי | ראיות |
|----|------|------------|--------|
| K05-001 | BLOCKER vendor_id | **CONFIRMED BUG** (post-0179 apply) | `mapping.repository.ts:58`; 0179 SQL |
| K05-002 | status mismatch | **CONFIRMED BUG** | filter vs CHECK; `grant-bridge` |
| K05-003 | grant + code | **INTENTIONAL DESIGN** | `requireConnectedDeveloperSession` |
| K05-004 | CTA connect | **CONFIRMED BUG** | `more/page.tsx` L106 → `/projects/connect-developer` + `withOrgContext` |
| K05-005 | 0179 not applied | **PRODUCTION UNKNOWN** + **PREVIOUSLY DEFERRED** apply | PREPARED header |
| K05-006 | no E2E/integration | **NOT VERIFIED** / **MISSING IMPLEMENTATION** tests | grep tests |
| K05-007 | SCHEMA_REQUEST stale | **TEST OR DOCUMENTATION ISSUE** | docs vs 0179 |
| K05-008–013 | INFO/LOW | **INTENTIONAL DESIGN** / hygiene | outbox scope, idempotency |

### R06 — יועצים / תפקידים

| ID | סיווג סופי | ראיות |
|----|------------|--------|
| R06-001 | **PRODUCT GAP** (+ **OWNER DECISION** אם לסנכרן) | RFI מ-`listProjectTeam`; workforce roster נפרד |
| R06-006 | **INTENTIONAL DESIGN** | submittals model |
| R06-014 | **PRODUCT GAP** | retainer |
| R06-016 | **NOT VERIFIED** | consultant E2E |

### T07 — משימות / Planner

| ID | סיווג סופי | ראיות |
|----|------------|--------|
| T07-001 | **PRODUCT GAP** | אין `/work/list` grid |
| T07-002 | **INTENTIONAL DESIGN** (כיום) | dependencies **לא** enforced — `update-task.ts` |
| T07-005 | **PRODUCTION UNKNOWN** | 0177 indexes PREPARED |
| T07-014 | **INTENTIONAL DESIGN** | Planner+ בקוד |

### W08 — workforce

| ID | סיווג סופי | ראיות |
|----|------------|--------|
| W08-001 / W08-011 | **INTENTIONAL DESIGN** | EMC implemented |
| W08-004 | **MISSING IMPLEMENTATION** | wizard post-payroll |
| W08-007 | **CONFIRMED BUG** | `approveTimesheet` load before permission → NotFound |
| W08-008 | **INTENTIONAL DESIGN** + סיכון תהליך | labor-expense-integrity |
| W08-012 | **TEST OR DOCUMENTATION ISSUE** | draft vs auto-approve expectation |

### V09 — רכש / AP / הוצאות

| ID | נטען | סיווג סופי | ראיות |
|----|------|------------|--------|
| V09-001 | HIGH block no-op | **INTENTIONAL DESIGN** | `expense-ap-overlap.ts` L102–111; FIN2-001 Oct-9 |
| V09-002 | Actual 14k | **OWNER DECISION REQUIRED** + **CONFIRMED BUG** (תת-מקרה) | ראה חלק ד׳; Vitest 14k; unit 10k/6k/10k bill **INTENTIONAL** |
| V09-003 | header+alloc | **CONFIRMED BUG** (data shape) | `expenses.repository`; integrity audit only |
| V09-004 | cost-code vs compose | **CONFIRMED BUG** | `cost-code-attribution.repository` vs `committed-costs` |
| V09-005 | breakdown panel | **CONFIRMED BUG** / doc | inconsistent partial rules |
| V09-006 | cash forecast | **OWNER DECISION REQUIRED** | partial match cash semantics |
| V09-007 | PO overlap | **INTENTIONAL DESIGN** | committed vs actual |
| V09-008–015 | LOW/INFO | **INTENTIONAL DESIGN** / **NOT VERIFIED** E2E | AGENT_09 |

### B10 — חיוב / SUMIT

| ID | סיווג סופי | ראיות |
|----|------------|--------|
| B10-001 | **CONFIRMED BUG** | `create-billing-record` + `fin-005` 3/3 (מ documenting wrong behavior) |
| B10-002 | **MISSING IMPLEMENTATION** | אין list+ExternalReference scan |
| B10-003 | **CONFIRMED BUG** | recovery + null externalId |
| B10-004 | **MISSING IMPLEMENTATION** | manual link UX |
| B10-005 | **OWNER DECISION REQUIRED** | ambiguous taxonomy |
| B10-006–010 | MEDIUM/LOW | process / **INTENTIONAL DESIGN** / deferred phase |
| B10-011 | **FALSE POSITIVE** vs Oct FIN-002–004 | wired in tree |
| B10-012–014 | INFO | coverage / live gate |

### F11 — תקציב / רווחיות

| ID | סיווג סופי | ראיות |
|----|------------|--------|
| F11-001–004 | **CONFIRMED BUG** when `include_general`; **INTENTIONAL DESIGN** if org `direct_only` only | `resolveForecastCostBasis` exists but consumers skip |
| F11-005 | **MISSING IMPLEMENTATION** | redirect `/overhead` |
| F11-006–007, 009–012 | **INTENTIONAL DESIGN** | passive budget panel; discipline proxy |
| F11-008, F11-013 | **TEST OR DOCUMENTATION ISSUE** | JSDoc / SCHEMA_REQUEST |

### M12 — מסמכים / אחסון

| ID | סיווג סופי | הערה |
|----|------------|------|
| M12-* | רוב **INTENTIONAL DESIGN** / **NOT VERIFIED** cross-org copy E2E | `AGENT_12` — evidence-and-plans integration PASS Phase 4 |

### E13 — ביצוע / RFI / איכות

| ID | סיווג סופי | ראיות |
|----|------------|--------|
| E13-001 | **PRODUCTION UNKNOWN** | 0163–0165 PREPARED |
| E13-003 | **INTENTIONAL DESIGN** | field-ops vs DG dual stacks |
| E13-005 | **INTENTIONAL DESIGN** | execution nav GC-only |
| E13-004, 019 | **PRODUCT GAP** / **NOT VERIFIED** | nav vs capabilities; smoke scope |

### O14 — אוטומציות

| ID | סיווג סופי | ראיות |
|----|------------|--------|
| O14-001 | **INTENTIONAL DESIGN** (debounce+kick) | `vercel.json` 3 crons |
| O14-005 | **INTENTIONAL DESIGN** + סיכון | daily outbox; no enqueue kick |
| O14-006 | **CONFIRMED BUG** (ops reliability) | retry `.catch` without await |
| O14-009 | **INTENTIONAL DESIGN** fail-closed | missing CRON_SECRET → 401 |
| O14-012 | **MISSING IMPLEMENTATION** | orphan cleanup not in ops bundle |

### U15 — UI / mobile / i18n

| ID | סיווג סופi | ראיות |
|----|------------|--------|
| U15-001 | **PRODUCT GAP** | connect CTA → `(app)` without handoff |
| U15-002 | **INTENTIONAL DESIGN** / limitation | PWA EN |
| U15-008–011 | **INTENTIONAL DESIGN** | nav parity static |

### נספח ב׳ — רישום מלא לפי מזהה (ללא השמטה)

כל שורה: **סיווג סופי** לאחר אימות זה. פירוט נרטיבי — בדוח הסוכן המקורי.

| ID | סיווג סופי |
|----|------------|
| A01-001 | PRODUCTION UNKNOWN |
| A01-002 | CONFIRMED BUG (if 0174 not applied) |
| A01-003 | NOT VERIFIED |
| A01-004 | OWNER DECISION REQUIRED |
| A01-005 | INTENTIONAL DESIGN |
| A01-006 | CONFIRMED BUG |
| A01-007 | INTENTIONAL DESIGN |
| A01-008 | INTENTIONAL DESIGN |
| A01-009 | INTENTIONAL DESIGN |
| A01-010 | INTENTIONAL DESIGN |
| A01-011 | OWNER DECISION REQUIRED |
| A01-012 | INTENTIONAL DESIGN |
| A01-013 | INTENTIONAL DESIGN |
| A01-014 | INTENTIONAL DESIGN |
| A01-015 | PRODUCTION UNKNOWN (+ K05 schema-code if 0179 applied) |
| A01-016 | PRODUCTION UNKNOWN |
| A01-017 | NOT VERIFIED |
| A01-018 | INTENTIONAL DESIGN |
| A01-019 | INTENTIONAL DESIGN |
| A01-020 | INTENTIONAL DESIGN |
| B10-001 | CONFIRMED BUG |
| B10-002 | MISSING IMPLEMENTATION |
| B10-003 | CONFIRMED BUG |
| B10-004 | MISSING IMPLEMENTATION |
| B10-005 | OWNER DECISION REQUIRED |
| B10-006 | OWNER DECISION REQUIRED |
| B10-007 | TEST OR DOCUMENTATION ISSUE |
| B10-008 | TEST OR DOCUMENTATION ISSUE |
| B10-009 | INTENTIONAL DESIGN |
| B10-010 | PREVIOUSLY DEFERRED |
| B10-011 | FALSE POSITIVE |
| B10-012 | INTENTIONAL DESIGN |
| B10-013 | NOT VERIFIED |
| B10-014 | OWNER DECISION REQUIRED |
| C02-001 | INTENTIONAL DESIGN |
| C02-002 | NOT VERIFIED |
| C02-003 | NOT VERIFIED |
| C02-004 | INTENTIONAL DESIGN |
| C02-005 | NOT VERIFIED |
| C02-006 | PRODUCT GAP |
| C02-007 | NOT VERIFIED |
| C02-008 | FALSE POSITIVE |
| C02-009 | INTENTIONAL DESIGN |
| C02-010 | NOT VERIFIED |
| C02-011 | TEST OR DOCUMENTATION ISSUE |
| C02-012 | PRODUCT GAP |
| C02-013 | INTENTIONAL DESIGN |
| C02-014 | CONFIRMED BUG |
| C02-015 | NOT VERIFIED |
| C02-016 | INFO → INTENTIONAL DESIGN |
| C02-017 | NOT VERIFIED |
| D04-001 | MISSING IMPLEMENTATION |
| D04-002 | MISSING IMPLEMENTATION |
| D04-003 | INTENTIONAL DESIGN |
| D04-004 | CONFIRMED BUG |
| D04-005 | NOT VERIFIED |
| D04-006 | INTENTIONAL DESIGN |
| D04-007 | NOT VERIFIED |
| D04-008 | TEST OR DOCUMENTATION ISSUE |
| D04-009 | INTENTIONAL DESIGN |
| D04-010 | NOT VERIFIED |
| E13-001 | PRODUCTION UNKNOWN |
| E13-002 | PRODUCTION UNKNOWN |
| E13-003 | INTENTIONAL DESIGN |
| E13-004 | PRODUCT GAP |
| E13-005 | INTENTIONAL DESIGN |
| E13-006 | NOT VERIFIED |
| E13-007 | NOT VERIFIED |
| E13-008 | PRODUCT GAP |
| E13-009 | NOT VERIFIED |
| E13-010 | INTENTIONAL DESIGN |
| E13-011 | NOT VERIFIED |
| E13-012 | NOT VERIFIED |
| E13-013 | NOT VERIFIED |
| E13-014 | NOT VERIFIED |
| E13-015 | NOT VERIFIED |
| E13-016 | NOT VERIFIED |
| E13-017 | NOT VERIFIED |
| E13-018 | NOT VERIFIED |
| E13-019 | NOT VERIFIED |
| E13-020 | NOT VERIFIED |
| E13-021 | NOT VERIFIED |
| E13-022 | NOT VERIFIED |
| F11-001 | CONFIRMED BUG (include_general) |
| F11-002 | CONFIRMED BUG (include_general) |
| F11-003 | CONFIRMED BUG (include_general) |
| F11-004 | CONFIRMED BUG (include_general) |
| F11-005 | MISSING IMPLEMENTATION |
| F11-006 | INTENTIONAL DESIGN |
| F11-007 | INTENTIONAL DESIGN |
| F11-008 | TEST OR DOCUMENTATION ISSUE |
| F11-009 | INTENTIONAL DESIGN |
| F11-010 | INTENTIONAL DESIGN |
| F11-011 | INTENTIONAL DESIGN |
| F11-012 | INTENTIONAL DESIGN |
| F11-013 | TEST OR DOCUMENTATION ISSUE |
| H16-001 | TEST OR DOCUMENTATION ISSUE |
| H16-002 | TEST OR DOCUMENTATION ISSUE |
| H16-003 | TEST OR DOCUMENTATION ISSUE |
| H16-004 | STILL_OPEN → NOT VERIFIED |
| H16-005 | PREVIOUSLY DEFERRED |
| H16-006 | PRODUCTION UNKNOWN |
| H16-007 | STILL_OPEN |
| H16-008 | TEST OR DOCUMENTATION ISSUE |
| H16-009 | NOT VERIFIED |
| H16-010 | TEST OR DOCUMENTATION ISSUE |
| H16-011 | TEST OR DOCUMENTATION ISSUE |
| H16-012 | PREVIOUSLY DEFERRED |
| H16-013 | STILL_OPEN |
| H16-014 | STILL_OPEN |
| H16-015 | STILL_OPEN |
| K05-001 | CONFIRMED BUG |
| K05-002 | CONFIRMED BUG |
| K05-003 | INTENTIONAL DESIGN |
| K05-004 | CONFIRMED BUG |
| K05-005 | PRODUCTION UNKNOWN |
| K05-006 | NOT VERIFIED |
| K05-007 | TEST OR DOCUMENTATION ISSUE |
| K05-008 | INTENTIONAL DESIGN |
| K05-009 | MISSING IMPLEMENTATION |
| K05-010 | INTENTIONAL DESIGN |
| K05-011 | CONFIRMED BUG (with K05-002) |
| K05-012 | INTENTIONAL DESIGN |
| K05-013 | NOT VERIFIED |
| LEAD-001 | TEST OR DOCUMENTATION ISSUE |
| LEAD-002 | CONFIRMED BUG |
| M12-001 | NOT VERIFIED |
| M12-002 | INTENTIONAL DESIGN |
| M12-003 | NOT VERIFIED |
| M12-004 | INTENTIONAL DESIGN |
| M12-005 | NOT VERIFIED |
| M12-006 | NOT VERIFIED |
| M12-007 | NOT VERIFIED |
| M12-008 | NOT VERIFIED |
| M12-009 | NOT VERIFIED |
| M12-010 | NOT VERIFIED |
| O14-001 | INTENTIONAL DESIGN |
| O14-002 | NOT VERIFIED |
| O14-003 | INTENTIONAL DESIGN |
| O14-004 | NOT VERIFIED |
| O14-005 | INTENTIONAL DESIGN |
| O14-006 | CONFIRMED BUG |
| O14-007 | NOT VERIFIED |
| O14-008 | NOT VERIFIED |
| O14-009 | INTENTIONAL DESIGN |
| O14-010 | NOT VERIFIED |
| O14-011 | NOT VERIFIED |
| O14-012 | MISSING IMPLEMENTATION |
| O14-013 | NOT VERIFIED |
| O14-014 | NOT VERIFIED |
| O14-015 | NOT VERIFIED |
| O14-016 | NOT VERIFIED |
| O14-017 | NOT VERIFIED |
| O14-018 | NOT VERIFIED |
| O14-019 | NOT VERIFIED |
| O14-020 | NOT VERIFIED |
| O14-021 | NOT VERIFIED |
| O14-022 | NOT VERIFIED |
| O14-023 | NOT VERIFIED |
| P03-001 | NOT VERIFIED |
| P03-002 | INTENTIONAL DESIGN |
| P03-003 | NOT VERIFIED |
| P03-004 | NOT VERIFIED |
| P03-005 | NOT VERIFIED |
| P03-006 | INTENTIONAL DESIGN |
| P03-007 | NOT VERIFIED |
| P03-008 | NOT VERIFIED |
| P03-009 | NOT VERIFIED |
| P03-010 | NOT VERIFIED |
| P03-011 | INTENTIONAL DESIGN |
| P03-012 | INTENTIONAL DESIGN |
| P03-013 | TEST OR DOCUMENTATION ISSUE |
| R06-001 | PRODUCT GAP |
| R06-002 | INTENTIONAL DESIGN |
| R06-003 | NOT VERIFIED |
| R06-004 | NOT VERIFIED |
| R06-005 | INTENTIONAL DESIGN |
| R06-006 | INTENTIONAL DESIGN |
| R06-007 | NOT VERIFIED |
| R06-008 | NOT VERIFIED |
| R06-009 | NOT VERIFIED |
| R06-010 | NOT VERIFIED |
| R06-011 | NOT VERIFIED |
| R06-012 | NOT VERIFIED |
| R06-013 | NOT VERIFIED |
| R06-014 | PRODUCT GAP |
| R06-015 | NOT VERIFIED |
| R06-016 | NOT VERIFIED |
| R06-017 | NOT VERIFIED |
| R06-018 | NOT VERIFIED |
| T07-001 | PRODUCT GAP |
| T07-002 | INTENTIONAL DESIGN |
| T07-003 | NOT VERIFIED |
| T07-004 | NOT VERIFIED |
| T07-005 | PRODUCTION UNKNOWN |
| T07-006 | NOT VERIFIED |
| T07-007 | INTENTIONAL DESIGN |
| T07-008 | NOT VERIFIED |
| T07-009 | NOT VERIFIED |
| T07-010 | NOT VERIFIED |
| T07-011 | NOT VERIFIED |
| T07-012 | NOT VERIFIED |
| T07-013 | NOT VERIFIED |
| T07-014 | FALSE POSITIVE (strength @ HEAD) |
| T07-015 | NOT VERIFIED |
| T07-016 | NOT VERIFIED |
| T07-017 | INTENTIONAL DESIGN |
| T07-018 | NOT VERIFIED |
| U15-001 | PRODUCT GAP |
| U15-002 | INTENTIONAL DESIGN |
| U15-003 | NOT VERIFIED |
| U15-004 | NOT VERIFIED |
| U15-005 | NOT VERIFIED |
| U15-006 | INTENTIONAL DESIGN |
| U15-007 | NOT VERIFIED |
| U15-008 | INTENTIONAL DESIGN |
| U15-009 | INTENTIONAL DESIGN |
| U15-010 | INTENTIONAL DESIGN |
| U15-011 | INTENTIONAL DESIGN |
| V09-001 | INTENTIONAL DESIGN |
| V09-002 | OWNER DECISION REQUIRED + CONFIRMED BUG (14k) |
| V09-003 | CONFIRMED BUG |
| V09-004 | CONFIRMED BUG |
| V09-005 | CONFIRMED BUG |
| V09-006 | CONFIRMED BUG (+ OWNER DECISION partial cash) |
| V09-007 | INTENTIONAL DESIGN |
| V09-008 | INTENTIONAL DESIGN |
| V09-009 | TEST OR DOCUMENTATION ISSUE |
| V09-010 | INTENTIONAL DESIGN |
| V09-011 | OWNER DECISION REQUIRED |
| V09-012 | INTENTIONAL DESIGN |
| V09-013 | INTENTIONAL DESIGN |
| V09-014 | CONFIRMED BUG (minor) |
| V09-015 | NOT VERIFIED |
| W08-001 | FALSE POSITIVE (implemented; was audit gap) |
| W08-002 | NOT VERIFIED |
| W08-003 | NOT VERIFIED |
| W08-004 | MISSING IMPLEMENTATION |
| W08-005 | INTENTIONAL DESIGN |
| W08-006 | NOT VERIFIED |
| W08-007 | CONFIRMED BUG |
| W08-008 | INTENTIONAL DESIGN |
| W08-009 | INTENTIONAL DESIGN |
| W08-010 | NOT VERIFIED |
| W08-011 | TEST OR DOCUMENTATION ISSUE |
| W08-012 | TEST OR DOCUMENTATION ISSUE |
| W08-013 | NOT VERIFIED |
| W08-014 | NOT VERIFIED |
| W08-015 | NOT VERIFIED |

*שורות NOT VERIFIED = לא נבדקו מחדש ב-browser/Production בגל זה; לא סותרות את דוח הסוכן — מסומנות כדי שלא יוצגו כ«תקול מוכח».*

### H16 — תוכניות היסטוריות

| ID | סיווג סופי | ראיות |
|----|------------|--------|
| H16-001 | **TEST OR DOCUMENTATION ISSUE** | 62/106 todos ממומשים — PHASE6 |
| H16-002 | **TEST OR DOCUMENTATION ISSUE** | CURRENT-IMPLEMENTATION-STATUS stale |
| H16-006 | **PRODUCTION UNKNOWN** | 0179 |
| H16-009 | **NOT VERIFIED** | full regression on SHA זה |
| H16-007–008 | **PREVIOUSLY DEFERRED** / open | portal sync; i18n gates |

---

## חלק ג׳ — התנהגויות שנראו «בעייתיות» אך תואמות תכנון

| נושא | למה זה לא bug |
|------|----------------|
| **V09-001 / FIN2-001** | מדיניות מפורשת: חפיפה expense/AP **אזהרה בלבד**; finalize קורא ל-no-op בכוונה. |
| **FIN2-010** | קבלת PO ≠ רישום Actual הוצאה — מניעת כפילות commitment/expense. |
| **T07-002** | תלויות משימות **מידע תכנוני**; סגירה לא חסומה בקוד — לא Planner enforcement. |
| **E13-003 / P03 field-ops** | שני stacks (field-ops vs DG) — פרופיל `developer_gc` מפנה ל-DG execution. |
| **K05-003** | חיבור org↔org **לא** מחליף grants פורטל ל-embed — הפרדת אבטחה. |
| **W08-008** | כפילות שכר נמנעת למפתח `internal_employee_payroll`; הוצאות שכר חופשיות = סיכון תהליך. |
| **O14-001/005** | תורים cross-org **לא real-time** — daily ops + debounced kick by design. |
| **V09-002 (bill ≥ expense)** | בדיקת unit: חשבונית 10k + הוצאה 6k + match 6k → Actual **10k** — **חשבונית כמקור** לסכום מוכר. |
| **Customer portal / calendar** | **PREVIOUSLY DEFERRED** (UI-001/002, PM-012). |

---

## חלק ד׳ — תקלות שאומתו (CONFIRMED BUG)

### K05-001 / K05-002 / K05-011 (Mode B) + K05-004 (פורטל)

**K05-004:** קישור «חבר ארגון» מ-More בפורטל חיצוני ל-`/projects/connect-developer` שדורש `withOrgContext` — **CONFIRMED BUG** ([K05–W08](26dac3d0-43b0-4e4e-96f3-f87ead20efad)).

### K05-001 / K05-002 (Mode B)

- **מה שגוי:** SELECT `m.vendor_id` על טבלה ללא עמודה; סינון `accepted`/`sync_degraded` שלא ב-CHECK 0179.
- **מתי:** **אחרי** החלת `0179_connected_projects.sql` (לפני כן — no-op שקט 42703).
- **השפעה:** mapping null → banner/ embed / תזרim מקושר לא עובדים למרות חיבור תקף.
- **רצוי לפי מודל:** SQL 0179 + lifecycle `pending→provisioning→active`.
- **Production:** **PRODUCTION UNKNOWN** (האם 0179 הוחל).

### B10-001

- **מה:** `lineTotal` = gross → SUMIT `lineNet`.
- **מספרים:** net 48,500; gross 57,230; סטייה **+8,730** (FIN-005).
- **Production:** **NOT VERIFIED** live SUMIT.

### B10-003 (+ תלות B10-002)

- **מה:** refresh דורש `externalId`; ambiguous ללא ID נשאר תקוע.

### V09-002 — תת-מקרה 14,000 ₪

- **תרחיש:** הוצאה 10,000; חשבונית 10,000; התאמה 6,000.
- **תוצאה:** expense remainder 4,000 + vendor 10,000 = **14,000 Actual**.
- **הוכחה:** Vitest compose ephemeral 2026-10-11 (נמחק — לא נשאר ב-repo).
- **פרשנות:** אם שתי הרשומות **אותה עלות כלכלית** — **CONFIRMED BUG**. אם המשתמש **כוון** לרשום הוצאה מוקדמת ואחר כך חשבונית מלאה — **OWNER DECISION** (ראה חלק ח׳).
- **Loader SQL:** **NOT VERIFIED** end-to-end (unit משתמש ב-input ידני ל-billAmounts).

### V09-003, V09-004, V09-005

- כפילות header+allocation; cost-code AP לא תואם compose על split bills; panel breakdown לא תואם dedupe.

### F11-001–004

- **מתי bug:** `projectProfitabilityMode = include_general`.
- **מה:** אזהרות/rollup/drilldown על direct forecast בעוד profit על full basis.
- **דוגמה:** direct forecast 100, full 130, budget 120 — אזהרה על 100, variance על 130.

### O14-006

- outbox retry לא awaited — כשל silent ב-ops worker ([E13–H16](cd082c49-53e3-418c-9045-1c0dfe8944c9) `daily-ops-worker.ts` L198–200).

### C02-014 / D04-004 / W08-007

- **C02-014:** מדיניות CRM ב-SQL = כל חבר org; האפל דורש `crm.read`/`crm.manage`.
- **D04-004:** enum `evaluating` קיים; מעברים ב-`tenders.ts` לא מגיעים אליו.
- **W08-007:** RLS hide-first לפני בדיקת הרשאה ב-approve timesheet.

### LEAD-002 (אם לא artifact test)

- דליפת `subcontractAgreements` ל-principal חיצוני — **CONFIRMED BUG** pending reproduce root cause (RLS vs seed).

---

## חלק ה׳ — פיתוחים חסרים / לא הושלמו

| סוג | פריטים |
|-----|--------|
| **חיוני לשרשרת** | K05 fix + integration 0179; UI מכרז D04-001; E2E Mode B |
| **תוכנן, לא הושלם** | B10-002 recovery scan; F11-005 overhead hub; wave2 sync portal (H16) |
| **נדחה בכוונה** | Customer portal; calendar sync; 0179 Production apply; SUMIT Milestone B live |
| **לא אושר** | dependency enforcement; hard-block V09 overlap |
| **שיפור UX** | T07-001 list grid; R06 sync (אם Owner יבחר) |

**PHASE6 (106 todos):** **62** ממומשים (YAML stale), **12** OWNER_DEFER, **32** STILL_OPEN — **לא** להפוך אוטומטית ל-32 משימות פיתוח.

---

## חלק ו׳ — שרשראות עסקיות (SCENARIO_01–15)

מקור: `E2E_VERIFICATION_LEDGER.json` + `PHASE4_e2e_test_matrix.md`.

| ID | עובד | לא עובד / חסר | לא נבדק | ראיות |
|----|------|---------------|---------|--------|
| 01 | CRM+chains חלקי | תשלום+SUMIT+UI | Playwright | integration PASS batch |
| 02 | workforce→labor | unallocated gap proof | browser | Flow 5 PASS |
| 03 | expenses batch | PO receive; overlap E2E | V09 loader int | expenses PASS |
| 04 | claims certify | projection admin DB | DG UI | claims PASS+warn |
| 05 | unit connected | mapping SQL | **כל** E2E | **FAIL** K05 |
| 06 | evidence-and-plans | consultant persona | browser | 7 tests PASS |
| 07 | tasks UX int | board/calendar E2E | views | 3 tests PASS |
| 08 | RFI 6 tests | doc link assert | — | PASS batch |
| 09 | unit CCV/CO | CO→billing chain | int | unit only |
| 10 | EMC retro | — | — | **PASS** |
| 11 | — | lifecycle+security | multi-dev UI | **2 FAIL** |
| 12 | unit idempotency | retry integration | — | partial |
| 13 | OAuth+sharing int | copy E2E | cloud sync | PASS batch |
| 14 | AP partial pay | po-receiving | FIN2-010 E2E | partial batch |
| 15 | claims+unit | projection table | connected claim | partial |

---

## חלק ז׳ — סתירות בין דוחות

| נושא | נטען בעבר | נטען עכשיו | הוכח? |
|------|-----------|------------|--------|
| **0179 ב-Production** | «הוחל» (claims ישנים) vs PREPARED ONLY | **PRODUCTION UNKNOWN** | לא — אין read-only SQL |
| **V09-001** | HIGH bug | **INTENTIONAL DESIGN** | כן — FIN2-001 Oct-9 + code comment |
| **V09-002** | תמיד bug | bug **רק** בגאומטריה 14k; bill-authority **by test** | חלקי — compose כן; loader לא |
| **FIN-002–004** | gaps Oct-9 | **wired** B10-011 | static; live SUMIT לא |
| **CRM-001** | bug | **FALSE POSITIVE** C02-008 | convert wins opp |
| **SEC-006 vs A01-020** | Oct-9 «all» vs A01 SEC-006 test | **A01-020 = `selected` when unset** @ HEAD | **יישוב:** [Domains 1–4](9f72fb0a-c8f0-46a3-afa5-b83d8b1f2c76) — Oct-9 SEC-006 may differ scenario |
| **contractor lifecycle** | product bug | **TEST OR DOCUMENTATION ISSUE** locale | he-IL path |
| **PROVEN_BUG financial** | wave2 מיידי | רק אחרי **OWNER DECISION** על V09-002/F11/WF | מסמך זה |

---

## חלק ח׳ — שאלות להחלטת הבעלים

| # | נושא | מה המערכת עושה | למה התלבטות | אפשרויות | השפעה | החלטה קודמת? |
|---|------|----------------|-------------|----------|--------|--------------|
| 1 | **V09-002 — מקור אמת Actual** | bill מלא + expense מקוזז לפי match; SQL period «bill authoritative» vs compose partial | גאומטריות A/B/C/D ([V09–M12](9f6da5ea-e81b-4b30-a28e-0a7a0384219f)) | cap bill / full match / warn-only | margin/project trust | FIN2-001 warn-only |
| 2 | **V09-001 — hard block?** | warn-only | כפילות אם מתעלמים | block vs warn | compliance vs friction | **FIN2-001 INTENTIONAL** — לא לחסום בלי ביטול |
| 3 | **F11 — dual forecast** | direct vs full לפי mode | UI mixed basis | unify all surfaces vs label «direct» explicitly | dashboards/warnings | mode `include_general` קיים |
| 4 | **R06-001 — dual roster** | workforce vs project_members | יועץ על roster עבודה בלבד | sync חד-כיווני / UI «הוסף ל-RFI» / השאר | consultant ops | **לא** נמצאה החלטה «לאחד» |
| 5 | **T07-002 — dependencies** | לא חוסם סגירה | Planner parity | enforce vs informational | PM discipline | **לא** אוכף — product choice |
| 6 | **WF-006 — auto-approve time** | נוכחות מאשרת שעות | vs «שעות נפרדות» | draft default vs org setting | labor Actual timing | **OWNER DECISION** |
| 7 | **0179 apply** | SQL PREPARED | code ahead | apply after K05 fix vs delay Mode B | Production risk | **OWNER_DEFER** apply |
| 8 | **K05-003 grants** | code + grant | ops burden | auto-grant vs playbook | onboarding | design B — document |
| 9 | **B10-002 recovery** | missing | stuck ambiguous | build scan vs manual ops | billing continuity | plan phase 0 |
| 10 | **Mode B sync breadth** | cash projection only | plan W2 | full sync vs narrow | scope/cost | portal plan STILL_OPEN |

---

## חלק ט׳ — מסקנה סופית

### מצב ProjectFlow (אמיתי, מבוסס ראיות)

1. **עובד (מוכח):** ליבת multi-tenant, CRM→פרויקט, workforce→עלות עבודה, DG claims, tasks, RFI, documents publish, מנוע financials compose, פורטל Mode A (unit), רוב unit/integration PGlite על SHA זה.
2. **לא עובד / יישבר (מוכח):** Mode B **אחרי 0179** ללא תיקון K05; SUMIT line net (B10-001); Actual 14k (V09-002 geometry); F11 inconsistency ב-`include_general`; contractor session-security (אם מאומת).
3. **חסר:** UI מכרזים, overhead hub, SUMIT recovery scan, sync רחב connected, guest→org conversion, Playwright regression ledger.
4. **לא מאומת:** Production schema, SUMIT live, רוב UI personas, SCENARIO_01/03/05 E2E מלא.
5. **מחייב Owner:** V09-002 policy, R06 roster, WF-006 defaults, T07 enforcement, 0179 apply timing, FIN2-001 נשאר warn-only.

### מה **לא** לעשות לפני קריאת דוח זה והכרעות

- לא לפתוח «גל תיקונים» אוטומטי על כל PROVEN_BUG מהצלבה הפיננסית.
- לא להחיל SQL Production.
- לא לאחד roster/consolidate stacks בלי החלטה בטבלה ח׳.

---

## נספח — בדיקות שבוצעו באימות זה (מלבד דוחות קודמים)

| בדיקה | תוצאה |
|--------|--------|
| `expense-ap-overlap.test.ts` | 4/4 |
| `expense-ap-dedup.test.ts` | 6/6 |
| `fin-005-gross-line-sumit-mapping.test.ts` | 3/3 |
| compose 10k/10k/6k → 14k (ephemeral, נמחק) | 1/1 |
| Phase 4 PGlite batch (קודם) | 77/79 |

---

## הפניות

- דוח ביקורת: [`PROJECTFLOW_FULL_SYSTEM_AUDIT_2026-10.md`](PROJECTFLOW_FULL_SYSTEM_AUDIT_2026-10.md)
- הצלבה פיננסית: [`resolution/PHASE1_financial_crossref.md`](resolution/PHASE1_financial_crossref.md)
- הצלבה תחומית: [`resolution/PHASE1_domain_crossref.md`](resolution/PHASE1_domain_crossref.md)
- E2E: [`E2E_VERIFICATION_LEDGER.json`](E2E_VERIFICATION_LEDGER.json), [`resolution/PHASE4_e2e_test_matrix.md`](resolution/PHASE4_e2e_test_matrix.md)
- תוכניות היסטוריות: [`resolution/PHASE6_historical_closure.md`](resolution/PHASE6_historical_closure.md)

### נספח ג׳ — גל אימות סוכנים (2026-10-11, ללא קבצים נוספים)

| גל | כיסוי | ממצא מרכזי |
|----|--------|------------|
| [Domains 1–4](9f72fb0a-c8f0-46a3-afa5-b83d8b1f2c76) | A01, C02, P03, D04 (60) | D04-001 MISSING; D04-004 bug; C02-014 RLS |
| [K05–W08](26dac3d0-43b0-4e4e-96f3-f87ead20efad) | K05, R06, T07, W08 (63) | **5 bugs:** K05-001/002/004/011, W08-007 |
| [V09–M12](9f6da5ea-e81b-4b30-a28e-0a7a0384219f) | V09, B10, F11, M12 | V09-002 geometry; F11 mode-conditional |
| [E13–H16](cd082c49-53e3-418c-9045-1c0dfe8944c9) | E13, O14, U15, H16 | H16 **106** todos = 62/12/32; O14 static @ HEAD |

**רשימת CONFIRMED BUG ממוזגת (P0/P1 לדיון Owner, לא לתיקון אוטומטי):**  
K05-001, K05-002, K05-004, K05-011, B10-001, B10-003, V09-002 (14k), V09-003, V09-004, V09-005, V09-006, F11-001–004 (if `include_general`), C02-014, D04-004, W08-007, O14-006, LEAD-002, A01-002 (if 0174 not applied), A01-006.

*מסמך זה הוא **הדוח המרכזי היחיד** לגל «הבנה והכרעה» — אין להסתמך על תוכנית הביצוע הקיימת כהוראה עד אישור Owner.*
