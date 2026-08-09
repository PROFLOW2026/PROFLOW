# 33 — Enterprise Security & Governance

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** Later (select items may pull earlier by customer need)  
**Class:** Enterprise capability  
**Cross-reference:** `15-SECURITY-MULTITENANCY.md`, `12-USERS-ROLES-PERMISSIONS.md`, `13-AUDIT-HISTORY-DATA-INTEGRITY.md`

---

## 1. Purpose

Plan advanced governance for larger organizations without changing the V1 security baseline requirement: strong Organization isolation + server-side authorization.

---

## 2. Future enterprise capabilities

- MFA
- SSO / SAML
- SCIM provisioning
- IP policies
- session policies
- audit export
- retention policies
- legal hold
- advanced confidentiality
- project-level confidentiality
- field-level financial restrictions
- regional data hosting
- tenant-specific DB/schema options
- enterprise backups / restore drills
- admin controls
- data export
- data deletion / right-to-erasure workflows

---

## 3. Relationship to current security baseline

V1/baseline already requires:

- Organization tenancy
- membership-checked active org context
- RBAC + scopes
- mediated file access
- audit on sensitive actions
- secure defaults

Enterprise features extend this; they should not replace least-privilege design.

---

## 4. Confidentiality layers (future)

```text
Tenant isolation
  → Role/permission
    → Project scope
      → Confidentiality label / field-level financial restriction
```

Example: a PM sees schedule and quantity progress but not fully loaded margin.

---

## 5. Isolation options later

Current preferred direction: shared DB + strong org filtering (+ RLS if Postgres).  
Enterprise may later offer schema/DB-per-tenant for specific customers (`15`, `J6` still open for exact mechanics).

---

## 6. V1 impact

**No enterprise suite in V1.**  
Keep authz/audit models extensible.

---

## 7. Related documents

- Security baseline → `15`
- Users/roles → `12`
- Audit → `13`
- External portals → `25`
- Capability map → `19`
