# 15 — Security & Multi-Tenancy

**Status:** Draft for owner review  
**Phase:** Planning only

---

## 1. Purpose

Define security principles for a multi-tenant SaaS where each Organization’s data is isolated and authorization is explicit.

---

## 2. Primary requirement

> **Organization A must never be able to read or modify Organization B’s data.**

This includes:

- database rows
- search indexes
- files
- exports
- logs that might contain payloads
- background job processing
- analytics aggregates (unless anonymized and intentionally cross-tenant)

---

## 3. Tenant isolation strategies

### Option A — Shared DB, `organization_id` on all tenant rows + strict query discipline / RLS

- Pros: cost-efficient, simpler ops early
- Cons: one bug can become a cross-tenant incident if controls fail

### Option B — Schema-per-tenant

- Pros: stronger isolation boundary
- Cons: migrations/ops complexity grows with tenants

### Option C — Database-per-tenant

- Pros: strongest isolation
- Cons: expensive/complex for early stage

**Preferred direction (2026-08-09):** strong Organization-based multi-tenancy + server-side authorization.  
**Recommendation for mechanics:** Option A with defense in depth (mandatory org context in API, automated tests for isolation, DB RLS if PostgreSQL). Revisit B/C for enterprise later if needed.  
**Exact isolation mechanics:** still OPEN for stack review (`J6`).  
**OWNER DECISION REQUIRED** for exact mechanics / provider choices.

---

## 4. Authorization layers

1. **Authentication** — who is the user?
2. **Membership** — which org is active?
3. **Role/permission check** — what can they do?
4. **Scope check** — which projects/objects?
5. **Tenant boundary check** — does this object belong to active org?

Never trust client-provided organization IDs without membership verification.

---

## 5. Secure file access

Rules:

- files inherit tenant ownership
- access mediated by backend authorization
- prefer signed short-lived URLs or streamed authorized downloads
- prevent enumeration of storage keys
- consider virus scanning later for uploads
- separate buckets/prefixes per environment

A document link in UI must not bypass permission checks.

---

## 6. Sessions and credentials

Plan for:

- secure session/token handling
- password reset safety
- email verification
- logout / session revocation
- eventual MFA
- brute-force / rate limiting on auth endpoints

Provider may implement many of these; application still owns org authorization.

---

## 7. Validation and abuse resistance

- server-side validation for all writes
- rate limiting on auth, invite, upload, export endpoints
- size/type limits on uploads
- pagination limits
- protect expensive report/allocation jobs

---

## 8. Secrets and configuration

- no secrets in git
- environment-specific secrets
- least-privilege cloud credentials
- rotation plan for keys

---

## 9. Audit and monitoring

Security-relevant events should be auditable:

- login failures (provider/app)
- permission changes
- tax/financial setting changes
- mass exports
- deletion/archive of sensitive entities

Operational monitoring:

- error tracking
- access anomaly signals later
- backup success/failure alerts

---

## 10. Backups and recovery

Plan for:

- automated DB backups
- file storage durability/versioning strategy
- periodic restore tests
- tenant deletion/export policies later (GDPR-like and local laws via country packs)

---

## 11. Secure defaults

- deny by default permissions
- least privilege roles
- private storage
- HTTPS only
- no broad CORS
- no verbose production errors to clients
- soft delete over reckless hard delete for meaningful data

---

## 12. Multi-org user caution

When one user belongs to multiple orgs:

- active org must be explicit in session/context
- every query filtered by active org
- prevent cross-org IDOR via object IDs alone

---

## 13. V1 security baseline checklist (planning)

- tenant id on tenant-owned records
- centralized authz checks
- invitation-only join
- signed/mediated file access
- audit on sensitive actions
- backups enabled before real customer data
- isolation tests as a release gate

---

## 14. Related documents

- Users/roles → `12-USERS-ROLES-PERMISSIONS.md`
- Documents → `09-DOCUMENTS-EXPENSE-CAPTURE.md`
- Architecture options → `14-TECHNICAL-ARCHITECTURE-OPTIONS.md`
- Audit → `13-AUDIT-HISTORY-DATA-INTEGRITY.md`
