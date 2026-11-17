# Migration 0205 — electrical takeoff

## Production status (2026-11-17)

**APPLIED on shared Production** (verified via `drizzle.__drizzle_migrations` `when` = `1794352800000` + live `takeoff_*` tables).  
Do **not** edit this SQL file — historical / immutable once applied.

Side effect: the trailing `GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated` re-opened table privileges on protected objects such as `boq_nodes`. Remediation is additive migration **0213** (`0213_boq_nodes_acl_restore_after_0205.sql`) — prepared, not yet applied.

## Original prepare record

**FILE** = `drizzle/migrations/0205_electrical_takeoff.sql` (+ `drizzle/schema/electrical-takeoff.ts`, journal idx 203 `0205_electrical_takeoff`)

**PURPOSE** = Add org/project-isolated tables for electrical smart takeoff: analyses, chunked plan files, jobs, immutable worker output (sheets/detections/legend/linear/warnings/artifacts), append-only edits, areas, planner symbol library, catalog overrides, rule sets, immutable approval snapshots; RLS aligned with `takeoff.*` org permissions and `ext.takeoff.*` contractor grants.

**DATA MUTATION** = Inserts/updates permission catalog keys `takeoff.view|manage|approve|library.manage` and grants them to `owner` and `manager` role templates only (employees/contractors require explicit grant). No business/takeoff row backfill.

**SCHEMA MUTATION** = New `takeoff_*` tables, indexes, guard triggers (append-only detections/edits/approvals; analyses revision guard), composite FKs to `projects` and parent takeoff rows, RLS policies + trailing schema-wide grants (`ON ALL TABLES` — see Production note above).

**Round-2 PGlite fixes** = Composite unique indexes before FK (`takeoff_rule_sets`, `takeoff_approvals`); split RLS for job-scoped vs analysis-scoped tables; authenticated write policies on `takeoff_files`, `takeoff_jobs`, `takeoff_edits`, `takeoff_areas`, `takeoff_approvals`.

**Round-4 harness** = `CREATE OR REPLACE app.external_scopes_valid` whitelist sync (includes multi-segment `ext.takeoff.library.manage`); PGlite E2E seed no longer fails `external_access_grants_contractor_scopes`.

**Round-5** = `takeoff_jobs.result_stats` (jsonb) for worker timing/classified metrics; `takeoff_warnings` populated on result ingest (replaced per job inside the ingest transaction).

**RISK** = MEDIUM — large additive surface; FK ordering requires `takeoff_rule_sets` before `takeoff_analyses.rule_set_id` FK; contractor policies assume `ext.takeoff.*` keys exist in grant JSON (no DB enum). Re-analysis orphan-edit strategy documented in `application/orphan-edit-matching.ts` (signature + position tolerance; orphans surfaced for review).

## 0206 amendment

**FILE** = `drizzle/migrations/0206_takeoff_sheets_unique_per_file.sql`

**Production status** = **APPLIED** (ledger `when` = `1794356400000`).

**PURPOSE** = Amends the **0205** unique index on `takeoff_sheets`: multiple source files can share the same `sheet_key` (e.g. two PDFs both use `p1`).

**SCHEMA MUTATION** = Drop `takeoff_sheets_job_sheet_uq` on `(job_id, sheet_key)`; recreate on `(job_id, file_id, sheet_key)`.

**DATA MUTATION** = none

**Apply order** = **0205 then 0206** (both already on Production as of 2026-11-17 investigation).