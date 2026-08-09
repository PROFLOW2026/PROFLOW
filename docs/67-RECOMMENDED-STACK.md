# 67 — Recommended Stack

**Status:** **OWNER APPROVED** (2026-08-09) — Stack A DECIDED in `18` (J1–J7)  
**Phase:** Planning only — **no provisioning yet**  
**Companion:** `66-TECHNICAL-STACK-REVIEW.md` · Blueprints `71`–`80`

---

## Approved stack

| Layer | Recommendation | Why | Main downside / risk |
|-------|----------------|-----|----------------------|
| **Frontend** | Next.js App Router + TypeScript | Server/authz boundaries, RTL app UX, Vercel path, agent-friendly | Must keep business logic out of UI components |
| **Backend shape** | Modular monolith in Next.js (use cases → domain → repos) | Enough for V1; one deploy; clear later extract path | Discipline required or monolith becomes spaghetti |
| **Database** | Supabase PostgreSQL | Postgres + RLS product fit; shared tenancy model | Prefer pooler patterns with serverless |
| **ORM / data** | Drizzle ORM + Git migrations (`generate`/`migrate`) | SQL-near, decimals, RLS-capable, TS types | Team must treat SQL/migrations as first-class |
| **Auth** | Supabase Auth (identity/sessions only) | Covers verify/reset/sessions; future social/MFA path | Must not invent parallel “roles” in Auth |
| **Authorization** | ProjectFlow DB (`Organization`, membership, roles, permissions) | Single source of truth; project-scoped rules | Every mutation must go through server checks |
| **Multi-tenancy** | Shared DB + `organization_id` + app checks + RLS | Defense in depth; matches preferred J6 model | RLS bugs are high impact — test relentlessly |
| **Storage** | Supabase Storage (private) + DB metadata | Same vendor policies; signed access; no file manager | Path/policy discipline for tenant isolation |
| **Hosting** | Vercel | Best Next.js DX; previews; env separation | Serverless ↔ DB connection care |
| **Background jobs** | V1: sync + light cron; later job port/worker | Avoid Redis/queue prematurely | Don’t bury long work in request path forever |
| **Email** | Resend behind `EmailPort` (auth emails may stay with Auth) | Simple transactional DX | Deliverability/domain setup still required later |
| **i18n** | next-intl; EN keys; HE first UI; country ≠ language | App Router + RTL docs path | Message catalog discipline across agents |
| **Styling** | Tailwind + Deep Teal tokens | Matches locked visual direction | Avoid default “AI purple” / card soup |
| **Accessible components** | Headless (e.g. Radix) + custom PF chrome | A11y without brand takeover | More assembly than a themed kit |
| **Tables** | TanStack Table | Sorting/filter/pagination without enterprise grid | Server-side data patterns later |
| **Validation** | Zod shared schemas; server mandatory | Money/dates/tax-safe UX + integrity | Client validation never trusted alone |
| **Testing** | Vitest + integration tenancy tests + Playwright critical paths | Matches risk profile | Must budget isolation tests early |
| **Observability** | Structured logs + error tracking (e.g. Sentry); DB metrics | Wave 0 light; scale later | Audit log must stay separate domain |

---

## Rejected for V1 (summary)

- **Stack B (Neon + Clerk + R2/Blob):** Viable technically; loses on vendor count and high risk of duplicated Organizations/RBAC if Clerk Orgs are used. Neon branching is attractive but not enough to outweigh integrated tenancy/storage with Supabase for this product.  
- **Stack C (separate Nest/Fastify):** Premature; extract later from modular domain.  
- **Clerk Organizations as authority:** Conflicts with ProjectFlow canonical concepts.  
- **Floating-point money, Redux-by-default, enterprise data grids, Redis-in-Wave-0:** Unnecessary complexity or correctness risk.

---

## Auth vs authorization (LOCKED)

```text
Supabase Auth  →  who is the human (user id, session)
ProjectFlow DB →  which Organization, membership, role, permission, project scope
RLS            →  last line of defense if app bug leaks a query
```

Invitations: ProjectFlow invitation records + email; membership rows written only by authorized server paths.

---

## Extension adapters (thin ports — design now, implement when coding)

- `AuthAdapter` (session/user id)  
- `StorageAdapter`  
- `EmailPort`  
- `NotificationDispatcher`  
- `JobScheduler` / `JobHandler`  

**No** abstract “database interface” for switching away from PostgreSQL.

---

## Owner approval checklist

- [x] Stack A as V1 platform  
- [x] Drizzle + migration+RLS workflow  
- [x] Supabase Auth without Auth-as-RBAC  
- [x] Supabase Storage for private docs  
- [x] Vercel hosting  
- [x] J1–J7 marked DECIDED in `18`  

**Next:** owner reviews Implementation Blueprint (`71`–`80`) before Wave 0 code. No cloud provisioning until Wave 0 start is authorized.
