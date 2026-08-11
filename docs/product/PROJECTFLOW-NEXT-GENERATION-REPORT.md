# ProjectFlow — Next Generation Report

**Date:** 2026-08-11  
**Next Generation release** — owner `db:migrate` applied 0024–0029

## Status

**NEXT GENERATION MASTER RELEASE** — applied to owner Supabase; 0000–0029 immutable

## Migrations

| Range | Status |
|-------|--------|
| 0000–0023 | APPLIED + IMMUTABLE |
| 0024–0029 | APPLIED + IMMUTABLE |
| Latest | `0029_next_gen_integration_hardening` |

## What shipped

1. Owner Command Center `/today`
2. Operational month close
3. Financial explainability + data confidence
4. Project/job budgets (one Actual engine)
5. Estimates/Quotes (`estimates` tables — not change-order `quotes`)
6. Work orders + dispatch (shared `projects` entity)
7. Recurring service templates
8. Lightweight approvals (+ AP bill/credit draft gate)
9. Material/equipment usage (≠ Actual)
10. Field forms (`forms.submit` vs `forms.manage`)
11. Business profiles + import improvements
12. Global search; public portal remains **DISABLED**

## Intentionally deferred

- Retention/holdback (design only)
- Public portal auth
- Recurring financial drafts UI
- Per-line budget Actual

## Financial invariants held

Quote ≠ Revenue · Usage ≠ Actual · Attendance ≠ Actual · WO = same compose engine · Budget Actual from compose only
