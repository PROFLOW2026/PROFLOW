# Connected projects schema

Canonical DDL and RLS live in **`drizzle/migrations/0179_connected_projects.sql`**.

Do not add ad-hoc columns on `connected_project_mappings`; use joins to `subcontract_agreements_store` for agreement fields (see `mapping.repository.ts`).
