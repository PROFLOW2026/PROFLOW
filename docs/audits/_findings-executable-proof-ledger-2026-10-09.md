# Findings executable proof ledger (2026-10-09)

| Field | Value |
|--------|--------|
| **Commit** | `39482947c5a92df1d34fd70fcd9b16e8b27a83d5` |
| **Scope** | AUDIT ONLY — map findings to best local **integration/unit/UI vitest** proof; no browser; no production SQL |
| **Register** | [PROJECTFLOW-FULL-SYSTEM-AUDIT-2026-10-09.md](./PROJECTFLOW-FULL-SYSTEM-AUDIT-2026-10-09.md) Annex A |
| **Reconcile** | [_verification-81-findings-execution-2026-10-09.md](./_verification-81-findings-execution-2026-10-09.md), [_findings-resolution-security-2026-10-09.md](./_findings-resolution-security-2026-10-09.md) |
| **DOC/RPT/OPS/UI/PM body** | [DOC/RPT/OPS index](c727e0e1-a0ec-4f08-a895-ff5191f77194) — sections below through **Extras** |

**Legend:** **EXEC** = test run this wave or cited green log; **PRIOR** = already green/fail in resolution logs (not re-run); **STATIC** = source/readFile vitest only; **EXT** = cannot close locally.

**This wave logs**

| Batch | Log | Result |
|-------|-----|--------|
| Unit/UI proof | [_findings-executable-proof-unit-2026-10-09.log](./_findings-executable-proof-unit-2026-10-09.log) | **14 + 4 files, 134/134 pass** |
| UI mobile nav | [_findings-executable-proof-ui-2026-10-09.log](./_findings-executable-proof-ui-2026-10-09.log) | **1 file, 2/2 pass** |
| Integration proof | [_findings-executable-proof-integration-2026-10-09.log](./_findings-executable-proof-integration-2026-10-09.log) | **7 + 1 files, 46/46 pass** |

**Not re-run (prior green / known fail):** `verification-81-findings-execution-2026-10-09.test.ts` **27/27**; unit resolution batch **59/59** (`labor-expense-integrity`, `expense-ap-overlap`, …); `migrations.test.ts` **1 fail** (OPS-B-003); `db:check-journal` OK (SEC-010 local); tenant-isolation **32/32**.

Column key: **Proof** = best executable test; **Wave** = this session run; **Verdict** = disposition for audit closure.

---

## DOC (DOC-001 … DOC-012)

| ID | Verdict | Proof | Wave | Result |
|----|---------|-------|------|--------|
| DOC-001 | CONFIRMED — no inline evidence preview | `tests/unit/audit/verification-81-findings-execution-2026-10-09.test.ts` (DOC-001 read `evidence-gallery.tsx`) | PRIOR | **27/27** audit slice |
| DOC-002 | CONFIRMED — contractor evidence path; owner task UI gap | `tests/integration/dg-documents/evidence-and-plans.test.ts` (upload + contractor isolation); gap: no owner-task parity test ([Operational §11](./PROJECTFLOW-OPERATIONAL-VERIFICATION-2026-10-09.md)) | EXEC | **7/7 pass** |
| DOC-003 | INTENTIONAL DESIGN — dual upload models (field-ops vs DG evidence) | `tests/integration/documents/field-ops-create-attach.test.ts` + `evidence-and-plans.test.ts` | EXEC | **2/2** + **7/7** |
| DOC-004 | CONFIRMED — legacy field-ops attach vs DG evidence both work | Same as DOC-003 | EXEC | pass |
| DOC-005 | CONFIRMED (static) — audit action i18n gaps | No dedicated test; register static grep on audit action copy | STATIC | not testable without new fixture |
| DOC-006 | CONFIRMED provider errors; live OAuth **EXT** | `tests/unit/external-storage/google-drive-adapter.test.ts` (API failure paths); audit vitest static provider | EXEC + PRIOR | **24/24** + audit slice |
| DOC-007 | INTENTIONAL DESIGN — draft docs hidden from contractors | `evidence-and-plans.test.ts` — “drafts stay hidden” on project-wide shares | EXEC | **7/7** |
| DOC-008 | CONFIRMED — template folder apply silent skip | Audit vitest DOC-008 (`apply-project-template.ts`) | PRIOR | audit **27/27** |
| DOC-009 | INTENTIONAL DESIGN — revoked share → inactive / no lateral access | `tests/unit/portal/customer-idor.test.ts` — revoked/expired grants inactive | EXEC | **9/9 pass** |
| DOC-010 | INTENTIONAL DESIGN — require connected storage (no fallback bucket) | `tests/unit/external-storage/connection-rules.test.ts` | EXEC | **4/4 pass** |
| DOC-011 | CONFIRMED — null category allowed in project scope (employees) | Audit vitest DOC-011 (`document-access.ts`) | PRIOR | audit **27/27** |
| DOC-012 | CONFIRMED — statutory PDF module exists; billing adjust does not auto-archive | Audit vitest DOC-012 | PRIOR | audit **27/27** |

---

## RPT (RPT-001 … RPT-006)

| ID | Verdict | Proof | Wave | Result |
|----|---------|-------|------|--------|
| RPT-001 | CONFIRMED — no `labor`*`period`* org pack kind | Audit vitest RPT-001 (`REPORT_KINDS`) | PRIOR | audit **27/27** |
| RPT-002 | TEST INFRA — unit OK; Playwright money-chain harness broken | `tests/unit/reports/report-packs.test.ts` | EXEC | **8/8 pass** (E2E **not run** — no browser) |
| RPT-003 | CONFIRMED (static) — dashboard contract ≥ E2E design only | `tests/unit/reports/report-paths.test.ts` (route helpers) | EXEC | **1/1 pass** |
| RPT-004 | CONFIRMED (static) — period vs rollup label semantics | `tests/unit/financials/org-report-aggregate.test.ts` | EXEC | **8/8 pass** |
| RPT-005 | CONFIRMED — `vendorActual` rollup key | Audit vitest RPT-005 + `org-report-aggregate.test.ts` | EXEC + PRIOR | **8/8** + audit |
| RPT-006 | CONFIRMED (static) — analytics gate / null uncovered metrics | `tests/unit/financials/management-analytics.test.ts` | EXEC | **10/10 pass** |

---

## OPS (OPS-001 … OPS-005)

| ID | Verdict | Proof | Wave | Result |
|----|---------|-------|------|--------|
| OPS-001 | CONFIRMED — dg-events consumer + hobby cron config | `tests/integration/dg-events/consumer.test.ts` + `tests/unit/ops/vercel-hobby-crons.test.ts` | EXEC | **9/9** + **1/1** |
| OPS-002 | CONFIRMED — storage provision worker `waitUntil` | Audit vitest OPS-002 | PRIOR | audit **27/27** |
| OPS-003 | INTENTIONAL DESIGN — Vercel Hobby cron limits | `vercel-hobby-crons.test.ts` ( documents allowed crons ) | EXEC | **1/1 pass** → see **INTENTIONAL** |
| OPS-004 | CONFIRMED — DG kick swallows errors | Audit vitest OPS-004 | PRIOR | audit **27/27** |
| OPS-005 | PARTIAL / TEST INFRA — consumer covered; no dedicated ops-worker integration | `consumer.test.ts` (idempotency, retry, RLS notifications) | EXEC | **9/9 pass** |

---

## UI (UI-001 … UI-005)

| ID | Verdict | Proof | Wave | Result |
|----|---------|-------|------|--------|
| UI-001 | NOT IMPLEMENTED — public portal routes `notFound()` | `tests/unit/portal/safe-redaction.test.ts` — public portal login disabled; code: `src/app/[locale]/portal/page.tsx` | EXEC | **10/10** file (portal disabled assertion) |
| UI-002 | NOT IMPLEMENTED — settings portal `notFound()`; nav hidden | `tests/unit/shell/settings-grouping.test.ts` — `portal.hideFromNav`, direct URL still allowed | EXEC | **4/4 pass** |
| UI-003 | PARTIAL — employee attendance alias / mobile nav | `tests/ui/mobile-nav.test.tsx` | EXEC | **2/2 pass** |
| UI-004 | CONFIRMED — `/inbox` → `/today` | Audit vitest UI-004 | PRIOR | audit **27/27** |
| UI-005 | CONFIRMED (trivial) — `_task-api-stub` naming in task UI | `tests/unit/tasks/planner-board.test.ts` imports `mapTaskToCardData` from stub | EXEC | **7/7 pass** |

---

## PM (PM-003 … PM-015)

| ID | Verdict | Proof | Wave | Result |
|----|---------|-------|------|--------|
| PM-003 | CONFIRMED — dual field stacks (DG field vs field-ops) | `tests/integration/dg-field/field.test.ts` + `tests/unit/dg-field/domain.test.ts` + `field-ops-create-attach.test.ts` | EXEC | **10/10** + **13/13** + **2/2** |
| PM-004 | CONFIRMED — instruction→CO port null stub | Audit vitest PM-004 | PRIOR | audit **27/27** |
| PM-005 | CONFIRMED — planning ≠ tasks (separate models) | Agent 02 suite ([Operational §03](./PROJECTFLOW-OPERATIONAL-VERIFICATION-2026-10-09.md)); this wave: `project-tasks-ux.test.ts` + `planning/overdue.test.ts` | EXEC | **3/3** + **8/8** |
| PM-006 | CONFIRMED — bookings ≠ task sync | `tests/integration/scheduling/tenant-isolation.test.ts` (bookings/unavailability only) | EXEC | **2/2 pass** |
| PM-007 | CONFIRMED (static) — honest “no CPM” product copy | `src/modules/planning/ui/messages.ts` + panels (no vitest asserts copy); planning unit suite exercises FS-only graph | STATIC | behavior covered indirectly by `overdue.test.ts` |
| PM-008 | CONFIRMED — `progress_source` default `manual`; derive optional | Audit vitest PM-008 + `tests/unit/tasks/derive-project-progress.test.ts` | EXEC + PRIOR | **4/4** + audit |
| PM-009 | CONFIRMED — task attachments RBAC; owner evidence UI asymmetry (DOC-002) | `tests/integration/tasks/task-attachments.test.ts` | EXEC | **4/4 pass** |
| PM-010 | CONFIRMED (static) — jobs skip planning eligibility | `tests/unit/planning/overdue.test.ts` — `assertPlanningEligible('job')` throws | EXEC | **8/8 pass** |
| PM-011 | CONFIRMED (static) — four date lenses / calendar fragmentation | Register static on planning vs tasks vs bookings modules; no single chain test | STATIC | not testable as one local chain |
| PM-012 | NOT IMPLEMENTED — `EXTERNAL_CALENDAR` placeholder | Static feature flag / env in product code (no integration) | STATIC | future feature |
| PM-013 | PARTIAL — reminder delivery via dg-events consumer | `tests/integration/dg-events/consumer.test.ts` | EXEC | **9/9 pass** |
| PM-014 | PARTIAL CONFIRMED — assignee UX (`assignAll` / 0/1/N) | `tests/integration/tasks/project-tasks-ux.test.ts` | EXEC | **3/3 pass** |
| PM-015 | INTENTIONAL DESIGN — `work_kind` model | `tests/unit/closeout/close-reopen.test.ts` — jobs/work orders vs classic closeout | PRIOR | cited Operational / closeout unit |

---

## Workforce & financial cross-refs (WF-001/008/010, FIN2-001/005/007, SEC-005 … SEC-010)

| ID | Verdict | Proof | Wave | Result |
|----|---------|-------|------|--------|
| WF-001 | INTENTIONAL DESIGN | `tests/unit/financials/labor-expense-integrity.test.ts` | PRIOR | **6/6** → **INTENTIONAL** |
| WF-008 | INTENTIONAL DESIGN — online-only clock (no offline workforce sync) | `tests/unit/offline/sync-and-capture.test.ts` — `offline_sync_not_wired` for product drafts | PRIOR | Operational wave; not re-run |
| WF-010 | INTENTIONAL DESIGN — clock correction via approval flow | `tests/unit/workforce/time-correction-approval.test.ts` | EXEC | **11/11 pass** |
| FIN2-001 | INTENTIONAL DESIGN — overlap warn-only | `tests/unit/financials/expense-ap-overlap.test.ts` | PRIOR | **4/4** → **INTENTIONAL** |
| FIN2-005 | INTENTIONAL DESIGN — cash forecast disclosure / sources | `tests/unit/financials/cash-flow-sources.test.ts` — `FORECAST_V2_NOTE`, operating expense installments | EXEC | **5/5 pass** |
| FIN2-007 | INTENTIONAL DESIGN (= WF-001) | Same as WF-001 | PRIOR | **6/6** |
| SEC-005 | INTENTIONAL DESIGN — GC / execution nav story | `tests/unit/project-workspace/execution-nav.test.ts` | EXEC | **5/5 pass** |
| SEC-007 | INTENTIONAL DESIGN — null `project_id` visibility rules | App-layer patterns in financial/workforce unit suites (e.g. `map-dashboard-missing-data-view.test.ts`); no PostgREST-only proof | STATIC | by-design, app-tested fragments |
| SEC-008 | INTENTIONAL DESIGN — powerful manager template | `tests/unit/employee-app/role-template.test.ts` | EXEC | **2/2 pass** |
| SEC-009 | CONFIRMED — subcontract money mask / column revoke | `tests/integration/dg-financial-projection/financial-projection.test.ts` (`PF_WIP_FILES=0168…`) | EXEC | **9/9 pass** |
| SEC-010 | BLOCKER **EXT** — Production migration apply state | `npm run db:check-journal` + PREPARED headers (local OK) | PRIOR | journal parity; **no Owner DB read** → **EXTERNAL** |

---

## INTENTIONAL DESIGN (rollup)

| ID | Domain | Executable anchor |
|----|--------|-------------------|
| WF-001 | Workforce / labor vs generic expense | `labor-expense-integrity.test.ts` **6/6** (PRIOR) |
| WF-008 | Workforce clock | Online clock domain tests; offline queue **not wired** for clock (`sync-and-capture.test.ts`) |
| WF-010 | Workforce corrections | `time-correction-approval.test.ts` **11/11** |
| FIN2-001 | Financial overlap | `expense-ap-overlap.test.ts` **4/4** (PRIOR) |
| FIN2-005 | Cash forecast scope | `cash-flow-sources.test.ts` **5/5** |
| FIN2-007 | Same as WF-001 | `labor-expense-integrity.test.ts` |
| SEC-005 | Nav / delivery profile | `execution-nav.test.ts` **5/5** |
| SEC-007 | RBAC visibility | Documented product rules; partial unit coverage only |
| SEC-008 | Role templates | `role-template.test.ts` **2/2** |
| DOC-003 | Dual upload models | field-ops + DG evidence integration **pass** |
| DOC-007 | Draft hidden from contractors | `evidence-and-plans.test.ts` |
| DOC-009 | Revoked external access | `customer-idor.test.ts` **9/9** |
| DOC-010 | Storage connection required | `connection-rules.test.ts` **4/4** |
| OPS-003 | Hobby cron limits | `vercel-hobby-crons.test.ts` **1/1** |
| PM-015 | `work_kind` / closeout paths | `closeout/close-reopen.test.ts` (PRIOR) |

---

## EXTERNAL VERIFICATION REQUIRED

| ID | Why local EXEC is insufficient | Local partial proof |
|----|--------------------------------|---------------------|
| SEC-010 | Production `schema_migrations` / applied 0172+ unknown without Owner DB | `db:check-journal` **OK** (171 files); 20× `PREPARED ONLY` migration headers |
| DOC-006 | Live Google OAuth token exchange | `google-drive-adapter.test.ts` **24/24** (mock HTTP); audit vitest static provider |

---

## Extras (outside Annex A-81)

| ID | Verdict | Proof | Wave | Result |
|----|---------|-------|------|--------|
| **OPS-B-003** | VERIFIED BROKEN (migration hygiene) | `tests/integration/database/migrations.test.ts` — five tables missing **FORCE RLS** | PRIOR | **1 fail** ([security resolution](./_findings-resolution-security-2026-10-09.md)) |
| **UI-MOB-001** | VERIFIED BROKEN — `/reports` horizontal overflow @320px | Playwright `tests/e2e/authenticated/regression.spec.ts` / `mobile.spec.ts` | **Not run** (no browser) | PRIOR Agent 11: `scrollWidth=453` > 320; nav matrix overflow flag |

---

## WORKFORCE + OPS-B-002 (EXEC — [Workforce proof](d493c90c-17e4-456d-8231-c136bf61af63))

**Suite:** `tests/integration/audit-verification/` **8/8** + `workforce-wf-004-accrual-exact-amounts.test.ts` **1/1**

| ID | Test (exact) | Result | Verdict | Actual behavior (DB/runtime) |
|----|--------------|--------|---------|------------------------------|
| WF-002 | `wf-002-attendance-overwrite-approved` › overwrite after bulk-approve… | PASS | **VERIFIED BUSINESS LOGIC GAP** | Approved row **voided** (`voidedAt`); audit `attendance_overwrite` |
| WF-004 | `workforce-wf-004-accrual-exact-amounts` › WDM 5 vs 22 | PASS | **VERIFIED BUSINESS LOGIC GAP** | **9750.000000** vs **2215.910000** (5 accrued days) |
| WF-006 | `workforce-wf-006-attendance-auto-approve` | PASS | **VERIFIED BUSINESS LOGIC GAP** | Sync auto-approves project time rows |
| WF-007 | `workforce-wf-007-dual-approval-paths` › entry-level approveTimeEntry leaves timesheet submitted… | PASS | **VERIFIED BUSINESS LOGIC GAP** | Entry **approved**; `timesheets.status` **submitted** until `approveTimesheet` |
| OPS-B-002 | `ops-b-002-month-close-displacement` | PASS (repro) | **VERIFIED BUG** | CHECK **employee_month_costs_displacement_coupling** (23514) |

**Related:** `closed-period-source-corrections.test.ts` **2 fail** (same OPS-B-002). Retro employer cost **6/6** (**VERIFIED CORRECT** for actual/retro path).

---

## FINANCE · CRM · PM (EXEC — [Finance CRM PM](b3bff1da-38d7-403a-b6a8-605e12a4ce23))

**Suite:** unit **18/18** + integration **16/16** (audit-verification wave); log [`_executable-proof-audit-verification-run-2026-10-09.log`](./_executable-proof-audit-verification-run-2026-10-09.log).

| ID | Verdict | EXEC highlight |
|----|---------|----------------|
| FIN-005 | **VERIFIED BUSINESS LOGIC GAP** | `fin-005-gross-line-sumit-mapping` **3/3** — exclusive/inclusive/noVat; gross **57230** → SUMIT line **57230** vs subtotal **48500** |
| FIN2-003 | **VERIFIED BUSINESS LOGIC GAP** | Discipline **unmapped**; **50000** → remainder row (bundle) |
| FIN-002 | **VERIFIED BUSINESS LOGIC GAP** | `fin-002-void-statutory-decouple` — void AR, **0** external docs |
| FIN-003 | **VERIFIED MISSING FEATURE** | Provider cancel/credit mock **2/2**; **no** billing UI/server cancel wiring |
| FIN-004 | **VERIFIED BUSINESS LOGIC GAP** | Mock credit type **5** + idempotency; app adjustment **decoupled** (int void + unit mock) |
| CRM-001 | **VERIFIED BUSINESS LOGIC GAP** | `crm-001-002-convert-edges` — convert **without** `crm.manage` → opp **not won** |
| CRM-002 | **VERIFIED CORRECT** (bridge) | Same suite — **accepted** version lines, not newer **draft** |
| PM-001/002/004/008 | **VERIFIED BUSINESS LOGIC GAP** | Apply skips BOQ/forms skeleton; closeout keys stored; conversion **null**; progress default **manual** (bundle) |

---

## SECURITY (EXEC — [Security RLS](c981dad7-8817-4814-92b4-3f2cab120d18))

**Suite:** `rls-permission-gaps` **4/4** + `sec-004-execution-nav-gate` **2/2**; `migrations.test.ts` **1 fail** (OPS-B-003); `session-security` **6/7** (agreement row = **VERIFIED TEST INFRASTRUCTURE** / intentional scoped read).

| ID | Verdict | EXEC |
|----|---------|------|
| SEC-001 | **VERIFIED BUSINESS LOGIC GAP** | Raw SELECT `audit_events` without `audit.read` → rows returned |
| SEC-002 | **VERIFIED BUSINESS LOGIC GAP** | Raw SELECT `contracts` without `contracts.read` → row returned |
| SEC-003 | **VERIFIED BUSINESS LOGIC GAP** | App union empty; SQL `has_org_permission` true |
| SEC-004 | **VERIFIED BUSINESS LOGIC GAP** | `loadProjectExecutionNav` — `showGroup=false` unless developer+GC profile (**EXT** browser URL only) |
| SEC-006 | **VERIFIED BUSINESS LOGIC GAP** | Default `project_access_mode` = **all** |

---

## Commands (this wave only)

```text
npx vitest run --project unit  (14 files)  → 109/109
npx vitest run --project unit  (4 files)   → 25/25
npx vitest run --project ui tests/ui/mobile-nav.test.tsx → 2/2
npx vitest run --project integration (7 files) → 42/42
npx vitest run --project integration tests/integration/tasks/task-attachments.test.ts → 4/4
```

*End of executable proof ledger — 2026-10-09.*
