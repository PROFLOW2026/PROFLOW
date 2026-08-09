# 0012 Patch Notes — AP / vendor portal (local, unapplied)

Migration file: `drizzle/migrations/0012_ap_vendor_portal.sql`  
Lead allows additive safe ALTER while unapplied. **Do not renumber.**

## Patch applied in 0012

### 1. Kind-scoped `external_access_grants` CHECK

**Problem:**  
`external_access_grants_scope_present` previously allowed any row with at least one of `client_id`, `project_id`, `vendor_id`. That permitted:

- `portal_kind = 'vendor'` without `vendor_id` (e.g. only `client_id`)
- `portal_kind = 'customer'` with only `vendor_id`

**Exact replacement (already in 0012):**

```sql
ALTER TABLE "external_access_grants"
  DROP CONSTRAINT IF EXISTS "external_access_grants_scope_present";

ALTER TABLE "external_access_grants"
  ADD CONSTRAINT "external_access_grants_scope_present" CHECK (
    (
      "portal_kind" = 'vendor'
      AND "vendor_id" IS NOT NULL
      AND "client_id" IS NULL
      AND "project_id" IS NULL
    )
    OR (
      "portal_kind" = 'customer'
      AND "vendor_id" IS NULL
      AND num_nonnulls("client_id", "project_id") >= 1
    )
  );
```

**Drizzle mirror:** `drizzle/schema/portal.ts` — same predicate on `external_access_grants_scope_present`.

### 2. Unchanged (intentional)

- AP tables + RLS tenant policies remain as authored
- `ap.read` / `ap.manage` permission seed unchanged
- No expense auto-create triggers; matching stays status/link only

## App-layer companion fixes (not schema)

See `WAVE3-REVIEW-FINDINGS.md` W3-F01, F02, F04–F08.

## Freeze readiness (integrator)

**0012 is freeze-ready** from Wave 3 closeout perspective:

- Kind-scoped `external_access_grants_scope_present` CHECK is sound and matches `drizzle/schema/portal.ts`
- Additive ALTER while unapplied is intentional; do not renumber
- Journal/file parity and FORCE RLS on new tenant tables verified by migration review
- Residual LOW only in `WAVE3-REVIEW-FINDINGS.md` (W3-L01 / L03 / L04). Former L02 (`findOpenCommittedCostForPo` status filter) closed as W3-F14.

Optional non-blocking polish (Lead call, not required to freeze): missing `organization_id` indexes on some child/field-ops tables; existing-org owner `role_permissions` backfill via seed/ops.
