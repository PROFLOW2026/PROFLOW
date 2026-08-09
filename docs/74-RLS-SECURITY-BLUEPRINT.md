# 74 — RLS & Security Blueprint

**Status:** Planning blueprint  
**Locked:** J6 multi-tenancy + defense in depth  
**Phase:** No policies applied yet

---

## 1. Security principles

1. Server-side authorization is **mandatory**.  
2. RLS is **defense in depth**, not a substitute.  
3. Organization A ↛ Organization B data.  
4. Service role is **server-only**, never in client bundles.  
5. Prefer user-scoped DB connections for request paths so RLS applies.  
6. AuditEvent ≠ application logs.

---

## 2. Session → database role model

**Target pattern (Wave 0):**

```text
Browser
  → Next.js server (anon/authenticated Supabase client)
  → DB queries as authenticated role with JWT claims
  → RLS policies use auth.uid() + membership
```

For Drizzle:

- Prefer a connection that sets `request.jwt.claim.sub` / uses Supabase user context, **or**  
- Use a restricted app role with `SET LOCAL` of `app.user_id` / `app.organization_id` **only after** server validated membership.

**MUST DECIDE DURING WAVE 0 (Lead):** exact Drizzle + Supabase RLS session wiring (JWT claim vs `set_config`). Document the chosen pattern in code comments + `77`.

Service role:

- Migrations  
- Controlled seeds  
- Rare system jobs with explicit org targeting  
- Never for ordinary user requests from the browser

---

## 3. Policy patterns by table family

### A. Tenant-owned tables (`organization_id NOT NULL`)

**SELECT:** user is active member of `organization_id`.  
**INSERT:** member + (optionally) app already checked permission; policy still requires `organization_id` in user’s orgs.  
**UPDATE/DELETE:** same membership; soft-delete preferred.

Helper SQL concept:

```sql
-- conceptual
organization_id IN (
  SELECT organization_id FROM organization_memberships
  WHERE user_id = auth.uid() AND status = 'active'
)
```

Permission-aware writes at DB layer are **optional** in V1 if they become brittle; app must still enforce permissions. Prefer keeping RLS focused on **tenant isolation** first; expand to permission claims later if JWT custom claims are introduced.

### B. `profiles`

- User can SELECT/UPDATE **own** row (`id = auth.uid()`).  
- Members may need limited SELECT of co-members’ display fields within shared orgs (define carefully).

### C. GLOBAL catalogs (`permissions`, system templates)

- Authenticated read OK.  
- Write: service role / migration only.

### D. `audit_events`

- INSERT: only via trusted server paths (prefer security definer function or service path).  
- SELECT: members with `audit.read` (app-enforced) + RLS membership on `organization_id`.  
- No UPDATE/DELETE for authenticated roles.

### E. Storage

See `75` — Storage policies mirror org membership + document ownership.

---

## 4. System / job operations

Jobs using service role must:

1. Accept explicit `organizationId` in job payload  
2. Never “select * across tenants” accidentally  
3. Write AuditEvent for sensitive mutations  
4. Be covered by integration tests

---

## 5. Cross-tenant attack tests (mandatory early)

Integration tests (see `80`):

1. Seed OrgA + OrgB with data  
2. As userA, attempt SELECT/UPDATE OrgB rows via app use case → deny  
3. As userA, attempt direct SQL under RLS-bound role against OrgB → zero rows / deny  
4. Confirm service-role test harness is **not** used for the RLS denial cases  

---

## 6. Secrets & headers

| Secret | Client | Server |
|--------|--------|--------|
| Anon key | OK (public) | OK |
| Service role | **FORBIDDEN** | OK |
| Database URL | FORBIDDEN | OK (server/CI) |
| Resend API | FORBIDDEN | OK |

Preview env must not contain production Database URL / service role.

---

## 7. Soft delete & RLS

Archived rows remain tenant-scoped. Default app queries filter `archived_at IS NULL` unless restore/admin views. RLS still applies to archived rows (no cross-tenant leak via archive).

---

## 8. Related

`15`, `17`, `73`, `75`, `80`
