# 14 — Technical Architecture Options

**Status:** Preferred directions accepted; providers not selected — **no implementation in this phase**  
**Phase:** Planning only  
**Owner decision batch:** 2026-08-09

---

## 1. Purpose

Outline system components, preferred architecture directions, and remaining provider choices.  
Nothing here authorizes scaffolding, installs, or cloud provisioning yet.

Exact cloud / auth / storage / hosting providers remain **OPEN** until the technical stack review immediately before implementation.

---

## 2. Preferred architecture directions (2026-08-09)

| Direction | Status |
|-----------|--------|
| Relational system of record | Preferred / accepted |
| PostgreSQL preferred | Accepted as DB preference |
| Strong Organization-based multi-tenancy | Accepted |
| Server-side authorization | Accepted |
| Managed authentication preferred | Accepted as approach; provider OPEN |
| Object/file storage separate from DB metadata | Accepted as approach; vendor OPEN |
| Clear backend / domain boundaries | Accepted |
| Responsive web app | Accepted |
| Global-first i18n | Accepted |
| Hebrew first complete UI | Accepted |
| English canonical source | Accepted |
| RTL / LTR first-class | Accepted |

---

## 3. Required system capabilities (future)

| Capability | Why |
|------------|-----|
| Frontend web app | Primary UI (responsive) |
| Backend API / application services | Business logic, authorization |
| Database | Relational business data |
| Authentication | Users/sessions |
| File storage | Documents/photos |
| Email service | Invitations, resets, notifications |
| Notifications | In-app (+ email; push later) |
| Background jobs | allocations, reminders, OCR later, exports |
| Backups | Data durability |
| Audit storage | Accountability |
| Observability | Logs/metrics/error tracking |
| Secrets management | Keys/tokens |
| Deployment environment | Hosting |

---

## 4. High-level architecture (logical)

```text
[ Web Client (responsive) ]
        |
        v
[ API / Application Layer  — domain boundaries + server-side authz ]
   |        |         |
   v        v         v
[ DB ]  [ File Store ] [ Auth ]
   \        |         /
    \       v        /
    [ Background Workers ]
            |
            v
     [ Email / Notifications ]
```

Multi-tenant organization context is enforced in the application layer and database access patterns. See `15-SECURITY-MULTITENANCY.md`.

---

## 5. Frontend options

### Option A — Next.js (React) web app

- Pros: strong ecosystem, good i18n/RTL community patterns, one language with backend-if-selected, SSR/SEO if needed later for marketing site
- Cons: complexity if only a private app is needed; must be disciplined about server/client boundaries

### Option B — Vite + React SPA

- Pros: simpler app-centric setup
- Cons: separate marketing site later; SEO less relevant for app but architecture split possible

### Option C — Other frameworks (Angular/Vue/SvelteKit)

- Pros: viable
- Cons: team familiarity unknown; ecosystem mismatch risk if not preferred

**Preferred product constraints:** responsive web; i18n keys; Hebrew first complete UI; English canonical; RTL/LTR.  
**Exact framework:** OPEN — decide at stack review.  
**OWNER DECISION REQUIRED** for framework choice.

---

## 6. Backend options

### Option A — Next.js full-stack (Route Handlers / server actions) + DB toolkit

- Pros: faster early delivery, fewer moving parts
- Cons: heavier domain logic can become tangled; background jobs need extra system

### Option B — Separate API (e.g. NestJS / Express / Fastify)

- Pros: clean separation, clearer domain boundaries, scaling independence
- Cons: more initial setup/ops

### Option C — BaaS-heavy (e.g. Supabase / Firebase style)

- Pros: auth/storage/db speed
- Cons: risk of leaking business rules to client; tenancy/security discipline must be excellent; possible lock-in

**Preferred direction:** clear backend/domain boundaries and server-side authorization even if physically co-located; avoid client-trusted business rules.  
**Exact topology/framework:** OPEN.  
**OWNER DECISION REQUIRED**

---

## 7. Database options

ProjectFlow is relational and transactional (money, versions, permissions, allocations).

### Option A — PostgreSQL (preferred)

- Pros: strong relational integrity, JSON when needed, mature RLS options, broad hosting
- Cons: ops responsibility depends on host

### Option B — MySQL / MariaDB

- Pros: familiar elsewhere
- Cons: slightly weaker fit for some advanced constraints/RLS patterns vs Postgres ecosystem common in modern SaaS

### Option C — Non-relational primary store

- Pros: flexible docs
- Cons: poor fit as system of record for financial integrity

**Decision (direction):** relational system of record; **PostgreSQL preferred**.  
**Still OPEN:** exact managed Postgres host/provider.

---

## 8. Auth options

### Option A — Managed auth (Clerk / Auth0 / Supabase Auth / Cognito / etc.)

- Pros: faster, battle-tested flows
- Cons: cost/lock-in; must map cleanly to org memberships

### Option B — Custom auth

- Pros: control
- Cons: easy to get wrong; high maintenance

**Decision (direction):** managed authentication preferred.  
**Still OPEN:** exact provider — select at stack review.  
**OWNER DECISION REQUIRED** for provider.

---

## 9. File storage options

### Option A — S3-compatible object storage (AWS S3 / Cloudflare R2 / GCS / etc.)

- Pros: durable, standard pattern, supports signed URLs
- Cons: need careful access design

### Option B — Storage bundled with BaaS

- Pros: integrated
- Cons: coupling; still need document metadata model in DB

**Decision (direction):** object/file storage separate from database metadata.  
**Still OPEN:** exact vendor.  
**OWNER DECISION REQUIRED** for vendor.

---

## 10. Email / notifications

Needs:

- transactional email (invite, reset, alerts)
- notification records in-app
- later: push for mobile apps

Providers are interchangeable if abstracted behind an interface. Exact provider OPEN.

---

## 11. Background jobs

Needed for:

- recurring expense generation
- insurance renewal reminders
- allocation runs (even simple manual/percentage batches)
- OCR pipelines later
- report generation
- outbound email retries

Options: queue workers (e.g. Redis-based), cloud scheduled functions, DB-backed job tables.

**OWNER DECISION REQUIRED** with stack choice.

---

## 12. Hosting / deployment options

Examples (non-exhaustive):

- Vercel / Netlify + managed Postgres + object storage
- Railway / Render / Fly.io
- AWS / GCP / Azure full stack
- Supabase + frontend host combination

Decision criteria should include:

- Israel latency if relevant
- cost at early stage
- backup/restore quality
- observability
- team familiarity
- multi-tenant security features

**Exact cloud/hosting providers remain OPEN until pre-implementation stack review.**

---

## 13. i18n architecture notes

- English canonical keys
- Hebrew first complete UI language
- locale detection + user/org preference
- RTL support at layout root
- LTR equally first-class
- no string concatenation that breaks grammar/RTL

Library choice depends on frontend stack (not decided).

---

## 14. Environments

Recommend planning for:

- local development
- staging
- production

With separate secrets, storage buckets, and databases.

---

## 15. What is explicitly not done now

- no `create-next-app` / scaffolding
- no package installs
- no cloud provisioning
- no migrations
- no production code
- no irreversible provider lock-in

---

## 16. Related documents

- Security → `15-SECURITY-MULTITENANCY.md`
- Globalization → `10-GLOBALIZATION-LOCALIZATION.md`
- V1 scope → `16-V1-SCOPE.md`
- Open questions → `18-OPEN-QUESTIONS.md`
