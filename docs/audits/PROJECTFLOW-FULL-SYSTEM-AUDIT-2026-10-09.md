# ProjectFlow — Full Independent System Audit

| Field | Value |
|--------|--------|
| **Audit date** | 2026-10-09 |
| **Inspected commit** | `89e0b9a90c43cffbec24e726675bf8448587833e` |
| **Commit message** | `revert(build): webpack memory opt did not fix Vercel stall` |
| **Method** | Fresh code discovery, PGlite integration tests, targeted unit tests, static UI/route inventory. **No** reliance on prior audit conclusions as primary evidence. |
| **Production live UI** | **Not exercised** in this audit (no authenticated production browser session). |
| **Production DB** | **No** broad scans; no mutating tests. |
| **Custom domain** | Out of scope (not a launch blocker per Owner decision). |

---

## Executive summary (עברית פשוטה)

**מה נבדק:** מאגר הקוד הנוכחי ב-commit למעלה, 387 דפי UI, 27 נתיבי API, שכבות הרשאות/RLS, מנוע כספי, CRM→חשבונית→SUMIT, כוח אדם, שדה, מסמכים, דוחות ו-workers — עם 7 סוכני משנה במקביל + בדיקות אינטגרציה מקומיות (PGlite).

**מספרי ממצאים (רישום מלא, ללא סינון):**

| חומרה | כמות (מזהים ייחודיים) |
|--------|------------------------|
| **CRITICAL** | 1 |
| **HIGH** | 14 |
| **MEDIUM** | 38 |
| **LOW** | 18 |
| **TRIVIAL / INFO** | 10 |
| **סה״כ** | **81** |

**סטטוס יכולות (סיכום גס):**

| סטטוס | משמעות | הערכה |
|--------|---------|--------|
| VERIFIED WORKING | הוכחה בקוד + בדיקות אינטגרציה/יחידה משמעותיות | ~35 תת-זרימות |
| PARTIAL | קיים אך חסר חיבור, דגל, או UX/אבטחה חלקית | ~45 אזורים |
| NOT IMPLEMENTED | 404 / stub / backend בלי UI | פורטל ציבורי, SUMIT credit/cancel ב-UI, ועוד |
| NOT VERIFIED | קוד נראה שלם; **לא** נבדק runtime/E2E | **רוב 387 הדפים** |
| VERIFIED BROKEN | התנהגות שגויה מוכחת בקוד/בדיקה | מספר ממצאים HIGH/CRITICAL (ראו רישום) |

**השפעה עסקית:** יש **סיכון כספי אמיתי** (כפל עלות עבודה + חשבוניות SUMIT שלא מסונכרנות עם ביטול/זיכוי פנימי + שורות מע״מ בחשבונית). יש **פערי אבטחה ב-RLS** על חוזים ו-audit_events לעומת שכבת האפליקציה. רוב המוצר **לא** עבר אימות UI מלא — build/unit/integration ירוקים **אינם** מוכיחים שכל כפתור עובד.

**ביטחון בפסק הדין:** **בינוני-נמוך** לגבי “הכל עובד יחד בפרודקשן”; **גבוה** לגבי ארכיטקטורת מנוע כספי/הפרדת commitment↔actual כשהנתונים מסווגים נכון.

**פסק מוכנות:** **לא מוכן** להכרזה “מערכת שלמה ומאומתת end-to-end” ללא: (1) תיקון CRITICAL/HIGH כספיים ו-SUMIT, (2) אימות E2E/ידני על זרימות Owner, (3) אישור שה-migrations (0073, 0154, 0168…) **הוחלו** בפרודקשן. המערכת **כן** מציגה רוחב יכולות גדול ומנוע כספי מרוכז — אך **פערי תפעול, הרשאות DB, ואימות UI** נשארים.

---

## 1. Agent execution ledger

| Agent | Scope | Status | Output verified |
|-------|--------|--------|-----------------|
| [Routes UI inventory](aeb8212e-1108-487e-8a4c-790991e1f565) | Domain 1 — routes, nav, shell | **Complete** | 387 pages, UI-001…005 |
| [CRM commercial SUMIT](9c12af82-6ddd-4550-ab9f-e2e3a9f9709c) | Domains 2, 12, Flow E | **Complete** | CRM/FIN-001…005 |
| [Workforce labor](0d56169c-bb42-42bb-b369-85602dac7b9d) | Domains 5, 6, Flows A, B | **Complete** | WF-001…010 |
| [Financial core VAT](e61b92d0-dbc1-4ac2-8ea2-630e8f4a68d7) | Domains 7, 11, F, K | **Complete** | FIN2-001…010 |
| [Auth RLS permissions](86f051bf-1464-4c07-b0ee-14e05cfabcd1) | Domains 8, H, 14 | **Complete** | SEC-001…010 |
| [Docs field tasks](3d1d8588-5f12-43e8-b215-3e2eb41d02ba) | Domains 3, 4, 9, 10, C, D | **Complete** | PM-001…015, DOC-001…012 |
| [Reports cron integration](bae96ba3-12ed-4c5f-8cc8-1a42fd05d764) | Domains 13, 14, I, J | **Complete** | RPT-001…006, OPS-001…005, I/J matrix |
| **Lead integrator** | Test execution, dedup, report | **Complete** | Integration 23/23, unit batches green |

**Post-integration (2026-10-09):** All seven domain agents returned **success**; findings deduplicated into **Annex A** (81 IDs). No conflicting severities required rollback. **FIN2-007** and **WF-001** are the same labor double-count invariant (kept both IDs with cross-ref).

**Coverage gaps (all agents):** No full Playwright regression (32 specs) executed this session; no production SUMIT HTTP; no mobile device lab; no load test.

---

## 2. Evidence executed by lead (this session)

| Evidence | Result | Confidence |
|----------|--------|------------|
| `npm run test:unit` — 6 cross-domain files | **35/35 pass** | High |
| `npm run test:integration` — workforce, CRM, billing, dg-field | **23/23 pass** (PGlite + RLS) | High |
| `expense-ap-overlap.test.ts`, `sumit-credit-cancel-and-payment-plan.test.ts` | **14/14 pass** | High |
| Static read: `labor-expense-integrity.ts`, `create-billing-record.ts`, `portal/page.tsx` | Confirms WF-001, FIN-005, UI-001 | High |

---

## 3. Application inventory (Domain 1)

**Topology @ 89e0b9a:** 387 `page.tsx` (246 owner `(app)`, 92 employee, 35 contractor, 14 auth) + **27** API `route.ts`. Shell: `AppShell`, `Sidebar`, `MobileNav`, `QuickCreateDeferred`, settings shell, employee shell. i18n: `he-IL`, `en`, `ar`, `ru` with RTL on sidebar.

**Default status for owner app pages:** **NOT VERIFIED** (static wiring to `actions.ts` / module loaders only).

| Feature area | Route(s) | Status | Evidence |
|--------------|----------|--------|----------|
| Owner product modules (56 top segments) | `(app)/*` | NOT VERIFIED | Colocated actions (~73 files) |
| Project workspace (52 deep routes) | `/projects/[id]/*` | NOT VERIFIED | `load-project-detail`, tab order |
| Employee app | `/employee/*` | NOT VERIFIED | `(shell)/layout`, `employee/actions.ts` |
| Contractor portal | `/contractor/*` | NOT VERIFIED | Unit: `contractor-portal/nav-and-sections.test.ts` |
| Public customer/vendor portal | `/portal/*` | **NOT IMPLEMENTED** | Always `notFound()` |
| Settings portal admin | `/settings/portal` | **NOT IMPLEMENTED** | `notFound()` |
| OCR review | `/documents/ocr-review` | **PARTIAL** | Env flag; redirect if disabled |
| Quick create / nav | Shell | **PARTIAL** | Unit tests on grouping only |
| API workers / v1 | `/api/*` | NOT VERIFIED | No E2E on workers |

---

## 4. Cross-module integration matrix

Rows = source → columns = consumer. **✓** = wired in code + some test; **~** = partial; **✗** = missing/broken.

| Flow | Steps | Status | Evidence |
|------|-------|--------|----------|
| **A** Attendance → hours → approve → labor → P&L | clock → time_entries → approve → `getProjectLaborCost` → compose | **PARTIAL** | Integration timesheet-approval ✓; WF-002 overwrite void |
| **B** Monthly cost → allocation → profit | EMC → allocation run → financials | **VERIFIED (engine)** | Unit conservation; WF-001 expense stack |
| **C** Task → assign → progress → reports | sync assignees → derive progress → task-reports | **PARTIAL** | PM-005/006/011 |
| **D** Field photo → storage → share | evidence → dg-files → external-storage | **PARTIAL** | Integration dg-field ✓; owner task UI gap DOC-002 |
| **E** Lead → SUMIT → margin | CRM → quote → project → billing → SUMIT | **PARTIAL** | CRM integration ✓; FIN-002…005; no live SUMIT |
| **F** PO → bill → actual | commitment ≠ expense | **VERIFIED (engine)** | `committed-vs-actual.test.ts`; FIN2-001 overlap |
| **G** Multi project-type isolation | templates + capability registry | **PARTIAL** | SEC-004/005 execution URL leak |
| **H** Cross-org / role boundaries | RLS + app permissions | **PARTIAL** | 16 tenant-isolation suites; SEC-001/002 |
| **I** Idempotency / retries | DG events, OCR, payments | **PARTIAL** | consumer.test.ts ✓; OPS-001 kick silent |
| **J** Same ₪ everywhere | dashboard / reports / project tabs | **PARTIAL** | E2E contract only; RPT-002 |
| **K** VAT vs profit | net CCV, net cost | **VERIFIED (formula)** | `profit.ts`; FIN-005 at SUMIT boundary |
| **L** Quick-create / quote settings | shell + quotes settings | **NOT VERIFIED** | Static nav only |

---

## 5. Financial data lineage & calculation consistency

**Single compose path:** `getProjectFinancials` → `composeProjectFinancials` → `profit.ts` (margin = **CCV net − cost net**).

```text
Revenue (profit): contract_value_events (NET) → currentContractValue
Cost (actual): expenses.net + AP net (deduped) + labor (Mode C) + adjustments
NOT in actual: PO commitment, draft expense, billing AR, collections
Commitment (forecast): committed_costs + subcontract remaining → forecast final
Cash: AP payable, customer payments (disclosure buckets)
Billing AR: gross positions; KPI billed often NET (resolve-kpi-display)
Workforce: time_entries + monthly displacement; excludes internal_employee_payroll expenses only
```

**Consistency verdict:** Engine **internally consistent** when classifications and matches are correct. **Operational risks:** duplicate expense+AP (FIN2-001), duplicate workforce+payroll-like expenses (WF-001), SUMIT line mapping (FIN-005), reports period filter vs lifetime rollup (RPT-004).

---

## 6. End-to-end scenario matrix

| Scenario | Verification | Result |
|----------|--------------|--------|
| CRM accept → convert → one project | Integration `opportunity-quote-conversion-flow.test.ts` | **PASS** (local PGlite) |
| Timesheet approve → labor actual | Integration `timesheet-approval.test.ts` | **PASS** |
| Billing credit note without void original | Integration `billing/integrity.test.ts` | **PASS** |
| DG site log / meetings / instructions + RLS | Integration `dg-field/field.test.ts` | **PASS** (10 tests) |
| Workforce cross-tenant | Integration `workforce/tenant-isolation.test.ts` | **PASS** |
| Money chain scenarios 1–8 | Playwright `project-centric-money-chain.spec.ts` | **NOT RUN** (exists in repo) |
| Full lead → SUMIT HTTP → payment | — | **NOT VERIFIED** |
| Owner clicks all nav routes | — | **NOT VERIFIED** |
| Production cron workers | — | **NOT VERIFIED** (static only) |

---

## 7. Permissions & org boundary report (summary)

- **App layer:** `authorize` / `assertPermission`; templates enforce H2 (no profit for manager/worker).
- **Project scope:** `can_access_project` in SQL (0154) vs app `resolveAccessibleProjectIds` — largely aligned.
- **Financial SQL gates:** 0073 on AP/billing/expenses; 0168 subcontract money mask — **when applied in Production**.
- **Gaps:** `audit_events` and `contracts` still member-wide SELECT at RLS (SEC-001, SEC-002); `role_assignments.project_id` ignored in app permission union (SEC-003); Developer/GC execution pages reachable by URL without delivery profile check (SEC-004).

---

## 8. Full defect register

Each entry: unique ID, domain, severity, behavior, expected, reproduction, evidence, root cause, consequences, production exposure, fix (recommendation), verification.

---

### WF-001 — CRITICAL

| Field | Detail |
|--------|--------|
| Domain | Workforce / financials — labor vs expenses |
| Severity | **CRITICAL** |
| Observed | Payroll-like **project expenses** (e.g. subcontractor category, key `labor`, uncategorized) remain in **Actual** while Workforce Mode C also recognizes labor for same projects. |
| Expected | Single internal payroll path via Workforce; external labor stays in expenses. |
| Reproduction | Project with applied monthly labor + finalized expense not tagged `internal_employee_payroll`. |
| Evidence | `src/modules/financials/domain/labor-expense-integrity.ts` (only `internal_employee_payroll` excluded); compose cost aggregation. |
| Root cause | 0070+ policy narrowed exclusion; misclassification allowed. |
| Consequences | **Overstated costs, understated profit** (documented real-org pattern in owner data audits). |
| Production | **Possible** — depends on expense categorization habits. |
| Fix | Enforce classification; warnings; optional exclude `labor` when workforce present. |
| Verification | **Static + unit**; needs integration with misclassified expense. |
| Confidence | **High** |

*(See also FIN2-007 — same invariant, financial lens.)*

---

### FIN-005 — HIGH

| Field | Detail |
|--------|--------|
| Domain | Billing / SUMIT / VAT |
| Severity | **HIGH** |
| Observed | Default billing line sets `lineTotal` to header **`totalAmount` (gross)**; statutory bridge maps `lineTotal` → **net** for SUMIT with exclusive VAT. |
| Expected | Line net equals taxable base per `vatMode`. |
| Evidence | `create-billing-record.ts` `buildLines` L68–76; `build-statutory-bridge.ts`. |
| Root cause | Line model stores display gross in single-line invoices. |
| Consequences | SUMIT mismatch / double VAT risk on typical single-line invoices. |
| Production | **Possible** for exclusive-VAT orgs. |
| Fix | Store subtotal on lines or derive net in bridge. |
| Verification | Static code **verified**; live SUMIT **not verified**. |
| Confidence | **High** |

---

### FIN-002 — HIGH

| Field | Detail |
|--------|--------|
| Domain | Billing / SUMIT |
| Severity | **HIGH** |
| Observed | `voidBillingRecord` voids internal AR only; no provider cancel/credit. |
| Expected | Coordinated statutory void/credit or block. |
| Evidence | `void-billing-record.ts` — no invoicing-integration calls. |
| Production | **Verified pattern** if users void after SUMIT issue. |
| Fix | Guard + enqueue cancel/credit. |
| Confidence | **High** |

---

### FIN-003 — HIGH

| Field | Detail |
|--------|--------|
| Domain | Invoicing integration UX |
| Severity | **HIGH** |
| Observed | Credit/cancel external statutory exists in application layer only; **no** UI/server actions. |
| Expected | Billing panel actions for provider credit/cancel. |
| Evidence | `invoicing-integration/ui/actions.ts` scope. |
| Production | **Possible** — ops use SUMIT outside PF. |
| Fix | Wire actions + link to adjustments. |
| Confidence | **High** |

---

### FIN2-001 — HIGH

| Field | Detail |
|--------|--------|
| Domain | AP / expenses |
| Severity | **HIGH** |
| Observed | `assertNoUnlinkedExpenseApOverlap` is **no-op** (warn-only design). |
| Expected | Block or require canonical match before both recognize. |
| Evidence | `expense-ap-overlap.ts` L106–111; unit tests expect no throw. |
| Consequences | Double **Actual** for same vendor obligation. |
| Production | **Possible**. |
| Fix | Hard block or forced link workflow. |
| Confidence | **High** |

---

### WF-002, WF-003, WF-004 — HIGH

See agent report [Workforce labor](0d56169c-bb42-42bb-b369-85602dac7b9d): attendance overwrite voids approved time; applied EMC reopenable until month-close closed; WDM front-load accrual.

---

### SEC-001, SEC-002 — HIGH

RLS weaker than app for `audit_events` and commercial `contracts` / value events — direct DB client bypasses `audit.read` / project financial gates.

---

### PM-001, PM-003 — HIGH

Template metadata (BOQ/forms/closeout) not applied on project launch; dual field stacks (legacy field-ops vs DG site-log).

---

### UI-001 — HIGH

Public `/portal/*` permanently disabled (`notFound()`), including when external access flag might suggest otherwise.

---

### Annex A — Complete defect register (81 entries)

Columns: **ID | Sev | Domain | Observed | Expected | Evidence | Root | Exposure | Fix hint | Conf**

| ID | Sev | Domain | Observed | Expected | Evidence / path | Root | Production | Fix (rec.) | Conf |
|----|-----|--------|----------|----------|-----------------|------|------------|------------|------|
| WF-001 | CRITICAL | Workforce/financials | Payroll-like expenses + Workforce labor both in Actual | Single internal payroll path | `labor-expense-integrity.ts` | Narrow exclusion key | Possible | Classify + guard | High |
| WF-002 | HIGH | Workforce | Attendance overwrite voids approved time | Correction workflow only | `attendance-project-sync.ts` | Overwrite = reset | Possible | Block or correctTimeEntry | High |
| WF-003 | HIGH | Workforce | Applied EMC reopenable until `closed` | Frozen applied months | `monthly-cost-recompute.ts` | Optional month-close | Possible | Freeze on apply | High |
| WF-004 | HIGH | Workforce | Low WDM front-loads month cost | Accrual matches calendar | employer pool / accrual | Config default | Possible | Validate WDM | Med |
| WF-005 | MEDIUM | Docs/code | LABOR-COST-INTEGRITY doc vs code on `labor` key | Doc matches code | doc vs `labor-expense-integrity.ts` | Doc drift | Local | Update doc or code | High |
| WF-006 | MEDIUM | Workforce | Attendance sync auto-approves time | Draft-only option | `attendance-project-sync.ts` | Convenience | Possible | Org setting | Med |
| WF-007 | MEDIUM | Workforce | Dual timesheet vs entry approval UX | One clear path | `timesheet-lifecycle.ts` | Parallel models | Possible | Persona defaults | Med |
| WF-008 | LOW | Employee app | No offline clock | Queued clock (product) | `sync-mutations.ts` | Online-only | Local | Product decision | High |
| WF-009 | MEDIUM | Allocation | Pending hours → unallocated pool | Alerts | `monthly-cost-recompute.ts` | Approved-only split | Possible | Banner ₪ | Med |
| WF-010 | LOW | Attendance | Clock correction doesn’t sync time | Hint to fix time | `attendance-correction-requests.ts` | By design | Possible | UX link | Med |
| FIN-001 | MEDIUM | SUMIT | One receipt per payment id | Per-invoice receipts | payment plan unit tests | Idempotency scope | Possible | Allocation-scoped keys | High |
| FIN-002 | HIGH | SUMIT | Internal void ≠ provider cancel | Coordinated void | `void-billing-record.ts` | Decoupled layers | Possible | Wire cancel | High |
| FIN-003 | HIGH | SUMIT | No UI for statutory credit/cancel | Billing actions | ui/actions scope | Incomplete UX | Possible | Server actions | High |
| FIN-004 | MEDIUM | SUMIT | Credit note doesn’t trigger SUMIT credit | Auto statutory credit | `create-billing-adjustment.ts` | Not wired | Possible | Post-commit hook | High |
| FIN-005 | HIGH | SUMIT/VAT | Gross in lineTotal → SUMIT net | Net lines | `create-billing-record.ts` L72 | Line model | Possible | Subtotal on lines | High |
| FIN2-001 | HIGH | AP/expense | Overlap assert no-op | Block duplicate Actual | `expense-ap-overlap.ts` L106 | Warn-only | Possible | Hard block | High |
| FIN2-002 | LOW | Reports | Statement “invoiced” gross vs profit net | Clear labels | branded reports | AR vs profit | Possible | Label fix | Med |
| FIN2-003 | HIGH | Budget | Discipline lines unmapped actuals | Line-level actuals | `map-line-actuals.ts` | Mapping gap | Possible | Map disciplines | Med |
| FIN2-004 | MEDIUM | Overhead | No allocation hub UX | Pool UI | `/overhead` redirect | UX only | Possible | Hub page | Med |
| FIN2-005 | MEDIUM | Cash forecast | Finalized expenses omitted | Include or disclose | cash forecast design | By design | Possible | Doc/option | Med |
| FIN2-006 | MEDIUM | i18n | Duplicate “forecast profit” labels | Distinct actual/forecast | locales financial | Copy | Possible | Hebrew copy | Med |
| FIN2-007 | HIGH | Labor (=WF-001) | Misclassified payroll expenses | Same as WF-001 | same | same | Possible | same | High |
| FIN2-008 | MEDIUM | GCM | Stale GCM vs live pool | Consistent company actual | GCM loaders | Timing | Unknown | Reconcile job | Low |
| FIN2-009 | LOW | Org rollup | Legacy expenses-only org API | Use compose only | closure notes | Legacy | Possible | Deprecate | Med |
| FIN2-010 | MEDIUM | Inventory | Receive ≠ expense actual | User education | procurement matrix | Model | Possible | UI hints | Med |
| CRM-001 | MEDIUM | CRM | Convert quote without CRM perm leaves opp open | Win sync | `convert-quote.ts` ~332 | Optional CRM side effect | Possible | Require crm.manage | High |
| CRM-002 | MEDIUM | CRM | Bridge uses draft CRM version | Accepted only | `convert-crm-quote-to-product-quote.ts` | Fallback | Possible | Reject draft | High |
| CRM-003 | LOW | CRM | Lead “converted” on opp create | Convert on win | `opportunities.ts` | List hygiene | Possible | New status | Med |
| UI-001 | HIGH | Portal | `/portal/*` always 404 | Portal when enabled | `portal/page.tsx` | Disabled product | Verified code | Remove double notFound | High |
| UI-002 | MEDIUM | Settings | `/settings/portal` 404 | Admin portal UI | settings/portal page | Not exposed | Verified code | Enable or remove actions | High |
| UI-003 | LOW | Employee | revalidate `/employee/attendance` alias | Match `/employee/time` | correction-actions | Redirect alias | Possible | Fix path | Med |
| UI-004 | LOW | Nav | `/inbox` → `/today` only | Dedicated inbox | inbox page | Legacy | Possible | Redirect doc | High |
| UI-005 | TRIVIAL | Tasks | `_task-api-stub` naming | Real module name | tasks ui stub | Naming | Local | Rename | High |
| SEC-001 | HIGH | RLS | audit_events member SELECT | audit.read gate | `0001_rls_security.sql` | RLS weaker | Possible if PostgREST | Tighten SELECT | High |
| SEC-002 | HIGH | RLS | contracts member SELECT | contracts.read + project | migrations vs 0073 | RLS weaker | Possible | 0073-style policies | High |
| SEC-003 | MEDIUM | RBAC | project_id on roles in SQL not app | Align union | 0154 vs roles.repository | Divergence | Possible | App filter or doc | Med |
| SEC-004 | MEDIUM | Project type | GC execution URL without profile | Profile gate | execution screens | Nav-only gate | Possible | requireDeveloperGc | Med |
| SEC-005 | MEDIUM | Project type | GC alone ≠ execution nav | Clear GC story | management-mode | Product split | Possible | Docs/UX | Med |
| SEC-006 | LOW | Tenancy | Default project access `all` | Tighter default | 0050 migration | Default | Possible | Onboarding | Med |
| SEC-007 | LOW | Financials | null project_id rows visible | Scope null rows | project-access | By design | Possible | UI filter | Med |
| SEC-008 | INFO | RBAC | Manager template powerful | H2 profit only | role-templates | Intentional | Verified design | — | High |
| SEC-009 | INFO | Subcontract | Money mask aligned | — | 0168 + tests | — | When migrated | — | High |
| SEC-010 | INFO | Migrations | PREPARED headers in journal | Prod apply state | journal | Process | Unknown | Owner verify | Med |
| PM-001 | HIGH | Templates | Template metadata not applied | Auto BOQ/forms | `templates.ts` apply | Metadata only | Possible | Implement apply | High |
| PM-002 | MEDIUM | Templates | closeout keys unused | Drive closeout UI | template JSON | Not wired | Possible | Wire closeout | Med |
| PM-003 | HIGH | Field | Dual field-ops vs site-log | Unified field | two modules | Parallel build | Possible | Consolidate UX | Med |
| PM-004 | MEDIUM | Field | Instruction→CO stub null | Commercial link | convertWithSubcontracts | Stub | Possible | Implement port | Med |
| PM-005 | MEDIUM | Planning | Planning items ≠ UWM tasks | Link or doc | planning vs tasks | Separate models | Possible | Integration | Med |
| PM-006 | MEDIUM | Scheduling | Bookings don’t sync tasks | Optional sync | scheduling/bookings | No bridge | Possible | Webhook/sync | Med |
| PM-007 | LOW | Planning | CPM unsupported | No false CPM claim | planning domain | Honest flag | Local | UI copy | High |
| PM-008 | MEDIUM | Progress | Default manual progress | tasks mode opt-in | project progress_source | Default | Possible | Template default | Med |
| PM-009 | MEDIUM | Tasks | Owner task page no evidence UI | Parity with contractor | tasks/[id] page | Asymmetric | Possible | Add gallery | Med |
| PM-010 | LOW | Jobs | Jobs skip heavy planning | Clear eligibility | assertPlanningEligible | Rule | Possible | UX hint | Med |
| PM-011 | MEDIUM | Calendar | Four date lenses | Unified calendar story | calendar/work/scheduling | Fragmentation | Possible | Product map | Med |
| PM-012 | LOW | Calendar | External sync foundation only | Google/Outlook sync | EXTERNAL_CALENDAR | Not built | N/A | Future | High |
| PM-013 | MEDIUM | Notifications | Reminder delivery thin | Reliable notify | scan-conditions | Scanner dep | Unknown | Worker verify | Low |
| PM-014 | LOW | Tasks | assignAll requires project task | Document | sync assignees | Rule | Local | Doc | High |
| PM-015 | INFO | Projects | work_kind real “type” | Richer catalog | projects schema | Model choice | — | — | High |
| DOC-001 | MEDIUM | Evidence | Download not inline preview | Unified viewer | evidence gallery | Pattern | Possible | Inline viewer | Med |
| DOC-002 | MEDIUM | Evidence | Owner task missing evidence | Same as contractor | task pages | Gap | Possible | Add UI | High |
| DOC-003 | LOW | Field | Two daily upload models | One mental model | entity-access | By design | Possible | Guide | Med |
| DOC-004 | MEDIUM | Attachments | Legacy docs vs DG evidence | One model | field-ops vs evidence | Dual | Possible | Migrate | Med |
| DOC-005 | LOW | Audit labels | Missing activity labels | Full i18n | audit actions | Incomplete | Possible | Locale keys | Low |
| DOC-006 | MEDIUM | Google | Native export failures | Graceful error | google adapter | Provider | Possible | Retry UX | Med |
| DOC-007 | LOW | Plans | Draft hidden from contractor | “Revoked” UX | plans RLS | Intentional | Possible | Soft message | Med |
| DOC-008 | MEDIUM | Templates | Folders skip without perm | Warn on skip | apply template | Silent | Possible | Toast | Med |
| DOC-009 | LOW | Share | Revoked share = NotFound | Revoked state | share resolver | Intentional | Possible | UX | Med |
| DOC-010 | INFO | Storage | No fallback bucket | Require connect | file-store | Policy | Verified | — | High |
| DOC-011 | MEDIUM | Employee docs | Category null grants | Field upload access | employee docs | Filter | Possible | Grant fix | Med |
| DOC-012 | LOW | SUMIT archive | Statutory PDF not in project folders | Auto archive | invoicing | Gap | Possible | Worker archive | Med |
| RPT-001 | MEDIUM | Reports | No labor-by-period org pack (same as legacy **RPT-MEDIUM-001**) | Dedicated report | reports catalog | Missing | Possible | New kind | Med |
| RPT-002 | MEDIUM | E2E | No actual on reports row test | 4-way reconcile | money-chain spec | Test gap | Local | Extend E2E | High |
| RPT-003 | LOW | E2E | Dashboard contract ≥ only | Strict equality option | reconciliation | Multi-project | Local | Stricter test | Med |
| RPT-004 | LOW | Reports | Period filters billing not rollup | Align semantics | reports analytics | Asymmetric | Possible | UI label | High |
| RPT-005 | MEDIUM | KPI | vendorActual mixed semantics | Clear definition | org analytics | Naming | Possible | Rename | Med |
| RPT-006 | LOW | UX | Analytics behind gate | Default load option | advanced gate | UX | Possible | Persona | Med |
| OPS-001 | MEDIUM | Workers | dg-events not on Vercel cron | Dedicated cron | vercel.json | Kick-only | Possible | Add cron | Med |
| OPS-002 | MEDIUM | Workers | storage worker async 200 | Poll status | storage-provision route | waitUntil | Possible | Status API | Med |
| OPS-003 | LOW | Cron | Daily OCR/Sumit only | Faster retry | hobby crons | Plan limit | Verified config | Upgrade/more kicks | High |
| OPS-004 | LOW | Workers | DG kick errors swallowed | Metrics | kick-drain.ts | Silent catch | Possible | Log/metric | Med |
| OPS-005 | LOW | Workers | No full ops-worker integration test | Harness | ops route | Test gap | Local | Integration test | Med |

---

## 9. Unknowns & blocked tests

| Item | Reason |
|------|--------|
| Runtime health of all 387 pages | No E2E run this session |
| Production RLS migration parity (0073, 0154, 0168…) | Cannot confirm apply state without Owner DB read; see **SEC-010** |
| **Production vs PGlite schema** | Journal lists migrations through **0172**; some DG SQL files carry “PREPARED ONLY” headers while code/tests assume objects exist — **environment drift** if Production lags HEAD ([Auth RLS permissions](86f051bf-1464-4c07-b0ee-14e05cfabcd1)) |
| **`PF_WIP_FILES` test harness** | Integration PGlite applies `drizzle/migrations/` by default; optional `PF_WIP_FILES` swaps named files from `migrations-wip/` (`tests/setup/database.ts` L183–196). CI/normal runs **unset** — DG integration tests that document `PF_WIP_FILES=…` may prove **more** than default harness unless run with env |
| Live SUMIT API | No credentials / no HTTP test |
| Vercel cron execution & secrets | Not observed |
| Mobile RTL on real devices | Not tested |
| Performance / build on Vercel | Out of scope (commit mentions build revert) |
| Material market cross-tenant signal (historical HIGH) | **Not re-verified** this audit — treat as **unknown** until code re-grep in release gate |

---

## 10. Verdict & recommended next steps (audit only — no implementation)

1. **Treat CRITICAL/HIGH financial and SUMIT defects as release blockers** for finance-heavy go-live (WF-001, FIN-005, FIN-002/003/004, FIN2-001).
2. **Run** full local CI preflight + Playwright money-chain + persona matrix before any release claim.
3. **Confirm Production migration journal** matches repo through 0172+ with Owner.
4. **Manual smoke script** on: quick-create, quote settings, project tabs, workforce approve, billing finalize → SUMIT request (staging).
5. **Do not** infer SQL approval from this audit.

---

*End of report. Prepared for Owner review only.*
