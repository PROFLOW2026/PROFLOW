# BUG-008 — tasks.work_package_id composite FK (PREPARED ONLY)

**Status:** SQL prepared (fail-closed, **no auto-unlink**) — **not applied to Production**. Stop for separate Owner SQL approval.

| Field | Value |
|-------|--------|
| FILE | `drizzle/migrations/0204_tasks_work_package_composite_fk.sql` |
| JOURNAL | `drizzle/migrations/meta/_journal.json` idx **202**, tag `0204_tasks_work_package_composite_fk` |
| PURPOSE | Enforce same org + project for `tasks.work_package_id` via composite FK (DG pattern) |
| DATA MUTATION | **No** — incompatible rows abort the migration; attributions are not NULLed |
| SCHEMA MUTATION | Yes — drop `tasks_work_package_id_work_packages_id_fk`; add CHECK + `tasks_work_package_org_project_fk` |
| RISK | Medium — apply fails until incompatible rows are resolved manually |
| READY FOR OWNER REVIEW | YES |

```
SQL / MIGRATION PREPARED = YES
FILE = drizzle/migrations/0204_tasks_work_package_composite_fk.sql
PURPOSE = Composite FK tasks.work_package_id → work_packages(id, organization_id, project_id)
DATA MUTATION = NO (fail-closed preflight; no automatic unlink)
SCHEMA MUTATION = YES
RISK = MEDIUM
READY FOR OWNER REVIEW = YES
```

**Do not run** `npm run db:migrate`, Drizzle migrate, or any apply against Production/shared DB until the Owner explicitly approves this SQL after review.
