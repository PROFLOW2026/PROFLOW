# Workforce labor cost — product alignment (WF-005)

ProjectFlow recognizes **project labor actual** from approved project time and optional **monthly employer-pool allocation** (displacement). This is **not** payroll and **not** statutory accounting.

## Sources of truth

| Layer | Document / code |
|-------|-----------------|
| Mode B vs Mode C integrity | [`LABOR-COST-INTEGRITY.md`](./LABOR-COST-INTEGRITY.md) |
| Monthly allocation & displacement | Same doc §5 + `employer-month-costs` / `labor-recognition` |
| Optional month close | Month close locks snapshots; retro uses corrections / `month_close_adjustments` — **no mandatory close** |
| OPS-B-002 | Draft `time_snapshot` rows are **locked** at month close, not silently reclassified to `monthly_allocated` |

## User-facing rules

- Approved project time counts toward project labor cost; pending time does not.
- Attendance sync may create draft project hours; org setting `attendanceProjectTimeApproval` defaults to **draft**.
- Managers with scope may approve directly; employees submit for approval (§R).
- Employer actual cost corrections preserve total employer cost (WF-001 / `labor-expense-integrity`).

## Regression

- `tests/unit/financials/labor-expense-integrity.test.ts` (6/6)
- `tests/integration/audit-verification/ops-b-002-month-close-displacement.test.ts`
- `tests/integration/audit-verification/closed-period-source-corrections.test.ts`
