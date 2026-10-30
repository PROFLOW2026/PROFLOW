# EXLFY — Contextual info wave 2 (2026-10-31)

Site-wide completion pass. **Dashboard excluded** — no edits to `home-dashboard*`, `dashboard-kpi*`, `dashboard-*` sections under financials, or dashboard app settings panels tied to home.

## Shared kit (extended)

- `MainAppSection` — `descriptionMode: 'info'` (default): section help behind (i).
- `FormRow` (RFI + coordination) — field hints in info dialog; validation via `error` (visible).
- Existing: `PageHeader`, `Field`, `ContextualInfo`, `ContextualInfoLabel`.

## Modules touched (wave 2)

| Module | Files / areas |
|--------|----------------|
| Expenses | `expense-form.tsx` — allocation, policy, preview, intent hints |
| Financial reports | `recognized-cost-breakdown-view`, `cash-paid-breakdown-view` |
| AP | `ap-bills-org-list-view` outstanding filter note |
| Projects | `project-create-form` FormSection, `project-360-summary` metrics |
| Clients | `client-profitability-panel` |
| RFI / coordination | `form-controls`, `rfi-create-form` |
| Settings | `catalog-panel`, `MainAppSection` consumers |
| (Wave 1 retained) | Billing, vendors, tasks nav, overview KPIs, etc. |

## Dashboard guarantee

Zero file changes under dashboard-specific paths listed above. `MainAppSection` / `PageHeader` defaults do not affect dashboard (dashboard does not use those for KPI chrome).

## Tests

ESLint on touched UI modules.

## Deploy

Record SHA after push.
