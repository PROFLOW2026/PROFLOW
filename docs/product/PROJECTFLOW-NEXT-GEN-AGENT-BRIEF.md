# Next-Gen Agent Brief (Lead locked)

Repo: `c:\Users\ERAN YOSEF\Desktop\final projects\FINAL-WEB\projectflow`

## Hard rules
- NO commit, push, PR, owner `db:migrate`
- DO NOT edit `drizzle/migrations/0000`–`0023`
- DO NOT edit migration SQL files 0024–0028 (Lead-owned). If schema gap: write `SCHEMA_REQUEST.md` in your module
- Schema already landed: `drizzle/schema/next-gen.ts`, `next-gen-ops.ts`, permissions in catalog, modules in `OPTIONAL_MODULE_KEYS`
- Architecture: `docs/product/PROJECTFLOW-NEXT-GEN-ARCHITECTURE.md`
- Patterns: modules under `src/modules/<name>/{application,domain,data,ui,validation}`, pages thin in `src/app/[locale]/(app)/...`
- Auth: `assertPermission` + `PERMISSIONS.*` only
- Hebrew + English locale JSON under `src/locales/{he-IL,en}/`
- Mobile-first for field surfaces; follow existing UI primitives
- Targeted unit tests only when useful — no full gate
- One financial engine: never invent Actual from Quote / Usage / Attendance / Recurrence generate

## Shared contracts
- Work entity: `projects.work_kind` in `project|job|work_order`
- Service fields: `project_service_details`
- Quote convert → create project/job via existing project create APIs; seed contract/opening value carefully; Quote ≠ Revenue
- Budgets display Actual via `compose-project-financials` / existing getters — do not recalculate Actual
- Command Center aggregates actionable items; dismiss must not hide unresolved financial truth (snooze/handled only where safe)
- Retention/holdback: DEFERRED — do not implement
