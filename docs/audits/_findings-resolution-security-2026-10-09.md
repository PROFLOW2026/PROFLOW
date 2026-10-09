# Security findings resolution — OPS-B-003, SEC-001, SEC-002

**Date:** 2026-10-09  
**Scope:** Audit-only (migration/static RLS review + local integration tests). No production SQL. No PostgREST PoC. No browser.  
**Repo:** ProjectFlow (`projectflow`)

---

## Executive summary

| ID | Verdict | Classification |
|----|---------|----------------|
| **OPS-B-003** | **VERIFIED BROKEN (migration hygiene)** | Five `organization_id` tables have RLS enabled but **`relforcerowsecurity = false`**. Policies vary (service-role-only vs tenant). Fix is additive `FORCE ROW LEVEL SECURITY` (and optional `service_all` parity). |
| **SEC-001** | **CONFIRMED LOGIC GAP** | `audit_events` SELECT at RLS is **org membership only**; app requires **`audit.read`**. Cross-tenant reads are blocked; **intra-org permission bypass via direct DB/PostgREST is plausible but not proven** in integration tests. |
| **SEC-002** | **CONFIRMED LOGIC GAP** | `contracts` SELECT at RLS is **membership + project access** (0051); app requires **`contracts.read`** (+ project gates in loaders). **Not** upgraded to 0073-style permission predicates. **No proven leak** in integration tests. |

**Integration runs (this session):**

| Suite | Result |
|-------|--------|
| `tests/integration/database/migrations.test.ts` | **1 fail** — FORCE RLS assertion lists exactly the five OPS-B-003 tables |
| `tests/integration/tenancy/rls-hardening.test.ts` | **5/5 pass** — auth-table hardening + `audit_events` **INSERT** policy (not SELECT/`audit.read`) |
| `tests/integration/settings/tenant-isolation.test.ts` | **3/3 pass** — **`listAuditEvents` app gate** (cross-tenant + org scoping) |
| Module `tenant-isolation` integration (11 files) | **29/29 pass** |
| **Tenant-isolation total (incl. settings)** | **32/32 pass** — no regression; does **not** cover SEC-001/002 under-privileged RLS SELECT |

---

## OPS-B-003 — Five tables without FORCE RLS

### How the finding is detected

`tests/integration/database/migrations.test.ts` queries `pg_class` for public heap tables that have an `organization_id` column and where **`relrowsecurity = false` OR `relforcerowsecurity = false`**. After a clean migration apply (PGlite), the failing set is:

1. `subcontract_claim_sequences`
2. `estimate_text_blocks`
3. `rfi_submittal_sequences`
4. `attendance_correction_requests`
5. `quote_default_text_blocks`

This matches the project standard established in `drizzle/migrations/0001_rls_security.sql`, which runs **`ENABLE` + `FORCE` RLS** for every table in the bulk tenant loop.

### Per-table migration review

#### 1. `subcontract_claim_sequences`

| Attribute | Detail |
|-----------|--------|
| **Introduced** | `drizzle/migrations/0159_dg_claims.sql` |
| **Purpose** | Counter rows for `app.subcontract_claim_assign_number()` (`SECURITY DEFINER` trigger) |
| **RLS** | `ENABLE ROW LEVEL SECURITY` |
| **FORCE RLS** | **Missing** |
| **Policies** | `subcontract_claim_sequences_service_all` → **`service_role` only** (`USING (true)`) |
| **Grants** | `REVOKE ALL … FROM authenticated`; `GRANT ALL … TO service_role` |
| **Client exposure** | **Service-role-only by grants** — authenticated role has no table privileges |
| **Tenant isolation** | Org id on row; not intended for member SELECT |

**Resolution:** Hygiene — add `ALTER TABLE … FORCE ROW LEVEL SECURITY` so the table matches the global invariant and migration-owner sessions cannot bypass RLS without an explicit policy. **No change to authenticated exposure** (already revoked).

---

#### 2. `rfi_submittal_sequences`

| Attribute | Detail |
|-----------|--------|
| **Introduced** | `drizzle/migrations/0163_dg_rfi_submittals.sql` |
| **Purpose** | Counter for `app.rfi_submittal_assign_number()` (`SECURITY DEFINER`) |
| **RLS** | `ENABLE` (comment: “Only reachable through the SECURITY DEFINER trigger”) |
| **FORCE RLS** | **Missing** |
| **Policies** | `rfi_submittal_sequences_service_all` → **`service_role` only** |
| **Grants** | Same pattern as claim sequences — **no authenticated grants** |
| **Client exposure** | **Service-role-only** |

**Resolution:** Same as claim sequences — **FORCE RLS for parity** with 0001; low runtime risk today.

---

#### 3. `estimate_text_blocks` and 4. `quote_default_text_blocks`

| Attribute | Detail |
|-----------|--------|
| **Introduced** | Tables: `0152_quotes_root_and_text_blocks.sql`; policies: **`0153_quote_text_blocks_rls.sql`** |
| **RLS** | `ENABLE ROW LEVEL SECURITY` on both |
| **FORCE RLS** | **Missing on both** |
| **Policies (authenticated)** | Tenant CRUD with **`app.is_org_member(organization_id)` AND `app.has_org_permission(..., 'quotes.read'|'quotes.manage')`** — **stronger than bare membership** (closer to 0073 intent) |
| **Policies (service)** | `*_service_all` for `service_role` |
| **Grants** | `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated` (0001 default + 0153 reaffirm) |
| **Client exposure** | **Authenticated PostgREST/SQL path is in scope** — policies already encode permission keys |

**Resolution:** Add **`FORCE ROW LEVEL SECURITY`** on both tables (and keep existing 0153 policies). Optional follow-up: align naming with `_tenant_*` convention — cosmetic only.

**Note:** These two tables are the **highest practical concern** among the five: they combine **authenticated grants** with **missing FORCE** (owner-role bypass during maintenance) while already having permission-aware policies.

---

#### 5. `attendance_correction_requests`

| Attribute | Detail |
|-----------|--------|
| **Introduced** | `drizzle/migrations/0137_attendance_correction_requests.sql` |
| **RLS** | `ENABLE ROW LEVEL SECURITY` |
| **FORCE RLS** | **Missing** |
| **Policies** | Single policy `attendance_correction_requests_org_isolation` — **`FOR ALL TO authenticated`** using active membership subquery on `organization_memberships` (equivalent intent to `app.is_org_member`, not permission-gated) |
| **Service policy** | **No explicit `service_role` policy** (relying on Supabase `service_role` bypass + comment) |
| **Grants** | `GRANT SELECT TO authenticated`; `GRANT ALL TO service_role` |
| **App layer** | Comments reference `ATTENDANCE_MANAGE` / `ATTENDANCE_SELF` — **app gates not mirrored in RLS** |

**Resolution:**

1. **`FORCE ROW LEVEL SECURITY`** — required for OPS-B-003 green.
2. **Hardening (separate from hygiene):** Consider attendance-specific permission predicates (similar to 0073) and an explicit `*_service_all` policy for forced RLS + migration owner — **future migration**, not required to explain OPS-B-003 failure.

---

### OPS-B-003 — Risk summary

| Table | Missing FORCE | Authenticated access | Effective tenant boundary today |
|-------|---------------|----------------------|----------------------------------|
| `subcontract_claim_sequences` | Yes | **None (REVOKE ALL)** | Service / definer triggers only |
| `rfi_submittal_sequences` | Yes | **None** | Service / definer triggers only |
| `estimate_text_blocks` | Yes | Full CRUD + permission policies | Org + `quotes.*` at RLS |
| `quote_default_text_blocks` | Yes | Full CRUD + permission policies | Org + `quotes.*` at RLS |
| `attendance_correction_requests` | Yes | **SELECT** + ALL policy (membership) | Org membership at RLS; permissions in app |

**Product defect class:** **VERIFIED BROKEN (hygiene)** — CI gate `migrations.test.ts` fails until five `ALTER TABLE … FORCE ROW LEVEL SECURITY` statements exist in a new additive migration.

**Suggested fix (prepare only — do not apply without Owner SQL approval):**

```sql
-- Illustrative additive migration (Owner review only)
ALTER TABLE public.subcontract_claim_sequences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rfi_submittal_sequences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_text_blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quote_default_text_blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_correction_requests FORCE ROW LEVEL SECURITY;
-- Optional: attendance_correction_requests_service_all FOR service_role
```

---

## SEC-001 — `audit_events` RLS vs `audit.read`

### Static evidence

| Layer | SELECT rule |
|-------|-------------|
| **RLS** (`0001_rls_security.sql`) | `audit_events_member_select`: `organization_id IS NOT NULL AND app.is_org_member(organization_id)` |
| **RLS hardening** (`0006_rls_hardening.sql`) | Tightens **INSERT** (non-null org); **does not change SELECT** |
| **Later** (`0156_dg_external_identity.sql`) | Adds `audit_events_external_insert`; **SELECT unchanged** |
| **App** (`src/shared/audit/index.ts`) | `listAuditEventSummaries` / entity history: **`assertPermission(..., AUDIT_READ)`** |
| **Grants** (`0001_rls_security.sql`) | Broad `GRANT SELECT … ON ALL TABLES … TO authenticated` |

There is **no** `app.has_org_permission(organization_id, 'audit.read')` on `audit_events` SELECT in any committed migration.

### CONFIRMED LOGIC GAP vs CONFIRMED BUG

| Question | Answer |
|----------|--------|
| Is RLS **weaker than the app** for same-org readers? | **Yes** — any active org member satisfies SELECT policy; app requires **`audit.read`**. |
| Is **cross-tenant** read proven? | **No** — RLS and app both scope by org; **`settings/tenant-isolation.test.ts`** rejects cross-tenant `listAuditEvents`. |
| Is **intra-org** read without `audit.read` **proven** via integration test? | **No** — no test performs `database.asUser(worker)` + raw `SELECT` from `audit_events` or Supabase client. |
| Could a member read **`before` / `after` JSON** via DB while UI strips them? | **Plausible static gap** (RLS does not hide columns); **not executed/proven** in this audit. |

**Classification: CONFIRMED LOGIC GAP (HIGH)** — same class as pre-0073 financial tables documented in `docs/audits/MIGRATION-0073-RLS-FINANCIAL-PERMISSIONS.md`. **Not CONFIRMED BUG** — no demonstrated leak in automated tests; exposure depends on an authenticated direct-DB/PostgREST path (browser anon client usage in repo is auth/storage-oriented, not bulk table reads).

### Integration relevance

| Test | What it proves for SEC-001 |
|------|----------------------------|
| `rls-hardening.test.ts` | INSERT/null-org and founding audit **insert** path |
| `settings/tenant-isolation.test.ts` | **App-layer** org boundary + `audit.read` via `listAuditEvents` |
| `migrations.test.ts` | `audit_events` **has** FORCE RLS (not part of OPS-B-003 five) |

**Recommended direction (prepare only):** New migration dropping/recreating `audit_events_member_select` with `AND app.has_org_permission(organization_id, 'audit.read')` (and CRM exception parity if raw SELECT must match `listAuditEventSummariesForEntity`). Add integration test: worker without `audit.read` → raw SQL SELECT returns 0 rows or permission denied.

---

## SEC-002 — `contracts` RLS vs `contracts.read`

### Static evidence

| Layer | SELECT rule |
|-------|-------------|
| **RLS baseline** (`0001_rls_security.sql`) | `contracts_tenant_select`: `app.is_org_member(organization_id)` |
| **Project gate** (`0051_review_integrity_closure.sql`) | `SELECT app.apply_project_column_rls('contracts', 'project_id', NULL, NULL)` → adds **`(project_id IS NULL OR app.can_access_project(...))`** |
| **0073 financial permission migration** | **Does not include `contracts` or `contract_value_events`** |
| **Parity matrix** (`tests/integration/migration/0051-rls-parity-matrix.json`) | Documents SELECT change to membership **+ project** only; **`permissionPreserved: true`** refers to not removing membership — **not** adding `contracts.read` |
| **App** | e.g. `list-org-contracts.ts`, `get-project-financials.ts`, `manage-contracts.ts` — **`assertPermission` / `hasPermission(..., CONTRACTS_READ)`** |

Related: **`contract_value_events`** received the same **0051 project-column** treatment but also **no** `contracts.read` in RLS (same logic-gap pattern; SEC-002 register entry names **`contracts`** specifically).

### CONFIRMED LOGIC GAP vs CONFIRMED BUG

| Question | Answer |
|----------|--------|
| Is RLS **weaker than the app**? | **Yes** — member with project access can satisfy SELECT without **`contracts.read`**. |
| Is **cross-tenant** contract read proven? | **No** — **`commercial/tenant-isolation.test.ts`** covers change requests through app APIs, not raw `contracts` SELECT; other suites show org-scoped commercial/financial app gates pass. |
| Is under-privileged **RLS SELECT** proven? | **No** — **no** dedicated integration test (noted in `_verification-integration-targeted-2026-10-09.md`). |
| PostgREST PoC required? | **Explicitly out of scope** for this resolution. |

**Classification: CONFIRMED LOGIC GAP (HIGH)** — align with **0073 pattern**: embed `app.has_org_permission(organization_id, 'contracts.read')` in `contracts_tenant_*` (and likely `contract_value_events` for parity). **Not CONFIRMED BUG** without a failing under-privileged SELECT test or demonstrated data exfiltration.

### Integration relevance

| Test | What it proves for SEC-002 |
|------|----------------------------|
| `commercial/tenant-isolation.test.ts` | Cross-org **change request** isolation via **application** queries |
| `financials/tenant-isolation.test.ts` | Cross-org **project financials** via **`getProjectFinancials`** (app permission + RLS on underlying tables) |
| `0051-rls-parity-matrix.json` | Static record of **project** tightening only |

**Recommended direction (prepare only):** Additive migration updating `contracts` (and optionally `contract_value_events`) authenticated policies to require **`contracts.read`** on SELECT and **`contracts.manage`** (or existing write perms) on mutating commands, preserving 0051 project predicates. Add integration test mirroring `rls-hardening` style for a worker with project access but without `contracts.read`.

---

## Classification rubric (used above)

| Label | Meaning in this audit |
|-------|------------------------|
| **CONFIRMED LOGIC GAP** | Committed RLS predicates are **strictly weaker** than documented app permission gates; static migration + app code agree. |
| **CONFIRMED BUG (proven leak)** | Automated or reproducible proof that ** unauthorized principal reads/writes rows** (cross-tenant or missing permission) **through the database layer**. **Not assigned** to SEC-001/002 in this pass. |
| **VERIFIED BROKEN (hygiene)** | **OPS-B-003** — objective CI failure on FORCE RLS invariant; not necessarily exploitable authenticated exposure for sequence tables. |

---

## References

- `tests/integration/database/migrations.test.ts` — OPS-B-003 detector  
- `drizzle/migrations/0159_dg_claims.sql`, `0163_dg_rfi_submittals.sql`, `0153_quote_text_blocks_rls.sql`, `0137_attendance_correction_requests.sql`  
- `drizzle/migrations/0001_rls_security.sql`, `0006_rls_hardening.sql`, `0051_review_integrity_closure.sql`, `0073_financial_rls_permission_gates.sql`  
- `docs/audits/PROJECTFLOW-FINAL-COMPLETE-VERIFICATION-2026-10-09.md` — SEC-001/002 CONFIRMED register  
- `docs/audits/_verification-integration-targeted-2026-10-09.md` — SEC integration coverage gaps  

---

**SQL / MIGRATION PREPARED = NO** (this document is resolution/analysis only; illustrative SQL snippets are not committed migration files.)
