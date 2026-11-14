# Migration 0205 — electrical takeoff

## SQL / MIGRATION PREPARED = YES

**FILE** = `drizzle/migrations/0205_electrical_takeoff.sql` (+ `drizzle/schema/electrical-takeoff.ts`, journal idx 203 `0205_electrical_takeoff`)

**PURPOSE** = Add org/project-isolated tables for electrical smart takeoff: analyses, chunked plan files, jobs, immutable worker output (sheets/detections/legend/linear/warnings/artifacts), append-only edits, areas, planner symbol library, catalog overrides, rule sets, immutable approval snapshots; RLS aligned with `takeoff.*` org permissions and `ext.takeoff.*` contractor grants.

**DATA MUTATION** = Inserts/updates permission catalog keys `takeoff.view|manage|approve|library.manage` and grants them to `owner` and `manager` role templates only (employees/contractors require explicit grant). No business/takeoff row backfill.

**SCHEMA MUTATION** = New `takeoff_*` tables, indexes, guard triggers (append-only detections/edits/approvals; analyses revision guard), composite FKs to `projects` and parent takeoff rows, RLS policies + service_role grants.

**Round-2 PGlite fixes (unapplied on shared DB)** = Composite unique indexes before FK (`takeoff_rule_sets`, `takeoff_approvals`); split RLS for job-scoped vs analysis-scoped tables; authenticated write policies on `takeoff_files`, `takeoff_jobs`, `takeoff_edits`, `takeoff_areas`, `takeoff_approvals`.

**Round-4 harness** = `CREATE OR REPLACE app.external_scopes_valid` whitelist sync (includes multi-segment `ext.takeoff.library.manage`); PGlite E2E seed no longer fails `external_access_grants_contractor_scopes`.

**Round-5** = `takeoff_jobs.result_stats` (jsonb) for worker timing/classified metrics; `takeoff_warnings` populated on result ingest (replaced per job inside the ingest transaction).

**RISK** = MEDIUM — large additive surface; FK ordering requires `takeoff_rule_sets` before `takeoff_analyses.rule_set_id` FK; contractor policies assume `ext.takeoff.*` keys exist in grant JSON (no DB enum). Re-analysis orphan-edit strategy documented in `application/orphan-edit-matching.ts` (signature + position tolerance; orphans surfaced for review).

**READY FOR OWNER REVIEW** = YES (do **not** apply to Production/shared DB until explicit Owner SQL approval)

## SQL / MIGRATION PREPARED = YES (0206 amendment, local harness only)

**FILE** = `drizzle/migrations/0206_takeoff_sheets_unique_per_file.sql`

**PURPOSE** = Amends the **0205** unique index on `takeoff_sheets`: multiple source files can share the same `sheet_key` (e.g. two PDFs both use `p1`).

**SCHEMA MUTATION** = Drop `takeoff_sheets_job_sheet_uq` on `(job_id, sheet_key)`; recreate on `(job_id, file_id, sheet_key)`.

**DATA MUTATION** = none

**Apply order** = **0205 then 0206** on any environment (both require explicit Owner approval for Production/shared DB; E2E harness applies both via journal on fresh `projectflow_e2e` reset).

**RISK** = LOW (index-only); **READY FOR OWNER REVIEW** = YES