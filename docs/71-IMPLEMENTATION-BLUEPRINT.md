# 71 — Implementation Blueprint (Master)

**Status:** READY FOR OWNER REVIEW BEFORE IMPLEMENTATION  
**Decision date:** 2026-08-09 (domain + Stack A approved)  
**Phase:** Documentation only — **NO application code, packages, DB, or cloud provisioning in this task**  
**Working name:** ProjectFlow

---

## 1. Purpose

After owner approval of this blueprint pack (`71`–`80`), agents can start Wave 0 without inventing architecture, tenancy, or schema forks.

This document is the **master index**. Detail lives in:

| Doc | Topic |
|-----|--------|
| `72` | V1 database blueprint |
| `73` | Auth, tenancy, permissions |
| `74` | RLS / security |
| `75` | Storage / documents |
| `76` | Codebase module boundaries |
| `77` | Migrations + seed plan |
| `78` | Wave implementation plan |
| `79` | Multi-agent protocol |
| `80` | Wave 0 acceptance criteria |

Product SoT remains `00`–`18`, `39`–`65`, UX `40`–`64`, stack `66`–`70`.

---

## 2. Locked stack (do not reopen)

| Layer | Decision |
|-------|----------|
| Frontend | Next.js App Router + TypeScript |
| Backend | Modular monolith in Next.js |
| DB | Supabase PostgreSQL |
| ORM | Drizzle + Git SQL migrations (not `push` for prod) |
| Auth | Supabase Auth (identity only) |
| Authorization | ProjectFlow DB |
| Tenancy | Shared DB + `organization_id` + app checks + RLS |
| Storage | Supabase Storage (private) |
| Hosting | Vercel (preview ≠ prod data) |
| Email | Resend behind EmailPort |
| Jobs | Sync + light cron; JobPort later; no Redis Wave 0 |
| i18n | next-intl; EN keys; HE first; country ≠ language |
| UI | Tailwind + Deep Teal tokens; headless primitives; TanStack Table when needed |
| Validation | Zod (server authoritative) |
| Tests | Vitest + integration tenancy/authz + Playwright critical |
| Observability | Structured logs + Sentry-class; AuditEvent ≠ logs |

---

## 3. Layering (mandatory)

```text
UI (app/, components/)
  → Application / Use Cases (modules/*/application)
  → Domain Services / Policies (modules/*/domain)
  → Repositories / Data Access (modules/*/data)
  → PostgreSQL (+ RLS)
```

Business rules **never** live in React components.

---

## 4. Request authorization flow

```text
authenticated user (Supabase Auth)
  → resolve ProjectFlow user profile
  → resolve active organization (server-validated)
  → assert OrganizationMembership
  → assert Permission(s) for action (+ project scope if needed)
  → execute use case
  → tenant-scoped repository/query
  → RLS as defense in depth
```

Never trust browser-supplied `organization_id` without membership/context validation.

---

## 5. Proposed codebase structure (refined)

```text
projectflow/
  src/
    app/                          # Next.js App Router (thin)
      [locale]/
        (auth)/
        (app)/                    # authenticated shell
      api/                        # route handlers only when needed

    modules/
      identity/                   # profile bridge to auth.users
      tenancy/                    # org, membership, invitations, active org
      rbac/                       # roles, permissions, assignments
      clients/
      projects/                   # projects, work_packages, phases, domains
      contracts/                  # contracts, contract value history
      changes/                    # quotes, CR, CO, approvals
      expenses/                   # expenses, allocations, categories
      billing/                    # billing_records, payments
      workforce/                  # employees, rates, time
      vendors/
      documents/                  # document metadata + storage use cases
      tax/
      notifications/              # domain events → channels (thin in Wave 0)

    shared/
      db/                         # drizzle client factories, tx helpers
      money/
      dates/
      validation/                 # zod helpers
      permissions/                # permission constants + check helpers
      audit/
      auth/                       # session helpers (adapter)
      storage/                    # StoragePort
      email/                      # EmailPort + Resend adapter
      jobs/                       # JobPort (sync/cron impl Wave 0)
      i18n/                       # next-intl helpers, locale/dir
      observability/

    components/
      ui/                         # headless-wrapped primitives + tokens
      app-shell/
      patterns/                   # tables→cards, money input, etc.

    locales/
      en/
      he-IL/

  drizzle/
    schema/                       # Drizzle table definitions (Integrator-owned merge)
    migrations/                   # generated + reviewed SQL (+ RLS)
    seed/

  tests/
    unit/
    integration/                  # DB, RLS, authz, tenancy
    e2e/                          # Playwright critical

  docs/                           # this documentation set
```

**Conflict rule:** feature agents own `modules/<name>/`; Lead/Integrator owns `drizzle/`, `shared/`, dependency files, and migration merge.

---

## 6. Module internal pattern

```text
modules/<name>/
  domain/         # pure rules, types, policies (mandatory when logic exists)
  application/    # use cases / orchestration (mandatory for mutations/queries)
  data/           # repositories, Drizzle queries (mandatory when persistence)
  validation/     # Zod schemas for this module (when forms/APIs exist)
  ui/             # module-specific UI (optional; prefer shared patterns)
  tests/          # unit/integration colocated or mirrored under tests/
```

| Layer | Wave 0 | Wave 1+ |
|-------|--------|---------|
| application + data + domain (thin) | Required for tenancy/rbac | Required per feature |
| validation | Auth/org forms | Per feature |
| ui/ | Prefer shell in `components/` | Module UI OK if bounded |
| Empty ports/interfaces | Avoid | Add when second impl exists |

Do not create empty abstraction folders “for later.”

---

## 7. ID strategy

| Kind | Strategy |
|------|----------|
| Primary keys (app tables) | **UUID** (`uuid` / `gen_random_uuid()`). Prefer **UUIDv7** if available in target Postgres/extension without friction; otherwise UUIDv4 is acceptable for V1. |
| Auth linkage | `profiles.id` = `auth.users.id` (same UUID) |
| Public display codes | Optional human codes later (`PRJ-…`); **not** required Wave 0; never replace UUID PK |
| Storage paths | Use document UUID, not original filename |

One ID system for entity identity. Do not invent parallel surrogate int PKs without reason.

---

## 8. Money / dates (application)

| Concern | Rule |
|---------|------|
| DB storage | `numeric` (precision suitable for money, e.g. `numeric(18,6)` storage with display scale policy) + `currency char(3)` ISO |
| App arithmetic | Decimal library in `shared/money` — **no JS float** for money math |
| Value type | `MoneyValue { amount, currency }` |
| Rounding | Boundaries may be Country Pack–driven later; do not invent global law; document call sites |
| Timestamps | `timestamptz` UTC for events/audit |
| Business dates | `date` for due/effective/calendar meaning |
| Org timezone | Stored on Organization; used for display, not for rewriting stored UTC |

---

## 9. i18n / design system homes

- Messages: `src/locales/en/*`, `src/locales/he-IL/*` (namespace by area: `common`, `auth`, `projects`, …)  
- RTL from locale metadata (`dir`)  
- Tokens: `src/components/ui/tokens` (or CSS variables entry) — Deep Teal  
- Primitives: headless + PF presentation in `components/ui`  
- Agents must not invent one-off color systems per module  

---

## 10. Environments (classes — no secrets here)

| Env | App | Data |
|-----|-----|------|
| local | `next dev` | Isolated non-prod Supabase (CLI or remote **dev** project) |
| preview | Vercel Preview | Non-prod Supabase only |
| production | Vercel Production | Separate prod Supabase |

Variable **classes:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `DATABASE_URL` (pooled), `RESEND_API_KEY`, `SENTRY_DSN`, `APP_URL`.  
Service role **never** shipped to the browser.

---

## 11. Unresolved implementation details

### MUST DECIDE BEFORE WAVE 0 (owner or Lead at kickoff)

| Item | Default proposal if owner silent at kickoff |
|------|-----------------------------------------------|
| Supabase region | Closest to primary users (IL/EU) — owner picks at provision |
| Local DB strategy | Supabase CLI local **or** shared remote **dev** project (pick one; document) |
| Exact UUID variant | UUIDv4 via `gen_random_uuid()` if v7 not trivial |

### MAY DECIDE DURING WAVE 0

- Production font (V2)  
- Exact Deep Teal hex polish within Direction B  
- Permission string final catalog (start from `73`; extend carefully)  
- Whether invitations email uses Resend vs Auth magic in early Wave 0  
- Cron mechanism (Vercel Cron vs deferred until first scheduled need)

### DEFERRED

- Org terminology aliases (B5)  
- Full role builder  
- Portals / e-sign  
- Redis/queue  
- Multi-currency conversion  
- Event sourcing  
- SaaS packaging  

---

## 12. Waves (summary)

| Wave | Goal |
|------|------|
| **0** | Foundation: auth, org, RBAC, RLS, shell, i18n/RTL, migrations, money/date, audit, storage port — **no business feature explosion** |
| **1** | Core project economics (parallel agents: projects, expenses, commercial, workforce, billing, UI) |
| **2** | Overhead depth, documents UX, profitability aggregation, Israel defaults, polish |
| **3** | V1 closure: integrity, security, RTL, mobile, a11y, deploy readiness |

Wave 1 **does not start** until Wave 0 acceptance (`80`) passes.

---

## 13. Explicit non-goals of this blueprint task

- No scaffolding  
- No `npm install`  
- No Supabase/Vercel project creation  
- No migrations executed  
- No feature code  

---

## 14. Owner gate

**Status:** `READY FOR OWNER REVIEW BEFORE IMPLEMENTATION`

Approve this pack → authorize Wave 0 start → then provisioning + scaffolding may begin under Wave 0 plan.
