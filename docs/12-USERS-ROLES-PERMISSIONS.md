# 12 — Users, Roles & Permissions

**Status:** Draft for owner review  
**Phase:** Planning only

---

## 1. Purpose

Define identity, organization membership, flexible roles/permissions, invitations, and scoped access.

Do **not** design only `admin` / `user`.

---

## 2. Core separations

| Concept | Meaning |
|---------|---------|
| **User** | Person identity that can authenticate |
| **Organization** | Tenant / business |
| **Membership** | User belongs to organization |
| **Role** | Named set of permissions |
| **Permission** | Atomic capability |
| **Assignment** | Role granted to membership, optionally scoped |
| **Invitation** | Pending membership offer |

Future: one user, many organizations.

---

## 3. Authentication (planning only)

Future needs:

- email/password
- email verification
- password reset
- secure sessions

Later:

- Google / Microsoft / Apple social login
- MFA

No auth implementation in this phase.  
See `14-TECHNICAL-ARCHITECTURE-OPTIONS.md`.

---

## 4. Example organization roles (templates)

These are starter templates, not a frozen closed list:

- Owner
- Manager
- Project Manager
- Employee / Field Worker
- Bookkeeping / Accounts
- Office Manager
- Finance Manager
- Custom roles

Users can create custom roles from permissions.

---

## 5. Permission model principles

1. Grant least privilege by default.
2. Separate **view** from **edit** where meaningful.
3. Separate **operational** rights from **financial** rights.
4. Allow project-scoped assignments.
5. Sensitive actions require explicit permissions + audit.

### Example permission capabilities (illustrative)

- `org.settings.manage`
- `members.invite`
- `roles.manage`
- `clients.read` / `clients.write`
- `projects.read` / `projects.write`
- `projects.financials.read`
- `time.create.own` / `time.approve`
- `expenses.create` / `expenses.approve`
- `change_requests.manage`
- `invoices.manage`
- `vendors.manage`
- `documents.read` / `documents.write`
- `audit.read`
- `tax.settings.manage`

Final permission catalog will be refined during implementation planning.

---

## 6. Scope types

Permissions may apply at:

| Scope | Example |
|-------|---------|
| Organization | Finance manager sees all financials |
| Project set | PM sees only assigned projects |
| Own records | Worker edits own time entries |
| Object-level later | specific document confidentiality |

### Example scenarios

- Owner: everything
- Project Manager: selected projects; maybe limited financials
- Worker: enter hours/expenses; no profitability
- Bookkeeping: financial documents/payments; limited project management rights

---

## 7. Invitation model

### Proposed flow

```text
Inviter selects email + role(+scopes)
  → invitation created
  → email sent
  → accept (existing or new user)
  → membership + role assignment active
```

Needs:

- expiry
- revoke
- resend
- audit of invitation lifecycle

---

## 8. Employee linkage

An Employee record may exist without login.  
A User may exist without being an Employee (e.g. external accountant).

Linkage should be optional and explicit.

---

## 9. Multi-org users (future-ready)

Design memberships so a user can later switch organizations.

Implications:

- session has active organization context
- authorization always checks org context
- no cross-org data bleed via shared user id alone

---

## 10. Custom roles vs presets

- Ship role templates for speed
- Allow cloning/customizing
- Avoid forcing all orgs into one hierarchy

Whether role templates are editable globally or only cloned per org is an open implementation detail.

**OWNER DECISION REQUIRED** on whether V1 includes full custom role builder or only templates + limited toggles.

---

## 11. V1 recommendation

Must have:

- multi-user organization
- invitations
- at least several distinct roles
- project scoping for PM/worker
- financial visibility separation

Can simplify:

- advanced custom permission matrix UI
- object-level ACLs beyond project scope
- SSO/MFA

---

## 12. Related documents

- Security → `15-SECURITY-MULTITENANCY.md`
- Audit → `13-AUDIT-HISTORY-DATA-INTEGRITY.md`
- Overview → `00-PROJECT-OVERVIEW.md`
