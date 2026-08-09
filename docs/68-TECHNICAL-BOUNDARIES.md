# 68 — Technical Boundaries

**Status:** Planning proposal (aligns with recommended Stack A)  
**Phase:** No code yet  
**Goal:** Clear ownership for multi-agent Cursor work and clean domain seams

---

## 1. Layering (mandatory)

```text
app/ (UI, routes, Server Actions entry)
  ↓ calls
application/ (use cases / orchestration)
  ↓ calls
domain/ (pure rules: money, CR/CO, permissions checks interfaces)
  ↓ calls
infrastructure/ (Drizzle repos, Supabase clients, email, storage)
```

Rules:

- React components do **not** contain business calculations or authorization decisions.  
- Route Handlers / Server Actions are thin: parse → authorize → use case → map result.  
- Domain may depend on ports (interfaces), not on Supabase SDK types.

---

## 2. Suggested repository modules (agent ownership)

Prefer vertical slices with shared kernels:

```text
src/
  modules/
    tenancy/          # org, membership, invitations, active org
    identity/         # session bridge to Auth provider
    rbac/             # roles, permissions, role assignments
    projects/         # project, work package, phase
    expenses/         # expenses, splits, attachments metadata
    contracts/        # contracts, CR, CO
    workforce/        # people, true cost, time (as scoped)
    billing/          # outgoing billing/payments/outstanding (V1 slice)
    documents/        # file metadata + storage adapter use
    audit/            # AuditEvent append/query
    notifications/    # domain events → channels
    country-pack/     # tax/currency display rules (config)
  shared/
    money/
    dates/
    validation/
    i18n/
    ui/               # design system / Deep Teal tokens
  db/
    schema/
    migrations/
    policies/         # RLS (or colocated in schema)
```

**Conflict reduction:** agents own modules; Integrator owns `shared/`, `db/migrations` merge, and shell/nav.

---

## 3. Multi-agent roles (process)

| Role | Owns | Must not casually edit |
|------|------|------------------------|
| Lead / Integrator | Cross-cutting, migrations merge, env contracts, README | Random feature UI |
| Tenancy/Auth agent | `tenancy`, `identity`, `rbac` | Expense formulas |
| Projects agent | `projects` | Billing ledger |
| Expenses agent | `expenses` | Contract state machine |
| Changes agent | `contracts` CR/CO | Workforce rates |
| Workforce agent | `workforce` | Storage policies |
| Billing agent | `billing` | Org invitations |
| UI shell agent | `shared/ui`, layouts, tokens | Domain services |
| Docs/QA agent | tests strategy, critical E2E specs | Production schema unilaterally |

Shared files (`schema` core tables, permission catalog) require Integrator review.

---

## 4. Authorization boundary

```text
Request
  → resolve session user (Auth)
  → resolve active Organization
  → assert membership
  → assert permission for action (+ project scope if needed)
  → execute use case with org-scoped repos
  → RLS still enforced on DB connection
```

Forbidden:

- Client-only permission gates as security  
- Trusting Auth “role” claims for business actions  
- Cross-org queries without explicit system job policy  

---

## 5. Storage boundary

```text
DB Document row: organization_id, project_id?, kind, storage_key, checksum, ...
Object store: binary at tenant-prefixed key
Access: server checks permission → signed URL / proxied download
```

No generic “file manager” product surface in V1.

---

## 6. Notification boundary

```text
Domain Event
  → NotificationPolicy (who/when/channel)
  → InAppNotification
  → EmailPort (optional)
  → future Push/SMS
```

Finance modules emit events; they do not import Resend.

---

## 7. Job boundary

```text
JobDefinition { name, payload, orgId? }
  V1: run inline or cron handler in Next.js
  Later: enqueue → worker process same handlers
```

Handlers live with domain modules; transport is swappable.

---

## 8. Portability

| Concern | Abstraction? |
|---------|--------------|
| PostgreSQL | No (intentional) |
| Auth provider | Thin adapter |
| Object storage | Thin adapter |
| Email | Thin port |
| Notifications | Domain policy + ports |
| Jobs | Interface + V1 sync impl |

---

## 9. Money & date boundaries

- Money math only via `shared/money` helpers (decimal types).  
- Persist amounts as precise decimal + currency code.  
- `timestamptz` for audit/events; `date` for business calendar fields.  
- Display uses org timezone / locale; Country Pack may add rounding rules later — do not invent global law in UI.

---

## 10. Related

`67` stack · `69` environments · `70` testing · product docs `12`/`14`/`17`
