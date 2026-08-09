# Organization Forecast / Reconciliation

**Status:** Wave 3 Agent 3 — **IMPLEMENTED** (2026-08-09)  
Legend: **CURRENT** | **IMPLEMENTED** | **KNOWN LIMITATION**

Closes Wave 2 L1: home/org dashboard lacked full forecast reconciliation.

---

## Org KPIs (all eligible base-currency active projects)

| KPI | Definition |
|-----|------------|
| Total Current Contract Net | Σ project Current Contract Net |
| Actual Project Cost | Σ project Actual |
| Allocated Overhead | Σ project overhead Actual (allocated onto projects) |
| Remaining Commitments | Σ open / partial PO remaining |
| Expected Remaining | Σ project ETC |
| Forecast Final Cost | Σ (Actual + Remaining Commitments + ETC) |
| Actual Margin | Σ (CCV − Actual) |
| Forecast Margin | Σ (CCV − Forecast Final) |

No 50-project correctness cap. `limit` / `offset` on rollup page **rows only**.

---

## Unallocated organization costs

**IMPLEMENTED:** Finalized base-currency organization/shared/overhead expense NET that has not landed on any project is exposed as:

- **Unallocated Business Costs**
- synonym: **Costs Awaiting Allocation**

These amounts are **not** forced into project Actual or project profit.

---

## Reconciliation (expense layer)

```text
PROJECT-TOUCHING EXPENSE NETS
  (direct project expenses + allocation lines targeting projects)
+
UNALLOCATED ORGANIZATION COSTS
=
ORGANIZATION FINALIZED EXPENSE TOTAL
  (base currency)
```

Workforce Mode C labor is project cost only and sits **outside** this expense equation.

Foreign-currency expenses follow existing base-currency exclusion rules.

---

## Code entry points

- `get-home-dashboard.ts` → `forecast: OrganizationForecastSummary`
- `get-organization-project-rollup.ts` → full eligible set
- `aggregate-org-report.ts` → commercial / cost / profit aggregates
- `org-cost-reconciliation.ts` → unallocated math
- `get-organization-reports-analytics.ts` → reports projection + disclosures

---

## KNOWN LIMITATION

- Full Gate not run (owner hold)
- Annual overhead amortization schedule still deferred (see COST-ALLOCATION-MODEL)
