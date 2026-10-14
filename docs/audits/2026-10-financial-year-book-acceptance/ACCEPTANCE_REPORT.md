# Financial Year Book — Final Acceptance Gate (2026-10-12)

**Scope:** Read-only validation against Production data for owner org **מתח ח.י הנדסת חשמל בע״מ** (`8ef9e353-…`).  
**Artifact:** `docs/audits/2026-10-financial-year-book-acceptance/ספר_כספי_2026_acceptance_run.xlsx` (+ JSON `acceptance-report.json`).

---

## Executive status

| Gate | Result |
|------|--------|
| Financial parity (12 months vs engine) | **PASS** — `allMonthsMatch: true` |
| XLSX structure (14 sheets, RTL, no UUID) | **PASS** |
| Excel Desktop open | **ATTEMPTED** — `Start-Process` launched; **לא אומת ויזually על ידי הסוכן** (קובץ עלול להיות נעול ב-Excel במהלך ריצה חוזרת) |
| Permissions / org isolation (code review) | **PASS** |
| Performance (owner org, post-fix) | **WARN** — ~21s load + ~0.1s build (~22s total); מתחת ל-60s Vercel Pro אך קרוב עם cold start |
| Typecheck / Lint / Unit (targeted) | **PASS** |
| Build | See CI preflight at release (not re-run in this gate after last perf fix) |

**ACCEPTANCE FOR RELEASE:** **CONDITIONAL** — ממתין לאישור Owner + smoke ידני ב-Excel Desktop + החלטה על ~22s server time.

---

## 1. Monthly reconciliation table (2026)

All amounts **ILS**. **Book** = `loadFinancialYearBookData` summary; **Engine** = independent calls (`sumOrganizationRecognizedCostPairInDateRange`, `sumInvoicedInDateRange`, `sumCollectionTripletsInDateRange`, `getMonthCashFlow`). Tolerance **0.01**.

| Month | Phase | Recognized NET | Cash paid GROSS | Collections GROSS | Net invoiced | EMC NET | Expected commitments GROSS | Net cash | Parity |
|-------|-------|----------------|-----------------|-------------------|--------------|---------|----------------------------|----------|--------|
| 2026-01 | complete | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 2026-02 | complete | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 2026-03 | complete | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 2026-04 | complete | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 2026-05 | complete | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 2026-06 | complete | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 2026-07 | complete | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 2026-08 | complete | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 2026-09 | complete | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 2026-10 | partial | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 2026-11 | future | ✓ (0) | ✓ (0) | ✓ | ✓ | — | ✓ (62,023.69) | ✓ | PASS |
| 2026-12 | future | ✓ (0) | ✓ (0) | ✓ | ✓ | — | ✓ (22,431.20) | ✓ | PASS |

Dashboard KPI (`getHomeDashboard` selected month) matched recognized / invoiced / collections for Jan–Oct.

**Paid lines:** Sum of payment + payroll line GROSS equals engine `paidActual` for every month (no double-count in lines vs KPI).

**Overhead:** Slices sum recognized expense/AP lines by category (not a separate engine KPI).

**Profit row in Excel:** Labelled **«רווח תפעולי (חיוב נטו פחות עלות מוכרת)»** — equals `netInvoiced − recognizedNet` only. **This is not CCV/contract profit** from Business Profitability. **Not presented as recognized revenue.**

**Billing void:** After acceptance fix, **void** billing records are **excluded** from section ו (חיובים).

---

## 2. XLSX validation

| Check | Result |
|-------|--------|
| Generated via `buildFinancialYearBookWorkbook` (not legacy template) | Yes |
| 14 worksheets | Yes |
| Hebrew sheet names Jan–Dec | Yes |
| RTL all sheets | Yes |
| UUID in file bytes | **Not detected** |
| File size | ~42 KB (owner org 2026) |
| Future months commitments | Nov: 8 rows; Dec: 7 rows (expected-only) |

---

## 3. Performance (owner org, after bundle cache)

| Metric | Before cache | After `loadMonthCashFlowBundle` |
|--------|----------------|----------------------------------|
| Data load | ~39.8s | **~21.3s** |
| XLSX build | ~0.12s | ~0.14s |
| Heap delta | ~15 MB | similar |
| RSS | ~255 MB | similar |

**Note:** Still **12×** parallel month KPI queries (recognized, invoiced, collections). Further batching possible if Owner sees timeouts in Production.

**Large org:** Only owner org measured; no second tenant in this gate.

---

## 4. Permissions & isolation

| Test | Result |
|------|--------|
| Server requires `PROJECT_FINANCIALS_READ` | Yes — 403 without |
| UI hidden without permission | `FinancialYearBookExportGate` |
| No `organizationId` query override | Confirmed |
| Tenant = session active org + RLS | Confirmed |
| Billing sections without `BILLING_READ` | Empty (by design) |
| Technical fields in XLSX | Stripped / not emitted |

---

## 5. Local gates

- `npm run typecheck` — PASS (after bundle + void filter)
- `npm run lint` — PASS
- `vitest` — `month-cash-flow.test.ts`, `financial-year-book.test.ts` — PASS

---

## 6. Files touched in acceptance gate

- `scripts/acceptance-financial-year-book.ts` (new)
- `src/modules/financials/application/get-month-cash-flow.ts` — year bundle + compose from bundle
- `src/modules/financials/application/load-financial-year-book-data.ts` — use bundle; exclude void billings
- `docs/audits/2026-10-financial-year-book-acceptance/*` (artifacts, this report)

*(Prior feature files unchanged in this gate except above.)*

---

## 7. Open gaps

1. **Excel Desktop** — launch attempted; Owner should confirm layout manually once file is closed.
2. **Vercel latency** — ~22s server-side load on real data; monitor first Production exports.
3. **Official profitability metric** — Excel uses operational billing-minus-cost row only; align copy with Owner if a different label is preferred.
4. **Second org / empty org** — not exercised in this script run.

---

```
FINANCIAL PARITY = PASS
XLSX STRUCTURE = PASS
EXCEL DESKTOP = NOT VERIFIED BY AGENT (launch attempted)
PERMISSIONS = PASS
PERFORMANCE = WARN (~22s)
SQL = NO
COMMIT = NO
PUSH = NO
DEPLOY = NO
AWAITING OWNER RELEASE APPROVAL = YES
```
