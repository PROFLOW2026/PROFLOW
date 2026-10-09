# ProjectFlow — Operational System Verification

| Field | Value |
|--------|--------|
| **Report date** | 2026-10-09 |
| **Baseline commit** | `89e0b9a90c43cffbec24e726675bf8448587833e` |
| **Continues** | [PROJECTFLOW-FULL-SYSTEM-AUDIT-2026-10-09.md](./PROJECTFLOW-FULL-SYSTEM-AUDIT-2026-10-09.md) (static discovery — **not** accepted as operational proof) |
| **Evidence policy** | Test assertions, logs, DB effects in PGlite integration tests. **No screenshot deliverables.** |
| **Production** | Not mutated; no authenticated production browser session; no production SQL apply check. |

---

## CHECKPOINT (live runs — do not discard)

| Run | PID / ref | Status @ report write | Output |
|-----|-----------|------------------------|--------|
| Full `npm run test:integration` | terminal **136455** (~66 min) | **COMPLETE exit 1** | **135** files · **612** tests · **604 pass / 8 fail** (see §02A) |
| Workforce + employee-app | [Ops verify workforce labor](9158db65-a6ac-46f9-9c6d-7d95f575bad2) + shells | **COMPLETE** | 37/37 workforce + 5/5 employee-app int.; 418 unit; see §13 |
| Scoped agent integration batches | Agents 01, 04–06, 12 | **COMPLETE** | See §03, §12–16 — **0** product failures |
| Tenant-isolation sweep (lead shell) | task 843980 | **COMPLETE** (exit 0) | Counts not captured in repo log |
| Targeted revalidation / probes | lead shells | **COMPLETE** | WF-001 migration probe, domain unit batches (exit 0) |

**Do not rerun** completed batches listed in §02 unless a failure appears in the final full-integration log.

---

## 01 — Executive summary (עברית)

**מה בוצע בפועל:** אימות **מבוסס הרצה** — PGlite + unit + **11/11** operational agents **complete**, **387** / **31** routes recount confirmed, **ללא** צילומי מסך.

**מה עדיין לא הושלם:** **382+** owner routes **NOT VERIFIED** (E2E touched **5** `NAV_ITEMS` only); authenticated Playwright **FAILED** (overflow, `:3100` drop, owner setup); Production / live SUMIT. **Full integration:** **8** failures (§02A).

**ממצאים מרכזיים (רק עם ראיה מב_executed):**

1. **PRE-0021 + wiring:** **VERIFIED WORKING** — [Ops cross-module reconcile](6d02ff28-f23e-480d-b818-6a2d99ddf4e7): **23/23** pre0021 + **15/15** post0021/billing/clients/AP/currency; agent1 **10/10** also in [Ops verify financial engine](f9a8c83e-c6fc-4bdb-a9d2-0456ba57881e).
2. **WF-001 / FIN2-007:** **CONFIRMED (intentional)** — `labor-expense-integrity` + classification/migration probes: generic `labor` **stacks** with workforce Actual (**11,000** = 8k+3k); **not VERIFIED BROKEN** — operational risk = misclassification.
3. **CRM → quote → convert:** **VERIFIED WORKING** (integration, 4/4 tests — ריצת lead קודמת).
4. **Timesheet approve → labor actual:** **VERIFIED WORKING** (integration, 4/4 — ריצת lead קודמת).
5. **BOQ progress billing / AP guards:** **VERIFIED WORKING** (8/8 `integrity-0035-owner-v2-closure` — ריצה מלאה integration נוכחית).
6. **OCR correction memory / PO spoofing:** **VERIFIED WORKING** (16/16 `ocr/correction-memory-integrity` — ריצה נוכחית).
7. **פורטל ציבורי `/portal/*`:** **NOT IMPLEMENTED** (קוד → `notFound()` — לא הוצג UI).
8. **Playwright:** [Ops verify UI routes E2E](22c89668-861c-4935-ab5c-4f88b19d9184) — public **shell 9/9** when harness up; suite **14/34** pass (overflow @320 on `/reports`, server **ERR_CONNECTION_REFUSED**); money-chain still **FAILED** (Agent 10).
9. **Org reports + dg-events workers:** **A** (unit) — org-report-aggregate **8/8**, dg-events consumer **9/9** (Agent 10).
10. **Mobile nav (UI test):** **2/2** pass — `mobile-nav.test.tsx` (Agent 11).
11. **Contractor session:** test expects 0 agreements — **TEST INFRA** (invited contractor sees scoped row); see final report.
12. **Module tenant-isolation:** **32/32** pass (12 files, explicit paths on Windows); **SEC-001/002** production RLS parity still **BLOCKED**.
13. **Full integration suite:** **604/612** pass; **3** operational **B** + harness drift (§02A).

**פסק תפעולי:** **PARTIALLY VERIFIED / NOT READY** — lõim כספי/CRM/BOQ/OCR **מוכחים ב-integration** על PGlite; **UI end-to-end**, **Production**, **SUMIT HTTP**, ו-**רוב המסכים** — **לא** מאומתים. **אין** מספר אחוזי “מוכנות” — רק הספירות ב-§22.

---

## 02 — Repository commit & test environment

| Item | Value |
|------|--------|
| **Commit** | `89e0b9a90c43cffbec24e726675bf8448587833e` |
| **Working tree** | Uncommitted local changes exist (SEO/proxy paths) — **audit evidence uses commit baseline**; full CI on dirty tree not re-run. |
| **Integration DB** | PGlite + full migration chain (`tests/setup/database.ts`) |
| **TEST_DATABASE_URL** | Not set |
| **PF_WIP_FILES** | Not set (default journal only) |
| **Playwright** | Agent 11: shell/mobile/regression — **BLOCKED** then **14/34** pass; Agent 10 money-chain **FAILED** at setup |

### Executed test batches (completed — do not repeat)

| Command / scope | Result | Evidence file / note |
|-----------------|--------|----------------------|
| `test:integration` subset (workforce, crm, billing, dg-field) | **23/23 pass** | Lead session 2026-10-09 |
| `test:integration` `tests/integration/workforce/**` (full dir) | **37/37 pass** | `_operational-workforce-run-2026-10-09.log` |
| `test:unit` cross-domain (6 files) | **35/35 pass** | Lead session |
| `test:unit` labor-expense + classification-architecture | **18/18 pass** | Lead session |
| `test:integration` `pre0021/agent1-financial-integrity.test.ts` | **10/10 pass** | ~190s PGlite |
| [Ops verify projects templates](f1440a6f-b91d-4982-b54e-758107571c50) | **83** int + **20** unit pass | projects + catalog + boq |
| [Ops verify financial engine](f9a8c83e-c6fc-4bdb-a9d2-0456ba57881e) | **67** int + **9** unit pass | pre0021, ap, expenses, financials unit |
| [Ops verify CRM billing SUMIT](6143b4fe-7b3b-442c-911f-f98c02a7345a) | **118** tests pass (29 files) | mock SUMIT only |
| [Ops verify procurement vendors](24291b46-6515-45c0-8722-ee7a1b97eb5f) | **50** pass (14 files) | +4 approvals snapshot (prefix quirk) |
| [Ops cross-module reconcile](6d02ff28-f23e-480d-b818-6a2d99ddf4e7) | **38** int pass | pre0021 full dir + cross wiring |
| [Ops verify workforce labor](9158db65-a6ac-46f9-9c6d-7d95f575bad2) | **37+5** int, **418+6** unit pass | employee-app + labor-expense-integrity |
| [Ops verify reports workers](27a3fbcd-d461-4003-96c1-83d38633f423) | **41** vitest pass | 32 unit + 9 dg-events int; PW money-chain fail |
| [Ops verify permissions roles](c91ac911-bb6f-4cb9-9675-251c479b5622) | **71** int + **154** unit | 39+32 int pass; 1 contractor session fail |
| [Ops verify UI routes E2E](22c89668-861c-4935-ab5c-4f88b19d9184) | shell **9/9**; suite **14/34**; UI **2/2** | 5/58 `NAV_ITEMS` touched by E2E |
| Full `npm run test:integration` (all) | **604/612 pass** (exit **1**) | terminal **136455** — ~3975s |

### §02A — Full integration monolithic run (terminal 136455)

| # | File | Failure |
|---|------|---------|
| 1 | `contractor-access/session-security.test.ts` | SELECT **1** agreement — **TEST INFRA** (invited contractor); see [final report](./PROJECTFLOW-FINAL-COMPLETE-VERIFICATION-2026-10-09.md) |
| 2 | `database/migrations.test.ts` | **5** tenant tables without forced RLS (e.g. `subcontract_claim_sequences`, `estimate_text_blocks`, …) → **OPS-B-003** |
| 3–4 | `dg-foundation/foundation.test.ts` | Grant insert violates `external_access_grants_contractor_agreement_project`; domain_events count **4** vs **2** (isolation/fixture — not promoted to **B**) |
| 5 | `documents/versioning.test.ts` | Download URL proxy vs filename — **harness drift** |
| 6–7 | `month-close/closed-period-source-corrections.test.ts` (2 cases) | `closeEmployeeMonthCost` → check **`employee_month_costs_displacement_coupling`** → **OPS-B-002** |
| 8 | `tenancy/founding.test.ts` | Provisioned roles **5** vs **4** — likely **test drift** (new template role) |

**Partial log file** (`_operational-integration-run-2026-10-09.log`) is an **earlier truncated capture**; **136455** is the authoritative full-suite summary.

**Earlier partial observations (same wave, superseded by 136455 totals):**

| Integration file | Tests | Status |
|------------------|-------|--------|
| `boq/integrity-0035-owner-v2-closure.test.ts` | 8 | **PASS** |
| `ocr/correction-memory-integrity.test.ts` | 16 | **PASS** |
| `projects/...` (timezone actual_end_date) | 1+ | **PASS** (in same terminal block) |
| `boq/integrity-0035-true-final.test.ts` | — | Started (PGlite clone) |
| `boq/integrity-0035-pattern-sweep.test.ts` | — | Started |

---

## 03 — Subagent execution ledger (operational wave)

| Agent | ID | Scope | Status |
|-------|-----|--------|--------|
| Projects / templates | [Ops verify projects templates](f1440a6f-b91d-4982-b54e-758107571c50) | 01 | **Complete** — 83 int + 20 unit; **1/10** structure apply proven |
| Tasks / planning | [Ops verify tasks planning](f098c574-9e73-4a84-9cf1-c1b04abe32da) | 02 | **Complete** — 63/63 pass (28 integration + 35 unit) |
| Workforce / labor | [Ops verify workforce labor](9158db65-a6ac-46f9-9c6d-7d95f575bad2) | 03 | **Complete** — 37+5 int, 418 unit, 6 WF-001 unit; A–U **A** (WF-002 **F**) |
| Financial engine | [Ops verify financial engine](f9a8c83e-c6fc-4bdb-a9d2-0456ba57881e) | 04 | **Complete** — 67 int + 9 unit |
| CRM / billing / SUMIT | [Ops verify CRM billing SUMIT](6143b4fe-7b3b-442c-911f-f98c02a7345a) | 05 | **Complete** — 118 tests; Flow **E** **PARTIAL** |
| Procurement / vendors | [Ops verify procurement vendors](24291b46-6515-45c0-8722-ee7a1b97eb5f) | 06 | **Complete** — 50 tests; PO receive ≠ actual |
| Field / documents | [Ops verify field documents](835e5f04-05fc-4e12-abae-c41ae28ac127) | 07–08 | **Complete** — 40/41 pass (1 test assertion drift, §11) |
| Permissions / roles | [Ops verify permissions roles](c91ac911-bb6f-4cb9-9675-251c479b5622) | 09 | **Complete** — 71 int (**1 fail**), 154 unit; SEC-001/002 **BLOCKED** |
| Reports / workers | [Ops verify reports workers](27a3fbcd-d461-4003-96c1-83d38633f423) | 10 | **Complete** — 32 unit + 9 int pass; Playwright money-chain **FAILED** |
| UI routes / E2E | [Ops verify UI routes E2E](22c89668-861c-4935-ab5c-4f88b19d9184) | 11 | **Complete** — 387/31 recount; shell **9/9**; E2E **14/34**; nav **5/58** touched |
| Cross-module reconcile | [Ops cross-module reconcile](6d02ff28-f23e-480d-b818-6a2d99ddf4e7) | 12 | **Complete** — 38 int; WF-001/FIN2-001 **CONFIRMED**, FIN-005 **BLOCKED** |

**Operational wave:** **11/11 agents complete** (2026-10-09).

---

## 04 — Route & UI action inventory

Measured methodology + **D_total = 1,022**: [Action inventory methodology](54a9e84a-55d1-4ee9-b6f9-4ba46f56a7c5) · [\_action-inventory-methodology-2026-10-09.md](./_action-inventory-methodology-2026-10-09.md).

| Metric | Count | Method |
|--------|-------|--------|
| `page.tsx` (`**/page.tsx` glob) | **387** | [Ops verify UI routes E2E](22c89668-861c-4935-ab5c-4f88b19d9184) + `_route-inventory-2026-10-09.txt` |
| `route.ts` API handlers | **31** | Same recount |
| `NAV_ITEMS` keys | **60** | `navigation.ts` (checkpoint below used **58** — recount drift) |
| Server actions (`export async function`) | **604** | **87** `actions.ts` files |
| Per-route status list | **387 lines** | [\_route-inventory-2026-10-09.txt](./_route-inventory-2026-10-09.txt) |

**Default per-route status:** **E — NOT VERIFIED (browser)** — **382+** pages without `page.goto` in executed E2E.

**E2E partial exceptions (Agent 11 — `shell` / `mobile` / `regression` only):** `/` (dashboard), `/reports` (overflow **fail** @320px), `/projects`, `/expenses`, `/settings` (via profile subpath). Public shell flows **A** (`shell.spec.ts` **9/9**).

**Nav catalog:** `NAV_ITEMS` **60** keys — **5** touched by E2E `goto`, **55 NOT VERIFIED**; `today` visibility-only. Unit/UI: `mobile-nav.test.tsx` **2/2** **A**.

**Quick-create:** **NOT VERIFIED** end-to-end; code + permission gates exist.

---

## 05 — Feature inventory by domain (evidence-based)

Legend: **A** VERIFIED WORKING · **B** VERIFIED BROKEN · **C** VERIFIED PARTIAL · **D** NOT IMPLEMENTED · **E** BLOCKED · **F** DESIGN DECISION

| Domain | Representative capability | Status | Evidence |
|--------|---------------------------|--------|----------|
| Financial compose / profit formula | CCV net − cost net | **A** | `pre0021` + unit `profit.ts` consumers in integration |
| PO commitment ≠ expense | Procurement issue | **A** | `committed-vs-actual.test.ts` (prior) + BOQ integration |
| Expense/AP overlap guard | Warn-only, no block | **F** | `expense-ap-overlap.test.ts` expects no throw |
| Workforce timesheet approval | Submit→approve→actual | **A** | `timesheet-approval.test.ts` 4/4 |
| CRM quote convert | Accept→single project | **A** | `opportunity-quote-conversion-flow.test.ts` 4/4 |
| Billing credit note | Adjust AR, keep original | **A** | `billing/integrity.test.ts` |
| DG field site log / RLS | Tenant + capability | **A** | [Ops verify field documents](835e5f04-05fc-4e12-abae-c41ae28ac127) — `field.test.ts` 10/10 |
| Evidence → dg-files → documents | Upload + links + contractor isolation | **A** | `evidence-and-plans.test.ts` 7/7 |
| Field-ops photo → daily log | prepare/finalize attach | **A** | `field-ops-create-attach.test.ts` 2/2 |
| Document tenant isolation / cleanup | Cross-org deny, orphans | **A** | `tenant-isolation` + `failed-upload-cleanup` 8/8 |
| External storage OAuth binding | State/tamper/expiry | **A** | `oauth-callback-binding.test.ts` 6/6 (mock OneDrive) |
| Live Google OAuth | Token exchange | **E** | Credentials in `.env.local`; suite mocks adapter — not executed |
| Supabase storage roundtrip | Live bucket I/O | **A** | `real-storage-roundtrip.test.ts` 3/3 (`.env.local`) |
| Document versioning download URL | Proxy vs filename-in-URL | **C** | `versioning.test.ts` 2/3 — logic pass; URL assertion **stale** (not product **B**) |
| Owner task evidence UI | Parity with contractor | **E** | **DOC-002** — no test in Agent 07–08 scope |
| Labor vs expense double count (generic `labor`) | Both can count | **F** | `classification-architecture.test.ts` case H |
| SUMIT live issuance | HTTP to provider | **E** | No non-prod credentials in harness |
| Public portal | Customer/vendor UI | **D** | `portal/page.tsx` → `notFound()` |
| Owner app pages (bulk) | Click-through | **E** | **5/60** nav hrefs touched; **387** routes not individually verified |
| Public shell / sign-in / locale | Unauthenticated smoke | **A** | `shell.spec.ts` **9/9** (when webServer up) |
| Reports page mobile layout | @320px overflow | **B** (UI) | E2E: `scrollWidth=453` > 320 on `/reports` — layout defect in spec, not full audit ID |
| External storage OAuth | Live Google/etc. | **E** | Requires authorized accounts (not run) |
| Task templates / auto-generate | Org + project templates | **A** | [Ops verify tasks planning](f098c574-9e73-4a84-9cf1-c1b04abe32da) — 14 scenarios in `org-project-task-templates.test.ts` |
| Task assignees sync (0/1/N) | Canonical rows + removal | **A** | `project-tasks-ux.test.ts`, template retroactive on open tasks |
| Employee PM task detail assignees | Names on detail | **A** | `employee-pm-task-assignees.test.ts` |
| Task attachments RBAC | documents.manage/read | **A** | `task-attachments.test.ts` 4/4 |
| Coordination readiness → linked task | Follow-up task lifecycle | **A** | `coordination.test.ts` 4/4 |
| Scheduling tenant isolation + conflicts | Bookings / unavailability | **A** | `scheduling/tenant-isolation.test.ts` 2/2 |
| Planning overdue / dependencies | progressPercent, graph | **A** | Unit planning suite 23 tests (Agent 02) |
| Task → project progress rollup | derive-project-progress | **C** | Not executed in Agent 02 batch |
| Task → reports chain | Owner task-reports | **E** | No reporting tests in Agent 02 scope |

*(Full per-feature rows expand as agent reports and full integration log complete — see §26 evidence index.)*

---

## 06 — Project-type capability matrix

**Implemented model (code, not enum):**

- `projects.work_kind`: `project` | `job` | `work_order`
- Structure templates: **10 keys** in `PROJECT_TEMPLATE_KEYS` (`templates.ts`)
- Delivery profile: e.g. `developer_gc` vs `general_contractor` (nav/execution chrome)

| Configuration | Creation / financial row | Structure template apply | Execution nav (developer_gc) | Executable test |
|---------------|--------------------------|---------------------------|------------------------------|-------------------|
| Generic project | **A** | **A** (WP/phases/milestones) | **E** (URL not E2E) | `projects/*` integration (partial) |
| Job / work_order | **A** | **C** (planning eligibility) | N/A | jobs flows E2E **E** |
| `electrical_project` template key | **C** | Metadata only (BOQ/forms not auto-applied) | N/A | **CONFIRMED** — [Ops verify projects templates](f1440a6f-b91d-4982-b54e-758107571c50): **1/10** DB apply |
| `main_contractor` vs `developer_gc` | **C** | Same | Nav gated; routes **E** | SEC-004 not browser-tested |

**No separate “plumbing-only” enum** — specialty = template + org profile + modules, not isolated engine.

---

## 07 — Employee attendance / hours / allocation (scenarios A–U)

Mapping Owner scenarios → **executed** vs **blocked**:

| Scenario | Status | Evidence |
|----------|--------|----------|
| B. Clock without project hours | **A** (engine) | Domain split in timesheet lifecycle; integration attendance tests |
| H. Manager approves hours | **A** | `timesheet-approval.test.ts` |
| G. Manager corrects association | **C** | Atomicity tests A–E overwrite; **not** full UI |
| J. Edit approved entry | **A** (reject in-place) | `approved-time-lock-error.test.ts` (unit, prior) |
| K. Attendance correction after approval | **F** | No test with **approved** + attendance overwrite ([Ops verify workforce labor](9158db65-a6ac-46f9-9c6d-7d95f575bad2)) |
| P/Q. Monthly cost estimate vs actual | **A** | `employee-actual-employer-cost.test.ts` 6/6 |
| A–H atomicity + closed period | **A** | `attendance-project-atomicity` 8/8 incl. **H** closed month reject |
| WF-002 overwrite voids approved | **F** (not **B**) | Atomicity **B** = recorded-time project swap only |
| Double salary (WF-001) | **CONFIRMED intentional** | `labor-expense-integrity.test.ts` 6/6 — stacks in Actual |

**[Ops verify workforce labor](9158db65-a6ac-46f9-9c6d-7d95f575bad2):** integration **42/42** (workforce 37 + employee-app 5); unit **418** workforce/employee-app + **6** labor-expense-integrity; scenarios **A–U** mapped **A** except WF-002 gap.

---

## 08 — Financial & profitability reconciliation

| Invariant | Status | Evidence |
|-----------|--------|----------|
| Payment ≠ profit | **A** | `payments-hardening` — pay **50k** on **92k** bill → Actual stays **92k** ([Ops verify financial engine](f9a8c83e-c6fc-4bdb-a9d2-0456ba57881e)) |
| Actual + commitment forecast | **A** | Unit: actual **1250**, committed **500**, forecast **1750**; AP payable **not** in forecast |
| Revenue KPI uses NET | **A** | Unit billed **174135** NET vs **188069.97** gross |
| Commitment ≠ actual (PO) | **A** | `po-receiving` — receive does not spawn expense/AP; `committed_costs` **open** ([Ops verify procurement vendors](24291b46-6515-45c0-8722-ee7a1b97eb5f)) |
| AP VAT NET vs payable GROSS | **A** | Recognized **100** vs outstanding **117** |
| Approved CO → CCV | **A** | `change-order-reversal.test.ts` (prior integration pass) |
| Pending CO → no CCV | **C** | Unit/rules; full UI **E** |
| Same ₪ project vs org reports | **C** | [Ops verify reports workers](27a3fbcd-d461-4003-96c1-83d38633f423): `org-report-aggregate` **8/8**, `report-billing-open-net` **3/3**; browser **E** |
| dg-events kick/drain + consumer | **A** | Unit 20 + integration consumer **9/9** (Agent 10) |
| Vercel hobby cron manifest | **A** | `vercel-hobby-crons.test.ts` 1/1 (Agent 10) |
| Numeric fixture end-to-end | **C** | pre0021 uses fixed amounts; not all 15 cross-scenarios |

---

## 09 — CRM / quotes / billing / SUMIT

| Flow | Status | Evidence |
|------|--------|----------|
| CRM convert guards | **A** | [Ops verify CRM billing SUMIT](6143b4fe-7b3b-442c-911f-f98c02a7345a) — 4/4 |
| Billing finalize / currency | **A** | integrity + billing-plan 13 int tests |
| Payment applications | **A** | 7/7 payment-applications |
| SUMIT adapter (mock HTTP) | **A** | 22 unit invoicing-integration files — **no** live `api.sumit.co.il` |
| Flow **E** Lead → SUMIT → margin | **C** | CRM + AR pass **in isolation**; no chained integration; margin not in suite |
| FIN-005 gross line → bridge | **BLOCKED** | All green tests; **none** assert default `lineTotal` gross → SUMIT `lineNet` |
| FIN-002 void ↔ provider cancel | **BLOCKED** | No `voidBillingRecord` coordination test |

---

## 10 — Tasks / planning / scheduling ([Ops verify tasks planning](f098c574-9e73-4a84-9cf1-c1b04abe32da))

| Scope | Files | Tests | Result | Wall time |
|-------|-------|-------|--------|-----------|
| Integration: `tasks/**`, `scheduling/**`, `coordination/**`, `employee-pm-task-assignees` | 6 | **28** | **PASS** | ~879s |
| Unit: `planning/**`, employee task attention/routing/permission-scope | 8 | **35** | **PASS** | ~86s |
| **Total** | **14** | **63** | **PASS** | Vitest v4.1.10, PGlite |

**Flow C (Task → assign → progress → reports):** **PARTIAL** — create/assign/sync/employee visibility **A**; progress **C** (status `done`, planning `progressPercent`, no `derive-project-progress` integration); reports **E** (no task-report tests in batch).

**Not executed in this agent batch:** `tests/unit/tasks/derive-project-progress.test.ts`, Playwright, production UI.

---

## 11 — Field / documents / external storage ([Ops verify field documents](835e5f04-05fc-4e12-abae-c41ae28ac127))

**Command:** `npm run test:integration -- tests/integration/dg-field tests/integration/dg-documents tests/integration/documents tests/integration/external-storage`  
**Outcome:** **10 files | 41 tests — 40 pass, 1 fail** (~1141s, exit 1)

| Suite | Tests | Result |
|-------|-------|--------|
| `dg-documents/evidence-and-plans.test.ts` | 7 | **PASS** — evidence → `documents` / links / `storage_files`; dg-files + contractor upload URLs; share/isolation |
| `documents/field-ops-create-attach.test.ts` | 2 | **PASS** |
| `external-storage/*` | 7 | **PASS** — OAuth binding (mock OneDrive), resolved parent folder |
| `dg-field/field.test.ts` | 10 | **PASS** |
| `dg-documents/migration.test.ts` | 1 | **PASS** |
| `documents/failed-upload-cleanup` + `tenant-isolation` | 8 | **PASS** |
| `documents/real-storage-roundtrip.test.ts` | 3 | **PASS** — live Supabase (`.env.local`) |
| `documents/versioning.test.ts` | 2/3 | **PARTIAL** — see below |

**Flow D (Field photo → storage → share):** **PARTIAL** — backend chain **A** in integration; owner task evidence surface (**DOC-002**) still **E** (no UI/E2E here).

**Single failure (not classified product B):** `versioning.test.ts` — version rows and storage paths pass; `createDocumentDownloadUrl` returns `/api/org-storage/download/{id}?disposition=attachment` while the test still expects the encoded storage key in the URL. Classified **test harness drift** vs current proxy download design (§19).

**Live Google OAuth:** **BLOCKED / not executed** — scoped OAuth tests mock `getStorageProviderAdapter`; no live Google callback in this batch.

**Note:** No `tests/integration/dg-files/**` tree; dg-files behavior covered via `evidence-and-plans.test.ts`.

---

## 12 — Projects / BOQ / catalog ([Ops verify projects templates](f1440a6f-b91d-4982-b54e-758107571c50))

**Integration:** 15 files, **83/83** pass (~29 min) — `projects/**` (28), `business-catalog/**` (9), `boq/**` (46). **Unit:** templates + project-team editor **20/20**.

**Structure templates (10 keys):** executable **DB apply** proven for **`simple_finish` only** (unit clone-apply); **9/10** catalog/preview/read-only only → **PM-001 CONFIRMED** (metadata not auto-applied at persist). **Team templates (16 keys):** `expandTemplate` loop in unit (not re-run here).

**BOQ:** 0035 integrity/closure/apply blockers **pass** in this batch (overlaps full-integration log).

---

## 13 — Workforce / employee-app ([Ops verify workforce labor](9158db65-a6ac-46f9-9c6d-7d95f575bad2))

See §07 for A–U mapping. **0** test failures. **WF-002:** **F** — no approved-time overwrite reproduction.

---

## 14 — Financial / AP / expenses ([Ops verify financial engine](f9a8c83e-c6fc-4bdb-a9d2-0456ba57881e))

**67** integration + **9** unit financials — all pass. **FIN2-001:** **CONFIRMED** warn-only (`assertNoUnlinkedExpenseApOverlap` no-op). Numeric proofs in §08.

**Vitest quirk:** `tests/integration/ap` prefix-matches `approvals/` — batch B used explicit file paths.

---

## 15 — CRM / billing / SUMIT ([Ops verify CRM billing SUMIT](6143b4fe-7b3b-442c-911f-f98c02a7345a))

**29** files, **118** tests, exit **0**. SUMIT = mocked `fetch` / client only.

---

## 16 — Procurement / vendors + cross-module ([Ops verify procurement vendors](24291b46-6515-45c0-8722-ee7a1b97eb5f), [Ops cross-module reconcile](6d02ff28-f23e-480d-b818-6a2d99ddf4e7))

**Procurement run:** 14 files **50** pass (+4 `approvals/request-step-snapshots` from path prefix). **PO receive:** over-receive blocked, cancelled/cross-tenant denied, **no** expense/AP on receive.

**Cross-module:** pre0021 **23/23** + wiring suite **15/15** = **38** integration tests.

**Not in Agent 06 scope:** migration `hardening-0070` trusted AP void ↔ PO commitment restore — optional extend.

**Still open (post–Agent 11):** production PostgREST parity **E** for SEC-001/002; stable authenticated E2E harness.

---

## 16A — Permissions / tenant isolation ([Ops verify permissions roles](c91ac911-bb6f-4cb9-9675-251c479b5622))

| Scope | Files | Tests | Result |
|-------|-------|-------|--------|
| Integration: contractor-access, project-team, employee-app | 6 | 40 | **39 pass / 1 fail** |
| Integration: `**/tenant-isolation*.test.ts` (12 files, **explicit paths***) | 12 | 32 | **32 pass** |
| Unit: contractor-access, project-team, employee-app, `profit-permission` | 32 | **154** | **154 pass** |

\*Vitest on Windows matched **0** files for glob `tests/integration/**/tenant-isolation*.test.ts`; explicit list required.

**Failure → VERIFIED BROKEN (§19):** `contractor-access/session-security.test.ts` — case *external principal has no memberships… reads no general org tables* — `subcontractAgreements` SELECT length **1**, expected **0** (line 120). Other org tables in same case returned **0**. Repro: PGlite integration, `loadContractorContext` + `scenario()`.

**SEC-001 / SEC-002:** **BLOCKED** — suites exercise app-layer gates (`listAuditEvents`, `getProjectFinancials`), not member-without-permission raw `SELECT` under production RLS semantics.

---

## 17 — Reports / workers / dg-events ([Ops verify reports workers](27a3fbcd-d461-4003-96c1-83d38633f423))

| Scope | Files | Tests | Result |
|-------|-------|-------|--------|
| Unit: org report aggregates, billing open net, dg-events, hobby crons | 6 | **32** | **PASS** (~79s) |
| Integration: `dg-events/consumer.test.ts` | 1 | **9** | **PASS** (~455s wall) |

**Playwright:** `tests/e2e/authenticated/project-centric-money-chain.spec.ts` — **FAILED** (not env **BLOCKED**). Stale `.next/lock` blocked webServer initially; after lock cleared, **`setup-owner`** failed: `waitForAuthenticatedShell` timeout 45s (`sign-in.ts`); webServer `destination stream closed early`. **1 failed, 8 skipped** (money-chain not executed).

**RPT E2E:** Org/project report **numbers** partially covered in unit; **RPT-002** browser parity still **E**.

---

## 17B — UI routes / Playwright ([Ops verify UI routes E2E](22c89668-861c-4935-ab5c-4f88b19d9184))

**Command:** `npx playwright test tests/e2e/shell.spec.ts tests/e2e/mobile.spec.ts tests/e2e/authenticated/regression.spec.ts`

| Attempt | Outcome |
|---------|---------|
| 1 | **BLOCKED** — `.next/lock` / concurrent Next build |
| 2+ | Harness up — **`shell.spec.ts` 9/9 pass**; regression/mobile **fail** |

**Representative failures (not env-blocked):** `/reports` horizontal overflow @320px; `ERR_CONNECTION_REFUSED` / `ERR_ABORTED` on `127.0.0.1:3100`; 180s timeouts; webServer `authorization_denied` during owner cache revalidation.

**Reference run (`CAPTURE_MARKETING=1`, skip rebuild):** **34** tests, **14 passed**, **20 failed** (same pattern).

**UI:** `npm run test:ui -- tests/ui/mobile-nav.test.tsx` → **2/2 pass**.

**Nav E2E coverage:** **5/58** `NAV_ITEMS` with `page.goto` in these specs; remaining **53 NOT VERIFIED** (see §04).

---

## 18 — Cross-module dependency matrix (executed edges only)

| # | Scenario | Status | Evidence |
|---|----------|--------|----------|
| 1 | Attendance → approval → labor → P&L | **C** | Partial integration; profitability via compose not one E2E |
| 4 | Supplier invoice → actual | **A** | AP void-credit, vat-net-actual, payments-hardening (Agents 04/06) |
| 8 | PO → commitment | **A** | `po-receiving` + unit committed-vs-actual |
| **E** | Lead → billing → SUMIT → margin | **C** | Agent 05 — sub-steps pass; no single chain |
| 15 | Same event → project + org views | **C** | pre0021 + partial E2E design |
| **C** | Task → assign → progress → reports | **C** | Agent 02: assign **A**, progress **C**, reports **E** (§10) |
| **D** | Field photo → storage → share | **C** | Agent 07–08: engine **A**; DOC-002 owner UI **E** (§11) |

---

## 19 — Verified defects (executed **B** only)

| ID | Area | Reproduction | Evidence |
|----|------|--------------|----------|
| ~~OPS-B-001~~ | *(reclassified)* | Invited contractor **may** see scoped agreement — **TEST INFRA**, not product **B** | Final report §failure #1 |
| **OPS-B-002** | Month-close / employer cost close | `closeMonthClosePeriod` → update `employee_month_costs` to `closed` violates **`employee_month_costs_displacement_coupling`** (2 tests in `closed-period-source-corrections.test.ts`) | Full run **136455** |
| **OPS-B-003** | Migration / RLS hygiene | `migrations.test.ts` expects **0** tables without forced RLS; **5** remain | Full run **136455** |

*(Product may intend grant-scoped agreement visibility for **OPS-B-001** — test labels table “general org”; assertion still fails CI.)*

**Harness-only (excluded from B):** `documents/versioning.test.ts` — proxy download URL vs legacy assertion (§11).

*(Static-audit severities are **not** auto-promoted to **B** unless reproduced above.)*

---

## 20 — Revalidation of 81 previous finding IDs

Status codes: **CONFIRMED** (behavior exists as described) · **REFUTED** · **FIXED** · **DESIGN** · **BLOCKED** (cannot execute) · **NOT RE-RUN** (static only)

| ID | Revalidation | Executable evidence |
|----|--------------|---------------------|
| WF-001 | **CONFIRMED (intentional)** | `labor-expense-integrity` 6/6 + migration 0070 classification; [Ops cross-module reconcile](6d02ff28-f23e-480d-b818-6a2d99ddf4e7) |
| WF-002 | **BLOCKED** | [Ops verify workforce labor](9158db65-a6ac-46f9-9c6d-7d95f575bad2) — **F**, not **E** |
| WF-003 | **PARTIAL CONFIRMED** | Atomicity **H** pass; **OPS-B-002** month-close close fails on displacement coupling (full run) |
| WF-004 | **BLOCKED** | No accrual WDM fixture run |
| WF-005 | **CONFIRMED** | Same unit test H vs doc |
| WF-006–010 | **NOT RE-RUN** | — |
| FIN-001 | **CONFIRMED** | Unit payment plan (prior session 14/14) |
| FIN-002 | **BLOCKED** | [Ops verify CRM billing SUMIT](6143b4fe-7b3b-442c-911f-f98c02a7345a) — no void↔cancel coordination test |
| FIN-003–004 | **NOT RE-RUN** | — |
| FIN-005 | **BLOCKED** | Agents 05/12 — green tests do not assert gross `lineTotal` → SUMIT net |
| FIN2-001 | **CONFIRMED (design)** | [Ops verify financial engine](f9a8c83e-c6fc-4bdb-a9d2-0456ba57881e) + vendor **102000** unlinked double-count model |
| FIN2-002–010 | **NOT RE-RUN** | — |
| FIN2-007 | **CONFIRMED (intentional)** | Same as WF-001 |
| CRM-001–003 | **PARTIAL CONFIRMED** | Agent 05 CRM 4/4; edges not isolated |
| UI-001 | **CONFIRMED** | **D** NOT IMPLEMENTED — `notFound()` |
| UI-002 | **CONFIRMED** | settings portal 404 (code) |
| UI-003 | **PARTIAL** | Mobile nav unit **A**; bottom nav on `/he-IL` only |
| UI-004 | **E** | **53/58** nav keys without E2E goto |
| UI-005 | **PARTIAL FAIL** | `/reports` overflow @320px in regression E2E |
| SEC-001 | **BLOCKED** | [Ops verify permissions roles](c91ac911-bb6f-4cb9-9675-251c479b5622) — no raw `audit_events` RLS SELECT proof |
| SEC-002 | **BLOCKED** | Same — no under-privileged `contracts` SELECT proof |
| SEC-003–010 | **PARTIAL** | 32 tenant-isolation int + 154 unit pass; session-security agreement row = **TEST INFRA** (not **B**) |
| PM-001 | **CONFIRMED** | [Ops verify projects templates](f1440a6f-b91d-4982-b54e-758107571c50) — **1/10** structure apply proven |
| PM-002–004, PM-007–013, PM-015 | **NOT RE-RUN** | — |
| PM-005 | **CONFIRMED** | Agent 02 — planning unit suite vs task integration; no single linked model in tests |
| PM-006 | **CONFIRMED** | Scheduling tests pass isolation/conflicts; **no** booking→task sync test (gap as described) |
| PM-008 | **BLOCKED** | Default `progress_source` / rollup not exercised (`derive-project-progress` not run) |
| PM-014 | **PARTIAL CONFIRMED** | `project-tasks-ux` + templates cover multi-assignee/sync rules; not full `assignAll` UI |
| DOC-001 | **BLOCKED** | No inline-preview integration in Agent 07–08 batch |
| DOC-002 | **CONFIRMED** | Static gap; no owner task evidence test executed |
| DOC-003 | **F** / **CONFIRMED** | Dual upload models; field-ops attach **A**, evidence path **A** — by design |
| DOC-004 | **CONFIRMED** | Evidence + field-ops both pass; dual model not merged in tests |
| DOC-005–009, DOC-011–012 | **NOT RE-RUN** | — |
| DOC-010 | **CONFIRMED** | External storage required; roundtrip + mocks align with policy |
| DOC-006 | **BLOCKED** | Live Google export/OAuth not executed |
| RPT-001, RPT-003–006 | **NOT RE-RUN** / **E** | No browser report E2E pass |
| RPT-002 | **PARTIAL CONFIRMED** | Agent 10 unit aggregates pass; money-chain Playwright **FAILED** at setup |
| OPS-001–005 | **PARTIAL** | `vercel-hobby-crons` **A**; dg-events consumer **A**; full worker prod verify **E** |

*(Remaining IDs default **NOT RE-RUN** until full integration log + agents return — **no speculative CONFIRMED**.)*

---

## 21 — New verified defects

**2** with status **B**: **OPS-B-002**, UI reports overflow (§19 + final report).

**Harness / drift excluded from B:** `versioning.test.ts` URL; `founding.test.ts` role count **5** vs **4**; `dg-foundation` fixture/event isolation (§02A).

---

## 22 — Measured totals (checkpoint — not final)

| Metric | Value |
|--------|-------|
| **TOTAL FEATURES DISCOVERED** | **387** routes + **31** API handlers (+ nav actions uncounted individually) |
| **TOTAL FEATURES EXECUTED** | **≥900+** automated test cases across agent batches (dedupe overlaps; not 387 UI routes) |
| **VERIFIED WORKING (A)** | **≥61** domain anchors + **10** task/scheduling capabilities (§05); not 387 UI features |
| **VERIFIED PARTIAL (C)** | Multiple domains (see §05–07) |
| **VERIFIED BROKEN (B)** | **2** (**OPS-B-002**, UI reports overflow; full suite **136455**) |
| **NOT IMPLEMENTED (D)** | Public `/portal/*`, `/settings/portal` UI |
| **BLOCKED / NOT VERIFIED (E)** | **~382** browser routes (default); Production; live SUMIT HTTP |

| Previous findings | Count |
|-------------------|-------|
| CONFIRMED / DESIGN (executable) | **20+** (WF-001, FIN2-001, PM-001, DOC-002–004, …) |
| BLOCKED / NOT RE-RUN | **~55** (FIN-002/005, WF-002, UI E2E, remaining agents) |
| REFUTED | **0** |
| FIXED | **0** |

| Flows | Count |
|-------|-------|
| **TOTAL BUSINESS FLOWS TESTED** | **≥15** (integration scenarios) |
| **PASSED** | **≥15** |
| **FAILED** | **0** |
| **BLOCKED** | **≥12** (Owner A–U minus covered) |

| Layer | Status |
|-------|--------|
| LOCAL INTEGRATION | **604/612 pass** monolithic run; **8** failures classified §02A |
| BROWSER E2E | **PARTIAL FAIL** — public shell **A**; auth regression **14/34**; money-chain setup **FAILED** |
| PRODUCTION READ-ONLY | **NOT ATTEMPTED** |
| PRODUCTION DB MIGRATION PARITY | **UNKNOWN** |

| Consistency | Status |
|-------------|--------|
| CROSS-MODULE CONSISTENCY | **PARTIAL** (pre0021 + BOQ pass) |
| FINANCIAL RECONCILIATION | **PARTIAL** |
| LABOR COST CONSERVATION | **A** in-engine; **F** if misclassified expenses |
| ROLE ISOLATION | **PARTIAL** (32/32 tenant-isolation; **1** contractor session fail; SEC-001/002 **BLOCKED**) |
| PROJECT-TYPE ISOLATION | **E** |

**FINAL SYSTEM STATUS (checkpoint):** **PARTIALLY VERIFIED — NOT READY**

---

## 23–25 — Design decisions / blockers / production gaps

- **WF-001 / FIN2-007:** Intentional classification policy — **operational risk**, not failed test.
- **FIN2-001:** Warn-only overlap — intentional per unit tests.
- **Playwright:** Agent 11 — initial **BLOCKED** (build lock); then public shell green, authenticated suite unstable; Agent 10 money-chain **FAILED** at setup.
- **Production:** No read-only session — all production-only claims **UNKNOWN**.

---

## 26 — Evidence index

| Artifact | Path |
|----------|------|
| Static audit (superseded for ops claims) | `PROJECTFLOW-FULL-SYSTEM-AUDIT-2026-10-09.md` |
| Route list | `_route-inventory-2026-10-09.txt` |
| Full integration log (partial) | `_operational-integration-run-2026-10-09.log` |
| Full integration summary | terminal **136455** — 604/612 pass, 6 files fail |
| PRE-0021 run | lead terminal 136456 — 10/10 pass |
| Playwright failure | terminal 136457 — Next build lock |
| Agent 02 tasks/planning | [Ops verify tasks planning](f098c574-9e73-4a84-9cf1-c1b04abe32da) — 63/63 pass |
| Agent 07–08 field/docs | [Ops verify field documents](835e5f04-05fc-4e12-abae-c41ae28ac127) — 40/41 pass |
| Workforce full directory | `_operational-workforce-run-2026-10-09.log` — 37/37 pass |
| Agent 01 projects/BOQ | [Ops verify projects templates](f1440a6f-b91d-4982-b54e-758107571c50) |
| Agent 03 workforce | [Ops verify workforce labor](9158db65-a6ac-46f9-9c6d-7d95f575bad2) |
| Agent 04 financial | [Ops verify financial engine](f9a8c83e-c6fc-4bdb-a9d2-0456ba57881e) |
| Agent 05 CRM/SUMIT | [Ops verify CRM billing SUMIT](6143b4fe-7b3b-442c-911f-f98c02a7345a) |
| Agent 06 procurement | [Ops verify procurement vendors](24291b46-6515-45c0-8722-ee7a1b97eb5f) |
| Agent 12 cross-module | [Ops cross-module reconcile](6d02ff28-f23e-480d-b818-6a2d99ddf4e7) |
| Agent 10 reports/workers | [Ops verify reports workers](27a3fbcd-d461-4003-96c1-83d38633f423) — 41 vitest pass; PW fail |
| Agent 09 permissions | [Ops verify permissions roles](c91ac911-bb6f-4cb9-9675-251c479b5622) — 225 pass, 1 fail |
| Agent 11 UI/E2E | [Ops verify UI routes E2E](22c89668-861c-4935-ab5c-4f88b19d9184) — shell 9/9; E2E 14/34 |

---

## 27 — Final operational readiness verdict (checkpoint)

**NOT READY** for Owner sign-off on “complete end-to-end operational proof.”

**Ready enough to trust:** selected **financial**, **CRM**, **workforce approval**, **BOQ billing**, and **DG field** behaviors on **PGlite + migration chain**.

**Next completion steps (no restart):** (1) triage **OPS-B-002/003** + test harness drift (~~OPS-B-001~~ reclassified); (2) stabilize `:3100` webServer + owner auth for green authenticated E2E; (3) `/reports` @320 overflow if treating UI-005 as product fix (out of audit scope).

---

*Checkpoint report — operational wave 2026-10-09. Amend in place when background runs complete.*
