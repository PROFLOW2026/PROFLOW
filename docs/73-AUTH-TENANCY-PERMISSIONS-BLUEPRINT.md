# 73 — Auth, Tenancy & Permissions Blueprint

**Status:** Planning blueprint  
**Locked decisions:** J4, J6, H1, H2  
**Phase:** No Auth/cloud implementation yet

---

## 1. Separation of concerns

| Concern | System of record |
|---------|------------------|
| Authentication (who) | **Supabase Auth** (`auth.users`) |
| Profile display prefs | ProjectFlow `profiles` |
| Tenancy | `organizations` + `organization_memberships` |
| Authorization (what) | `permissions` + `roles` + `role_assignments` |
| Defense in depth | PostgreSQL RLS (`74`) |

Code checks **permission keys**, never `if (roleName === 'Owner')` as the security gate.

---

## 2. Auth user mapping

```text
auth.users.id  ==  profiles.id
```

- On first successful sign-in / sign-up completion: ensure profile row exists (server-side).  
- Do **not** store passwords or Auth secrets in app tables.  
- Email for login owned by Auth; profile may cache email for UI.

---

## 3. Planned auth flows (Wave 0)

| Flow | Notes |
|------|-------|
| Sign-up | Email/password; verification per Supabase Auth |
| Sign-in | Session cookies via official SSR patterns |
| Password reset | Auth-owned |
| Sign-out | Invalidate session |
| Organization creation | Authenticated user creates org → becomes Owner membership + role assignment |
| Invitation | ProjectFlow `invitations` + EmailPort (Resend); accept creates membership + role |
| Active organization | Server resolves from secure cookie/session preference; must validate membership every request |

Social login / MFA / SSO: **future**; do not block Wave 0.

---

## 4. Active organization context

```text
1. Require authenticated session
2. Read activeOrganizationId from server-controlled store
3. Load membership for (userId, organizationId); reject if missing/inactive
4. Load effective permissions (org-wide + optional project scope)
5. Pass OrgContext { userId, organizationId, permissions, ... } into use cases
```

Reject:

- Missing membership  
- Cross-org IDs from client forms without membership  
- Actions when no active org selected (except org-picker / create-org screens)

---

## 5. Permission naming scheme

Style: `<resource>.<action>` with optional financial specificity.

### Wave 0 / early catalog (canonical keys — English)

```text
org.read
org.update
members.read
members.manage
roles.manage
invitations.manage

projects.read
projects.create
projects.update
projects.archive

project_financials.read          # costs / operational financials
project_profit.read              # profit / margin (H2 default off for PM)

clients.read
clients.manage

contracts.read
contracts.manage

changes.read
changes.manage
changes.approve

expenses.read
expenses.create
expenses.update
expenses.finalize

vendors.read
vendors.manage

workforce.read
workforce.manage
time.manage

billing.read
billing.manage

documents.read
documents.manage

settings.manage
tax.manage
audit.read
```

Refine during Wave 0 seed; **add permissions via migration + seed**, not ad-hoc strings in UI only.

---

## 6. Role templates (H1)

Seeded per organization (cloned from system templates):

| Template key | Default intent |
|--------------|----------------|
| `owner` | Full business/project financials including profit |
| `manager` | Operational + project costs; **profit/margin off** |
| `worker` | Limited create/read for assigned work; no profit |
| `finance` | Financial/billing/expense depth per grants; not necessarily all settings |

V1 UI: limited toggles (e.g. enable `project_profit.read` for a manager). Full role builder deferred.

---

## 7. Permission evaluation

```text
effectivePermissions =
  union(permissions from all role_assignments for membership)
  filtered by project scope if assignment.project_id set
```

Use case:

```text
assertPermission(ctx, 'expenses.create')
assertProjectAccess(ctx, projectId) // membership + project in org
```

Project-scoped assignments: if any assignment is project-scoped, define rule clearly in Wave 0:

**V1 recommendation:** org-wide roles only in Wave 0; project-scoped column reserved but unused until needed — **MAY DECIDE DURING WAVE 0** whether to enable project scope in Wave 1.

---

## 8. Invitations

1. Authorizer has `invitations.manage`  
2. Create invitation row with hashed token, role template, expiry  
3. EmailPort sends link  
4. Accept: Auth user (existing or newly verified) → membership + role_assignment → invalidate invitation  
5. AuditEvent on invite + accept  

---

## 9. Financial visibility (H2)

| Default | project_financials.read | project_profit.read |
|---------|-------------------------|---------------------|
| Owner | yes | yes |
| Finance | yes (typical) | per seed |
| Manager | yes | **no** |
| Worker | limited/no | **no** |

Owner may grant `project_profit.read` via toggle. UI hides margin widgets without permission; API must also deny.

---

## 10. Testing requirements (early)

- User in Org A cannot act on Org B via use case  
- Missing permission denied  
- Manager cannot read profit endpoints by default  
- Invitation cannot escalate beyond inviter authority (no assigning Owner unless inviter can)

See `80`.

---

## 11. Related

`12`, `15`, `74`, `79`
