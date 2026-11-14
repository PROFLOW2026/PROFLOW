# BUG-02 — Runtime evidence (isolated harness)

**Date:** 2026-11-14  
**Scope:** Read-only product code; evidence only under this folder. No Production DB.  
**User symptom:** `[locale]/error.tsx` → “משהו השתבש” on payroll approval deep link.

---

## Classification (browser E2E, 2026-11-14)

| Probe | Classification | Evidence |
|-------|----------------|----------|
| Deep link **with** `paymentId` + EMC history + unpaid payroll | **VERIFIED PASS** | `logs/playwright-with-paymentId.json`, `.png` |
| Deep link **without** `paymentId` (same employee) | **HARNESS FAILURE** | HTTP 500 + `CONNECT_TIMEOUT 127.0.0.1:5432` mid-run |
| Flight Date serialization as sole crash cause | **DISPROVEN** | Flight harness + browser mount succeeded |
| Owner symptom “משהו השתבש” on this seeded shape | **NOT REPRODUCED** on disposable `projectflow_e2e` | — |

**Exact failing action (owner report):** open  
`/he-IL/workforce/employees/{id}?yearMonth=YYYY-MM&focus=payroll&paymentId={uuid}`  
when EMC history exists.

**Exact action in this harness:** same deep link after audit EMC+payroll seed → **page 200**, payroll panel + month review + “אשר ששולם” visible, **no** `משהו השתבש`, **no** `pageerror`.

---

## Hypothesis under test

> RSC→client pass of `MonthlyEmployerCostReview` `initialReview` with Drizzle `Date` fields causes **Flight serialization failure**.

---

## Verdict summary

| Claim | Status | Confidence |
|-------|--------|------------|
| `EmployeeMonthCostRow` / loader returns `Date` for `timestamp(..., { mode: 'date' })` | **PROVEN** (PGlite) | High |
| Owner page passes raw `monthReview` → `initialReview` on client `MonthlyEmployerCostReview` | **PROVEN** (static) | High |
| `showMonthReview` true when any EMC history exists (payroll path mounts month review) | **PROVEN** (shape + PGlite + browser) | High |
| Employee **without** EMC history → `showMonthReview === false` | **PROVEN** (PGlite) | High |
| `Date` in `initialReview` breaks React Flight RSC→client serialization | **DISPROVEN** | High |
| Browser shows “משהו השתבש” on deep link with seeded EMC + `paymentId` | **DISPROVEN on this seed** (VERIFIED PASS) | Medium–High for this shape |
| Crash needs different EMC/run/line shape, prod-only data, or non-Date throw | **HYPOTHESIS** | — |
| Prod stack / digest for owner incident | **UNVERIFIED** | — |

**Root-cause confidence (salary approval crash):** **Low** for “Flight Date serialization” as primary cause (disproven in Flight harness **and** browser mount). Crash may still exist under a **different data shape** or client throw (`money()` / `businessDate()` / allocation lines) — not observed with draft EMC + unpaid payroll seed.

---

## 1. Schema & prop path (static) — PROVEN

- `employee_month_costs`: `lockedAt`, `createdAt`, `updatedAt` → `timestamp(..., { mode: 'date' })` (`drizzle/schema/workforce.ts`).
- `loadMonthlyEmployerCostReview` returns `month`, `months`, `run`, `lines` as Drizzle `$inferSelect` rows.
- Owner detail: `initialReview={monthReview}` on client `MonthlyEmployerCostReview` when `payrollPayment` and `showMonthReview`.
- `showMonthReview = canReadRates && Boolean(monthReview?.month \|\| monthReview?.months?.length > 0)`.

---

## 2. Serialization probes — DISPROVEN for Date-only crash

### Unit-style + Flight harness

- `serialize-probe.test.ts`, `flight-rsc-props.harness.mjs`
- Flight encode succeeded with `$D` Date tags; `flightErrors: []`.

---

## 3. PGlite integration — PROVEN Date shapes

- `bug-02-pglite.integration.test.ts` → `logs/pglite-*.json`

---

## 4. Playwright browser (postgres `projectflow_e2e`) — RUN COMPLETE

### Seed (E2E world had no EMC/payroll)

Default `tests/e2e/harness/seed.ts` creates workforce employees but **no** `employee_month_costs` / `employee_payroll_payments`.

**Audit-only seed:** `seed-emc-payroll.mjs` → `bug-02-emc-seed.json` / `logs/emc-payroll-seed.json`

Creates in **projectflow_e2e only**:

- Employee `BUG02 EMC Payroll Employee` in primary org
- 2× `employee_month_costs` (2026-09 history + 2026-10 target) with timestamptz
- 1× unpaid `employee_payroll_payments` (`due`, 2026-10)

### Auth harness note

Developer `.env.local` bake + missing/corrupt `.next` blocked `next start` and cloud Auth. Workarounds used (evidence-only):

- `BUG02_USE_NEXT_DEV=1` → `start-app-dev-for-bug02.mjs` (`next dev`)
- `owner-auth-stub.setup.ts` rewrites `*.supabase.co` → `http://127.0.0.1:55321`

### Commands run

```powershell
node scripts/.reset-e2e-postgres-db.mjs
$env:BUG02_USE_NEXT_DEV='1'
$env:E2E_DATABASE_MODE='postgres'
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e'
$env:DIRECT_DATABASE_URL=$env:DATABASE_URL
$env:E2E_FORCE_FRESH_SERVER='1'
$env:E2E_SKIP_BUILD='1'
$env:E2E_HARNESS_SETTLE_MS='20000'
npx playwright test --config docs/audits/evidence/exlfy-full-regression-2026-11/runtime/playwright.regression.config.ts --workers=1 --project=bug02-setup-owner --project=bug02-payroll
```

Logs: `runtime/RUN_LOG_BUG02.txt`, `bug-02/logs/playwright-run.txt`

### Results

| Test | Result | Notes |
|------|--------|-------|
| `bug02-setup-owner` auth rewrite | PASS (43s) | |
| Deep link **with** `paymentId` | PASS (1.9m) | status 200; `sawGenericError=false`; payroll + month review + confirm visible; confirm attempt `afterError=false` |
| Deep link **without** `paymentId` | FAIL assert / **HARNESS** | status 500; server `CONNECT_TIMEOUT` to Postgres; blank screenshot |
| Employees list control | did not run | blocked by prior fail |

### Stack / capture paths

| Artifact | Path |
|----------|------|
| With paymentId capture | `bug-02/logs/playwright-with-paymentId.json` |
| With paymentId screenshot | `bug-02/logs/playwright-with-paymentId.png` |
| Confirm attempt | `bug-02/logs/playwright-with-paymentId-confirm-attempt.json` |
| Without paymentId capture | `bug-02/logs/playwright-without-paymentId.json` |
| Seed fixture | `bug-02/bug-02-emc-seed.json` |
| Run log | `runtime/RUN_LOG_BUG02.txt` |
| pageerror stacks | **none** on with-paymentId path (`pageErrors: []`) |

Server noise during with-paymentId (not surfaced as error boundary):  
`Error: The destination stream errored while writing data` (digest `4179401964`) — Next/dev stream; page still rendered OK.

---

## What remains plausible (not proven here)

- **Client render throw** on a **different** EMC/run/lines shape (applied allocation, null money, bad date string).
- **Server throw** outside the page `try/catch` on a rare path.
- **Environment-specific** prod-only data / older build — not observed in this harness.
- Owner incident may require **repro data dump** from Production (read-only) to match shape.

---

## Evidence file index

| Path | Purpose |
|------|---------|
| `seed-emc-payroll.mjs` | Audit-only EMC + payroll seed (`projectflow_e2e`) |
| `owner-auth-stub.setup.ts` | Auth stub rewrite when `.next` baked to cloud Supabase |
| `start-app-dev-for-bug02.mjs` | `next dev` app starter when production build missing |
| `bug-02-payroll-deep-link.spec.ts` | Browser probes |
| `playwright.bug02.config.ts` | Isolated config (prefer regression config on this machine) |
| `fixtures/month-review-shape.ts` | Realistic review + serializer mirror |
| `serialize-probe.test.ts` / `flight-rsc-props.harness.mjs` | Date / Flight probes |
| `bug-02-pglite.integration.test.ts` | Loader + gate behavior |
| `logs/*` | Machine-readable outputs + screenshots |

**Product code changes:** none.
