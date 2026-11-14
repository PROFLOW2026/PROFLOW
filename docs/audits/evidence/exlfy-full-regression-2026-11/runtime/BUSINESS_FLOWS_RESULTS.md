# BUSINESS_FLOWS_RESULTS — EXLFY wave 2 (2026-11-14)

**Harness:** local disposable Postgres `projectflow_e2e` @ `127.0.0.1:5432` (not Production).  
**Spec:** `exlfy-business-flows.spec.ts` · project `regression-business` · workers=1.  
**Logs:** `RUN_LOG_BUSINESS.txt`, `RUN_LOG_BUSINESS2.txt`, `_business_verdicts.json`.  
**Overnight surfaces (scheduling / safety / notifications):** skipped as already covered.

## Classification matrix

| Area | Check | Status | Evidence / reason |
|------|-------|--------|-------------------|
| Expenses — list | Open `/he-IL/expenses`, seeded row `כבלים וחומרי חשמל` | **VERIFIED PASS** | Annotation `expenses.list` |
| Expenses — open seeded detail | `GET /expenses/{expenseId}` | **HARNESS** | `page.goto` timeout 45s on detail URL after list PASS |
| Expenses — create draft | `/expenses/new` saveAsDraft | **UNVERIFIED** | Blocked by early return after open HARNESS in same test |
| Expenses — finalize / payment UI | confirmPaid / markPaid observe | **UNVERIFIED** | Not reached this wave (open timeout) |
| Projects — hubs | Five hubs on seeded project | **VERIFIED PASS** | Annotation `projects.hubs` |
| Projects — work hub / seeded task | Tab `עבודה` + title `הכנת לוח חשמל ראשי` | **HARNESS** | `aria-selected=true` wait failed after click |
| Tasks — create / status | Board create + status change | **UNVERIFIED** | Not reached after work-hub HARNESS |
| Work list | `/he-IL/work` | **UNVERIFIED** | Not reached |
| Procurement — list | `/he-IL/procurement` | **HARNESS** | `page.goto` timeout 45s |
| Procurement — RFQ detail | Seeded `rfqId` | **UNVERIFIED** | Seed placeholder `rfqId === projectId` (no real RFQ); list never reached |
| Quality — RFI list | `/projects/:id/rfi` | **HARNESS** | Navigation status 0 / timeout |
| Quality — defects list | `/projects/:id/defects` | **HARNESS** | Navigation status 0 / timeout |

## Playwright outcome

| Run | Result |
|-----|--------|
| `RUN_LOG_BUSINESS2.txt` | **5/5 tests PASS** (soft early-return on HARNESS — suite green does **not** mean all areas VERIFIED) |

## Interpretation

1. Fresh harness can open **expenses list** and **project hubs** reliably (matches prior `release-smoke`).
2. Subsequent same-worker navigations to expense detail, procurement, and quality often **time out** (`HARNESS`) — same pattern as late-batch mobile degradation; prefer one-area isolated slices for deeper money/task writes.
3. RFQ/RFI/defect **detail IDs** in `.audit-route-fixtures.json` are mostly projectId placeholders when seed has no rows — classify detail as **UNVERIFIED** even when list eventually loads.
4. No Production; no migrations applied.

## Rerun

```powershell
node scripts/.reset-e2e-postgres-db.mjs
$env:E2E_DATABASE_MODE='postgres'
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e'
$env:DIRECT_DATABASE_URL=$env:DATABASE_URL
$env:E2E_FORCE_FRESH_SERVER='1'
$env:E2E_SKIP_BUILD='1'
$env:E2E_HARNESS_SETTLE_MS='25000'
npx playwright test --config docs/audits/evidence/exlfy-full-regression-2026-11/runtime/playwright.regression.config.ts --workers=1 --project=setup-owner --project=regression-business
```
