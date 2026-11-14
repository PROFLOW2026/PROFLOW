# Migration 0204 — dry / isolated validation (2026-11-14)

**Verdict:** **VALIDATION PASS** on disposable local DB. **APPLY to Production / shared Supabase: BLOCKED** pending separate Owner SQL approval.

| Item | Result |
|------|--------|
| Static SQL + journal + schema parity | PASS |
| `tests/unit/database/migration-journal.test.ts` | PASS (13/13) |
| Isolated apply on `projectflow_e2e` @ `127.0.0.1` | PASS |
| Production / shared DB apply | **BLOCKED** |

Prepared doc: `docs/audits/BUG008_TASKS_WORK_PACKAGE_COMPOSITE_FK_PREPARED.md`  
SQL file: `drizzle/migrations/0204_tasks_work_package_composite_fk.sql`

---

## SQL summary (steps)

1. **Data repair `UPDATE`** — For `public.tasks` rows with non-null `work_package_id` that are incompatible with the target composite FK (task `project_id` IS NULL, or no matching `work_packages` row on `(id, organization_id, project_id)`), set `work_package_id = NULL`. Task rows are retained.
2. **CHECK** — Drop/recreate `tasks_work_package_requires_project`: `work_package_id IS NULL OR project_id IS NOT NULL` (closes MATCH SIMPLE NULL bypass).
3. **FK replacement** — Drop weak `tasks_work_package_id_work_packages_id_fk` (id-only). Add `tasks_work_package_org_project_fk` on `(work_package_id, organization_id, project_id)` → `work_packages (id, organization_id, project_id)` with `ON DELETE SET NULL (work_package_id)` (idempotent `DO` block if name missing).

**Dependencies:** Composite FK requires unique index `work_packages_id_organization_id_project_id_uq` from earlier migrations (e.g. `0020_overnight_foundations.sql`). `0203_tasks_work_package_id.sql` must already be applied (column + old FK).

---

## Journal consistency

| Check | Result |
|-------|--------|
| `meta/_journal.json` idx **202** | `tag`: `0204_tasks_work_package_composite_fk` |
| On-disk SQL | `0204_tasks_work_package_composite_fk.sql` present |
| Order after 0203 | Last journal entry; unit test asserts tail order |
| Unit suite | `npx vitest run tests/unit/database/migration-journal.test.ts` → **13 passed** |

---

## Drizzle schema parity (`drizzle/schema/tasks.ts`)

| Artifact | Schema | SQL 0204 |
|----------|--------|----------|
| FK name | `tasks_work_package_org_project_fk` | same |
| Columns | `(workPackageId, organizationId, projectId)` → WP `(id, organizationId, projectId)` | same |
| ON DELETE | `set null` (comment: partial SET NULL on `work_package_id` only) | `ON DELETE SET NULL (work_package_id)` |
| CHECK | `tasks_work_package_requires_project` | same predicate |

---

## Commands run

```text
npx vitest run tests/unit/database/migration-journal.test.ts
```

Isolated DB probe + apply (audit script, **deleted after run** — no repo artifact):

- Target: `postgres://postgres:***@127.0.0.1:5432/projectflow_e2e` only (host `127.0.0.1/32`, db `projectflow_e2e`).
- Confirmed **not** Supabase / pooler / Production.

Apply outcome on disposable DB:

- Before constraints: `tasks_work_package_id_work_packages_id_fk`
- Orphan incompatible `work_package_id` rows (pre-UPDATE predicate): **0**
- After apply: `tasks_work_package_org_project_fk`, `tasks_work_package_requires_project`; weak id-only FK removed
- Orphan count after: **0**
- Notice: `DROP CONSTRAINT IF EXISTS tasks_work_package_requires_project` — constraint did not exist pre-migration (expected on DB that had 0203 only).

**Not run:** `npm run db:migrate`, Drizzle migrate against Supabase, or any Production/shared URL.

---

## Data mutation risk

| Phase | Mutation | Reversibility |
|-------|-----------|---------------|
| Step 1 UPDATE | NULLs only invalid `work_package_id` | **Not automatically reversible** — restore from backup or re-link WP manually |
| CHECK + FK | DDL only | Reversible only via down-migration (not provided) |

**Medium risk** on Production if invalid attributions exist: affected tasks lose WP link but remain.

---

## Would FK add fail on orphan rows?

- **After** step 1: only rows that still violate composite match could block `ADD CONSTRAINT`. Step 1 is designed to clear all such rows.
- If step 1 were skipped or incomplete, **`ADD CONSTRAINT` would fail** at apply time (Postgres FK validation).
- On local `projectflow_e2e`: **0** orphans before apply → FK added successfully.

---

## E2E harness URL policy (`tests/e2e/harness/config.ts`)

Harness default: `postgres://postgres@127.0.0.1:${E2E_DATABASE_PORT}/postgres` (PGlite wire port **55432**). Regression docs also use disposable **`projectflow_e2e`** @ `127.0.0.1:5432`. Both are **local-only**; validation used **5432 / projectflow_e2e**.

---

## Stop for Owner (Production apply)

```
SQL / MIGRATION PREPARED = YES
FILE = drizzle/migrations/0204_tasks_work_package_composite_fk.sql
PURPOSE = Composite FK tasks.work_package_id → work_packages(id, organization_id, project_id)
DATA MUTATION = YES (NULL incompatible work_package_id only)
SCHEMA MUTATION = YES
RISK = MEDIUM
READY FOR OWNER REVIEW = YES

APPLY (Production / shared Supabase) = BLOCKED until Owner explicitly approves execution after reviewing this evidence and BUG008 prep doc.
Do not infer approval from implementation, commit, push, or deploy consent.
```

---

## Recovery notes (local disposable apply)

Local `projectflow_e2e` received 0204 SQL for validation only. Re-reset with `scripts/.reset-e2e-postgres-db.mjs` / harness recreate if a clean pre-0204 snapshot is needed. **No Production data touched.**