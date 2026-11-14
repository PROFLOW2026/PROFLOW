# RUNTIME_COVERAGE_MATRIX — EXLFY regression audit (2026-11-14)

**Environment:** Local disposable DB only (`postgres://127.0.0.1:5432/projectflow_e2e`). **Not Production.**  
**Playwright workers:** 1.  
**Primary evidence:** `RUN_LOG_FULL.txt`, `RUN_LOG_VIEWPORT.txt`, `RUN_LOG_PORTAL.txt`, `RUN_LOG_BUSINESS2.txt`, `RUN_LOG_PDF.txt`, `BUSINESS_FLOWS_RESULTS.md`, `PDF_MOBILE_WAVE2.md`, `screenshots/viewports/`, `screenshots/pdf/`, `playwright-report/`.

| Area | Viewport / check | Status | Reason / evidence |
|------|------------------|--------|-------------------|
| **Harness bootstrap (PGlite)** | — | **UNVERIFIED** | Windows wire PGlite (`56542` etc.): `ECONNRESET` + sign-in error boundary — no authenticated runtime |
| **Harness bootstrap (Postgres)** | — | **PASS** | `setup-owner` + suites after `scripts/.reset-e2e-postgres-db.mjs` + settle |
| **Owner dashboard** | 1440 (release-smoke) | **PASS** | `release-smoke` Hebrew shell |
| **Owner dashboard** | 320/375/390/768/1280 | **PASS** | Viewport smoke + screenshots; FAB @≤390 |
| **Owner dashboard** | **360 / 430 / 1920** | **PASS** | Wave2 `exlfy-viewport-gaps` + `dashboard-{360,430,1920}.png` |
| **Owner dashboard** | Dark @390 | **PASS** | `dashboard-390-dark.png` |
| **Projects list / hubs** | 1440 | **PASS** | `release-smoke` + business-flows `projects.hubs` |
| **Projects list** | 390 | **PASS** | `mobile-shell-audit` projects-list |
| **Project overview / team / documents** | 390 | **PASS** | `mobile-shell-audit` |
| **Project files alias / financials** | 390 | **FAIL** | Late-run `MOBILE_NAV` timeout — harness unstable after long serial batch |
| **Project infra hub** | 320–1280 | **PASS** | Viewport smoke + screenshots |
| **Plans / PDF open (interactive)** | — | **HARNESS** | Wave2: no seeded PDF URL; company-files reconnect error; OCR job not selected — `PDF_MOBILE_WAVE2.md` |
| **PDF geometry (unit)** | — | **PASS** | `bug-03` transform/scroll probe |
| **PDF touch pan (device)** | — | **UNVERIFIED** | Code gaps documented; no live viewer + no device lab |
| **Expenses list** | 1440 | **PASS** | `release-smoke` + business-flows `expenses.list` |
| **Expenses detail / create / payment** | 1440 | **HARNESS / UNVERIFIED** | Detail `goto` timeout after list; create/payment not reached — `BUSINESS_FLOWS_RESULTS.md` |
| **Expenses** | 320–1280 | **PASS** | Viewport smoke + screenshots |
| **Payments (billing)** | — | **UNVERIFIED** | Route not in focused specs this run |
| **Vendors / AP** | — | **UNVERIFIED** | Not exercised |
| **Work / tasks** | 390 | **FAIL** | `mobile-shell-audit` work route timeout (late batch) |
| **Work hub / task create** | 1440 | **HARNESS / UNVERIFIED** | Work tab select flaky; create not reached — business-flows |
| **Calendar / field / reports / quotes-new** | 390 | **FAIL** | Same late-batch timeouts |
| **Company files** | 390 / 1280 | **HARNESS** | Wave2: storage reconnect banner (browse); late-batch mobile FAIL earlier |
| **Workforce — employees discoverability** | 390 | **FAIL** | `workforce-discoverability` timeouts (late batch) |
| **Workforce — scheduling** | 390 | **PASS** | `overnight-surfaces` (skip duplicate in wave2) |
| **Workforce — time approvals** | 390 | **PASS** | `overnight-surfaces` |
| **Workforce — attendance / payroll** | — | **UNVERIFIED** | Routes not hit in passing tests |
| **Safety** | 390 | **PASS** | `overnight-surfaces` |
| **Notifications** | 390 | **PASS** | `overnight-surfaces` |
| **Procurement / RFQ** | 1440 | **HARNESS / UNVERIFIED** | List goto timeout; seed RFQ id is placeholder |
| **RFI / defects** | 1440 | **HARNESS** | `/projects/:id/rfi` + `/defects` nav status 0 — business-flows |
| **Infra (org / mapping)** | 320–1280 | **PASS** | Project `?tab=infra` viewport smoke |
| **Mobile shell — bottom nav** | 390 | **FAIL** | `mobile.spec` in degraded full batch |
| **Mobile shell — FAB vs bottom nav** | 390 / ≤430 | **PASS** | Isolated FAB + dashboard gaps FAB @360/430 |
| **Mobile shell — More sheet** | 390 | **FAIL** | `mobile.spec` `net::ERR_ABORTED` late batch |
| **Mobile HUD stability (overflow)** | 390 | **PARTIAL** | 5/13 `mobile-shell-audit` routes PASS before degradation |
| **Contractor portal** | 390 | **PASS login** / prior overflow FAIL = **HARNESS** | `THREE_SURFACE_RUNTIME.md` — scrollWidth OK; intentional `overflow-x: clip` |
| **Employee app** | 390 | **PASS** (`single99`); opspm **HARNESS** | `THREE_SURFACE_RUNTIME.md` |
| **Payments / money chain** | — | **UNVERIFIED** | `project-centric-money-chain` not run (runtime budget) |

## Viewport screenshot index

Under `screenshots/viewports/`: `dashboard-*` (incl. **360, 430, 1920**), `expenses-*`, `project-infra-*`, `dashboard-390-dark.png`. PDF attempt shots under `screenshots/pdf/`.

## Interpretation notes

1. **Early vs late failures:** Desktop and first mobile-shell routes pass on a fresh harness; failures after ~25 minutes in one serial job correlate with server stress / navigation aborts — split runs (as in viewport + portal slices) are more reliable on this machine.
2. **PGlite:** Documented **UNVERIFIED** for Owner-authenticated runtime on Windows in this audit; Postgres disposable DB is the effective harness for evidence here.
3. **Portal failures** may reflect seed/harness gaps or real product issues — separate from main-app smoke that passed on fresh runs.

## Rerun recipe (audit-only)

```powershell
node scripts/.reset-e2e-postgres-db.mjs
$env:E2E_DATABASE_MODE='postgres'
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e'
$env:DIRECT_DATABASE_URL=$env:DATABASE_URL
$env:E2E_FORCE_FRESH_SERVER='1'
$env:E2E_SKIP_BUILD='1'
$env:E2E_HARNESS_SETTLE_MS='15000'
npx playwright test --config docs/audits/evidence/exlfy-full-regression-2026-11/runtime/playwright.regression.config.ts --workers=1 ...
```

Config + audit specs live only under this `runtime/` folder.
