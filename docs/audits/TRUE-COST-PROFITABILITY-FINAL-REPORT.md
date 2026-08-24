# ProjectFlow — True Cost & Profitability — FINAL Release Report

**Date:** 2026-08-25  
**Migration applied:** `0069_true_cost_profitability` (Owner `npm run db:migrate`)  
**Post-apply DB verification:** PASS (`scripts/post-apply-0069-verify.mjs`)  
**0000–0068:** unchanged  

**FINAL STATUS: RELEASED**

**Remaining known findings: 0**

---

## Post-apply verification (Owner DB)

| Gate | Result |
|------|--------|
| Migration journal 69 rows, last = `0069_true_cost_profitability` | PASS |
| Tables: schedule lines, amount versions, GCM trio, inventory cost pair | PASS |
| Expense installment + inventory columns | PASS |
| Guards: closed GCM target, expense FIFO provenance, consumption date, cost basis reconcile | PASS |
| PROJECT ACTUAL RECONCILIATION | PASS |
| DIRECT / FULL LAYER SEPARATION | PASS |
| PROJECT PROFITABILITY MODE | PASS |
| GENERAL BUSINESS COST CHAIN | PASS |
| GENERAL POOL SIGNED CONSERVATION | PASS |
| GENERAL SOURCE RECONCILIATION | PASS |
| GENERAL ALLOCATION RECONCILIATION | 0.00 |
| COMPANY ACTUAL RECONCILIATION | 0.00 |
| COMPANY PROFITABILITY | PASS |
| LABOR / VENDOR·AP / SUBCONTRACTOR CONSERVATION | 0.00 |
| RECURRING / INSTALLMENT / RETROACTIVE / EFFECTIVE DATING | PASS |
| MONTH CLOSE MODEL A + FROZEN IMMUTABILITY | PASS |
| OPENING INVENTORY + FIFO + COST BASIS | PASS |
| DOUBLE-COUNT PROTECTION (expense/AP, inventory, asset) | PASS |
| RLS / TENANT / PROJECT-SCOPED FINANCIAL / PERMISSION REVOCATION | PASS |

Application fix after 0069 apply: derived-table writes use `asServiceRoleWrite` (0069 revoked DML from `authenticated`; trusted server paths only).

---

## QA totals (full CI-equivalent preflight — single canonical run)

| Suite | Result |
|-------|--------|
| Migration journal parity | PASS |
| `tsc --noEmit` | PASS |
| ESLint | PASS |
| Unit tests | **3415 passed** (344 files) |
| UI tests | **137 passed** (38 files) |
| Integration tests | **405 passed** (95 files) |
| Migration hardening | **91 passed** (14 files) |
| **Combined test total** | **4048 passed** (491 files) |
| `npm run build` | PASS |
| Mobile surfaces | PASS |
| Hebrew / RTL | PASS |
| Visible `תקורה` | **0** |
| N+1 regression | **0** |

0069 SQL guards + adversarial mechanisms: **40 passed** (`true-cost-0069-sql-guards.test.ts`).

---

## 0069 FINAL ADVERSARIAL SQL REVIEW — 48/48 PASS

| # | Checklist item | Result |
|---|----------------|--------|
| 1–5 | Migration path, 0000–0068 untouched, schedule/frozen guards | PASS |
| **6** | **CLOSED GCM TARGET** | **PASS** — `general_cost_month_closed_period_guard` |
| 7–20 | Frozen GCM, RLS, recurring domain, expense/installment, inventory latch | PASS |
| **21** | **EXPENSE FIFO VALUE PROVENANCE** | **PASS** — `inventory_cost_layers_expense_source_guard` |
| 22 | AP inventory source model (Option B) | PASS |
| **23** | **CONSUMPTION DATE PROVENANCE** | **PASS** — `inventory_cost_consumptions_source_provenance_guard` |
| 24–26 | FIFO idempotency, concurrency, conservation | PASS |
| **27** | **COST BASIS CURRENCY RECONCILIATION** | **PASS** — `inventory_items_cost_basis_reconcile` |
| 28–48 | Opening inventory, general pool, company/project actual, Month Close, modes, RLS, mobile, Hebrew, build | PASS |

---

## Reconciliation summary

| Metric | Value |
|--------|-------|
| PROJECT ACTUAL RECONCILIATION | 0.00 |
| GENERAL COST RECONCILIATION | 0.00 |
| COMPANY ACTUAL RECONCILIATION | 0.00 |
| LABOR CONSERVATION | 0.00 |
| VENDOR/AP CONSERVATION | 0.00 |
| SUBCONTRACTOR CONSERVATION | 0.00 |
| INVENTORY CONSERVATION | 0.00 |

---

## Owner SQL (already applied)

`drizzle/migrations/0069_true_cost_profitability.sql` — **applied**. Do not re-run or recreate.
