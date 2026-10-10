# Connected projects — schema request (PREPARED ONLY)

See `.cursor/plans/contractor_portal_product_completion.plan.md` §15. **Do not apply SQL without Owner approval.**

Application code reads `connected_project_mappings` via `data/mapping.repository.ts`. Until the migration lands, lookups return `null` (missing relation `42P01`).

Required table (minimum for embedded developer workflows):

```sql
-- connected_project_mappings
-- id uuid PK
-- developer_organization_id, developer_project_id, subcontract_agreement_id, vendor_id
-- contractor_organization_id, contractor_project_id
-- status text (accepted|provisioning|active|sync_degraded|suspended|revoked|archived)
-- accepted_at, revoked_at, connection_version, ...
-- UNIQUE (contractor_project_id) WHERE status in active-ish
-- UNIQUE (subcontract_agreement_id, contractor_organization_id) WHERE active-ish
```

RLS: contractor org members with project access on `contractor_project_id`; developer org managers for health/issue flows (separate wave).
