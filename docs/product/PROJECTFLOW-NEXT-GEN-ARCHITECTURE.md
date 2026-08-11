# ProjectFlow — Next Generation Architecture (Lead)

**Status:** Overnight run authority  
**Date:** 2026-08-11  
**Owner:** Lead / Integrator only for schema + shared financials

---

## Absolute rules

1. **One economic work entity:** `projects` row. Labels: Project / Job / Work Order via `work_kind` + UX. No second Actual engine.
2. **Quote ≠ Billing ≠ Change Order ≠ Revenue.**
3. **Material/equipment usage ≠ Actual** unless one explicit existing cost-recognition path says otherwise (V1: operational only).
4. **Attendance / Assignment / Engagement / PO commitment ≠ Actual.**
5. **Advanced features optional** via module visibility + permissions. Simple orgs keep Dashboard / Projects|Jobs / Expenses / Time / Billing.
6. **Migrations 0000–0023 immutable.** New = `0024+` only. **No owner `db:migrate`.**
7. **No commit / push / PR / prod deploy** in this overnight run.

---

## Work entity unification

| Label | `work_kind` | Notes |
|-------|-------------|-------|
| Project | `project` | Large / planned work |
| Job | `job` | Short / daily work |
| Work Order / Service Call | `work_order` | Service layer; same financials |

Side table `project_service_details` holds schedule window, priority, checklist link, dispatch fields. Financial Actual/Forecast still from `compose-project-financials`.

---

## Migrations (Lead-owned)

| # | File | Domains |
|---|------|---------|
| 0024 | `0024_next_gen_permissions_modules_work_entity.sql` | Permissions, optional modules, `work_kind` extend, business profile settings, terminology keys |
| 0025 | `0025_quotes_estimates.sql` | Quotes + lines |
| 0026 | `0026_service_dispatch_recurrence.sql` | Service details, recurrence, dispatch indexes |
| 0027 | `0027_approvals_month_close_budgets.sql` | Approvals, month close, budgets/revisions |
| 0028 | `0028_forms_usage_command_recurring.sql` | Field forms, material/equipment usage, command-center state, recurring financial drafts |

**Retention/holdback:** DEFERRED — design in `PROJECTFLOW-NEXT-GENERATION-REPORT.md`. Recognition ≠ payable needs careful AP/AR plumbing; do not hack overnight.

---

## Permissions (coherent, not hyper-granular)

```
quotes.read | quotes.manage
service.read | service.manage | dispatch.manage
approvals.read | approvals.manage | approvals.decide
month_close.read | month_close.manage
budgets.read | budgets.manage
forms.read | forms.manage
command_center.read
```

Portal continues `portal.manage`. Public portal stays disabled unless secure auth ready.

---

## Optional modules (new)

`quotes`, `service`, `approvals`, `month_close`, `budgets`, `forms`, `command_center`

Default: off until first use or profile/preset enables.

---

## Module ownership (12 agents)

| Agent | Module path | Must NOT touch |
|-------|-------------|----------------|
| 1 Command Center | `src/modules/command-center` | migrations, financial formulas |
| 2 Month Close | `src/modules/month-close` | invent Actual |
| 3 Explainability | `src/modules/financials` slices + UI | duplicate Actual |
| 4 Budgets | `src/modules/budgets` | separate Actual formula |
| 5 Quotes | `src/modules/quotes` | treat as Billing |
| 6 Service/Dispatch | `src/modules/service` | new financial entity |
| 7 Recurring | `src/modules/service` recurrence | finalize money on generate |
| 8 Approvals | `src/modules/approvals` | generic workflow engine |
| 9 Materials/Equipment | `src/modules/assets` + procurement usage | double-count cost |
| 10 Forms | `src/modules/forms` | claim legal e-sign |
| 11 Profiles/Onboarding | `src/modules/tenancy` + imports | fork domain by industry |
| 12 Portal + Perf | `src/modules/portal` + shell perf | fake public portal |

Agents propose schema only via `SCHEMA_REQUEST.md` if gaps found; Lead lands SQL.

---

## Financial explainability + confidence

Extend `compose-project-financials` with documented breakdown slices and deterministic confidence from known incompleteness (missing employer cost, unallocated remainder, open drafts). No arbitrary AI scores.

---

## Business profiles

Presets only: module visibility, work_mix, Quick Create emphasis, terminology display keys, suggested cost categories. **Never** bypass permissions or fork financial logic.
