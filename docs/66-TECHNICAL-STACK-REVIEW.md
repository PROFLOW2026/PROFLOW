# 66 — Technical Stack Review

**Status:** Research + planning recommendation (not owner-locked)  
**Phase:** Planning only — **no accounts, provisioning, installs, or code**  
**Visual direction:** Deep Teal (DECIDED)  
**Date:** 2026-08-09

---

## 1. Evaluation goals

Choose the simplest professional stack that supports:

- Multi-tenant SaaS with Organization isolation  
- PostgreSQL relational model + transactions + money integrity  
- Server-side authorization + RLS defense in depth  
- Hebrew + English, RTL/LTR, responsive web  
- Private documents, auth, invitations, roles, audit  
- Later: jobs, OCR/AI, public API, PWA  

Priorities: correctness → security → maintainability → simplicity → agent ergonomics → ops burden → cost → scale.

Sources consulted (official / primary docs):

| Topic | Source |
|-------|--------|
| Next.js App Router | https://nextjs.org/docs/app/getting-started/installation (and App Router docs index) |
| Supabase RLS | https://supabase.com/docs/guides/database/postgres/row-level-security |
| Supabase Storage + RLS | https://supabase.com/docs/guides/storage/security/access-control |
| Supabase Auth helpers / JWT notes | Supabase Auth + RLS guides (same family) |
| Neon branching | https://neon.com/docs/introduction/branching |
| Neon + Drizzle RLS | https://neon.com/docs/guides/rls-drizzle |
| Drizzle RLS | https://orm.drizzle.team/docs/rls |
| Clerk Organizations | https://clerk.com/docs/guides/organizations/overview |
| Clerk roles/permissions | https://clerk.com/docs/guides/organizations/control-access/roles-and-permissions |
| Cloudflare R2 presigned URLs | https://developers.cloudflare.com/r2/api/s3/presigned-urls/ |
| Vercel Blob private storage | https://vercel.com/docs/vercel-blob/private-storage |
| Resend + Next.js | https://resend.com/docs/send-with-nextjs |
| next-intl RTL | https://next-intl.dev/docs/usage/translations |

---

## 2. Candidate stacks

### Stack A — Integrated Supabase

```text
Next.js (App Router) + TypeScript
  → modular server domain layer
  → Supabase PostgreSQL (+ RLS)
  → Supabase Auth (identity/sessions)
  → Supabase Storage (private buckets + policies)
  → Vercel hosting
```

### Stack B — Specialized providers

```text
Next.js + TypeScript
  → Neon PostgreSQL
  → Clerk Auth (+ careful org decision)
  → R2 or Vercel Blob
  → Vercel hosting
```

### Stack C — Separate backend

```text
Next.js UI
  → NestJS/Fastify API (separate deploy)
  → Managed Postgres
  → Managed auth + storage
```

---

## 3. Scorecard (qualitative)

| Criterion | Stack A Supabase | Stack B Neon+Clerk+Blob/R2 | Stack C Separate API |
|-----------|------------------|----------------------------|----------------------|
| Security / tenancy tooling | Strong (RLS + Storage policies) | Strong if disciplined | Strong but more seams |
| Simplicity / ops burden | **Best** (fewer vendors) | More moving parts | Highest ops |
| V1 speed | **Best** | Good | Slowest |
| Future scale | Good; extract workers later | Good | Good earlier split |
| Provider lock-in | Medium (Postgres portable; Auth/Storage adapters) | Medium–high (Clerk Orgs risk) | Lower per piece, higher glue |
| Documents | Native private storage + RLS | Excellent with R2; Blob also viable | Same as chosen storage |
| Permissions fit | Auth ≠ authz; app owns roles | **Risk** if Clerk Orgs become second source of truth | Clean if designed well |
| Preview/dev DBs | Solid; branching less central than Neon | **Neon branching excellent** | Depends on Postgres host |
| AI-agent collaboration | Clear modules inside one repo | Same + more config files | Cross-repo conflict risk |
| Cost complexity | Usually simpler early | More invoices/config | Highest |

---

## 4. Frontend — J1

**Recommendation: Next.js App Router + TypeScript**

Why:

- Server Components / Route Handlers / Server Actions fit authz-on-server  
- Strong Vercel deploy path  
- Marketing site later can share repo  
- Excellent Cursor/TS ergonomics  

Vs Vite SPA: would force a separate API earlier and weaken first-party server boundaries. Not worth it for V1.

---

## 5. Backend shape — J2

**Recommendation: Option A — modular monolith inside Next.js**

```text
UI → Application/Use cases → Domain services → Repositories → PostgreSQL
```

Business rules must **not** live in React components.

Later extraction: keep domain packages pure; move workers/API edges without rewriting rules.

**Reject Stack C for V1:** not enough justified complexity for second deploy, duplicated env, and API contract overhead.

---

## 6. Database host

PostgreSQL is intentional (already preferred).

| | Supabase Postgres | Neon Postgres |
|--|-------------------|---------------|
| RLS | First-class product focus | Supported; app must own policies |
| Branching/previews | Available workflows | **Excellent** branching DX |
| Auth/Storage adjacency | Bundled | Separate providers |
| Portability | Standard Postgres | Standard Postgres |

**If Stack A:** Supabase Postgres.  
**If Stack B:** Neon (branching advantage).  

Overall recommendation favors **Supabase Postgres** as part of Stack A (fewer seams for tenancy + storage policies).

---

## 7. ORM / data access

**Recommendation: Drizzle ORM + drizzle-kit migrations (`generate` / `migrate`, not casual `push` for RLS)**

Why:

- SQL-near control for financial queries  
- Documented RLS policy support (`pgPolicy`, `.enableRLS()`)  
- Works with Supabase/Neon provider settings  
- Strong TypeScript without hiding SQL  

Prisma remains viable but heavier abstraction for RLS/SQL-heavy finance; not preferred here.

**RLS + migrations:** declare policies with schema; apply via versioned migration files in Git; server uses user-scoped DB client for request paths and carefully gated service role for jobs.

---

## 8. Authentication vs authorization

### Auth providers

| | Supabase Auth | Clerk |
|--|---------------|-------|
| Email/password, verify, reset | Yes | Yes |
| Future social/MFA/SSO path | Yes | Strong enterprise story |
| Org membership product | Soft (not ProjectFlow domain) | **Clerk Organizations** are a full org/RBAC system |

**Critical ProjectFlow rule:**  
Authentication ≠ authorization. Canonical authority for Organization / Membership / Role / Permission / RoleAssignment is **ProjectFlow PostgreSQL**.

### Clerk Organizations decision

| Option | Verdict |
|--------|---------|
| A. Clerk Orgs as authority | **Reject** — duplicates ProjectFlow tenancy/roles; fights project-scoped permissions & audit |
| B. Clerk Auth only; ignore Orgs | Possible but adds a vendor while still needing app org model |
| C. Avoid Clerk Orgs entirely | **Required if Clerk chosen** |

**Stack recommendation:** Supabase Auth for identity/sessions; ProjectFlow DB for all business authorization.

---

## 9. Multi-tenancy — J6 recommendation

```text
Shared PostgreSQL
tenant tables: organization_id NOT NULL
App: active org context + membership + permission checks
DB: RLS defense in depth
Every sensitive query scoped
Organization A ↛ Organization B
```

Also:

- Indexes on `organization_id` (+ composites where unique per org)  
- System/jobs via service role with explicit org targeting + audit  
- Automated isolation tests as release gate  

---

## 10. File storage

| | Supabase Storage | Cloudflare R2 | Vercel Blob |
|--|------------------|---------------|-------------|
| Private + signed access | Policies + signed URLs | S3 presigned URLs | Private store + `get()` / auth’d delivery |
| Tenant isolation | Path + RLS policies | App-enforced key prefixes | App-enforced + private delivery |
| Portability | Good; S3-backed model | **S3-compatible** | More Vercel-coupled |
| Ops | Same vendor as DB/Auth | Extra vendor | Simple on Vercel |

**Stack A pick:** Supabase Storage (private buckets; metadata in DB).  
**Stack B pick:** Cloudflare R2 (S3 portability) over Blob for long-term document archive; Blob acceptable for speed if staying all-Vercel.

---

## 11. Hosting

**Recommendation: Vercel** for Next.js (previews, env separation, functions).  
Alternative only if a hard constraint appears (unusual for this app).

Watch: Postgres connection pooling / serverless concurrency (Supabase pooler / Neon serverless driver patterns).

---

## 12. Background jobs

V1: sync work + light scheduled jobs (Vercel Cron / Supabase scheduled functions when needed).  
Later: queue/worker boundary (`jobs` port) for OCR, allocations, bulk email.  
**Do not** force Redis in Wave 0.

---

## 13. Email / notifications

- Transactional email: **Resend** (or auth-provider-owned verify/reset where applicable) behind `EmailPort`  
- Domain events → notification policy → in-app / email / future channels  
- Never hardwire finance events to a vendor SDK in domain code  

---

## 14. Validation / money / dates / i18n / UI libs

| Concern | Recommendation |
|---------|----------------|
| Validation | Zod (shared server+client); server always authoritative |
| Money | `numeric`/`decimal` in Postgres; decimal library in app; never JS float for stored money; `MoneyValue{amount, currency}` |
| Dates | UTC timestamptz for events; separate `date` for business calendar/effective/due; org timezone for display |
| i18n | **next-intl**; English keys; Hebrew first; `dir=rtl`; country ≠ language |
| Styling | Tailwind + design tokens (Deep Teal); headless accessible primitives (e.g. Radix) — library must not dictate brand |
| Tables | TanStack Table headless; cards on mobile |
| State | Server state + URL filters + local form state; no Redux by default |
| Testing | Vitest (unit/domain), Playwright (critical E2E), integration tests for tenancy/authz |
| Observability | Sentry (or equivalent) + structured logs; AuditEvent ≠ app logs |

---

## 15. Overall recommendation

**Adopt Stack A** (Next.js modular monolith + Supabase Postgres/Auth/Storage + Vercel), with ProjectFlow DB as authorization source of truth, Drizzle+migrations+RLS, Resend email adapter, next-intl, Tailwind+headless UI, TanStack Table.

Stack B loses mainly on **vendor count** and **Clerk Organizations conflict risk**.  
Stack C loses on **V1 complexity**.

---

## 16. Related

`67` recommended stack summary · `68` boundaries · `69` environments · `70` testing · `18` open questions
