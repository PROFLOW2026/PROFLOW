# 69 — Environments & Deployment Plan

**Status:** Planning only — **no cloud projects or DBs created**  
**Assumes recommended Stack A** (Next.js + Supabase + Vercel) pending owner approval

---

## 1. Environments

| Env | Purpose | App host | Database | Storage | Notes |
|-----|---------|----------|----------|---------|-------|
| **local** | Dev machine | `next dev` | Local Supabase CLI **or** dedicated remote **dev** project | Dev bucket | Never point at prod |
| **preview** | PR deployments | Vercel Preview | Isolated preview/dev DB (branch or shared non-prod) | Non-prod bucket | Prod secrets blocked |
| **production** | Live SaaS | Vercel Production | Production Supabase project | Production private buckets | Least privilege |

**Hard rule:** Preview/local must not use production database credentials. Separate Supabase projects (or equivalent isolation) for prod vs non-prod.

---

## 2. Environment variables (conceptual groups)

Do not invent final names until scaffold; group them:

- `APP_URL` / public site URL  
- Supabase URL + anon key (client-safe)  
- Supabase **service role** (server-only; never to browser)  
- Database URL (pooled) for migrations/server  
- Resend API key (server-only)  
- Error tracking DSN  
- Feature flags if needed  

Vercel: Production vs Preview vs Development env scopes.  
Service role only on server runtimes.

---

## 3. Database lifecycle

```text
Git migration files (Drizzle)
  → CI/review
  → apply to target env migrate command
  → never “edit prod schema in dashboard” as normal path
```

- Seeds/demo data: separate scripts; not mixed into schema migrations.  
- Rollback posture: prefer forward-fix migrations; restore from backup for disasters.  
- RLS policies travel with migrations.

If Neon were chosen instead: use database branches for PR previews. Under Supabase recommendation: use separate non-prod project and/or branching features available at implementation time — still never share prod.

---

## 4. Deployment flow

```text
PR → Vercel Preview + non-prod DB
  → automated tests (unit + critical integration)
  → merge
  → Production deploy
  → run pending migrations as controlled step (CI or release job)
```

Migrations applying to production require Integrator/owner gate.

---

## 5. Cron / scheduled jobs

V1 light jobs:

- Vercel Cron hitting authenticated Route Handlers, **or**  
- Supabase scheduled functions when better colocated with DB  

Jobs must:

- Use explicit org targeting when multi-tenant  
- Write AuditEvent for sensitive mutations  
- Tolerate serverless timeouts (chunk work later via queue)

---

## 6. Observability by env

| Signal | Local | Preview | Prod |
|--------|-------|---------|------|
| Console / structured logs | Yes | Yes | Yes |
| Error tracker | Optional | On | On |
| DB metrics | Dashboard | Dashboard | Dashboard + alerts |
| AuditEvent | Domain table | Domain table | Domain table |

Audit ≠ application logging.

---

## 7. Cost / ops posture

Start: one Vercel project + one prod Supabase + one non-prod Supabase.  
Avoid multiplying regions until latency/compliance requires it.  
Document region choice at provision time (owner decision).

---

## 8. Pre-provision checklist (when owner greenlights)

1. Create **non-prod** then **prod** Supabase projects (order: non-prod first for learning)  
2. Create Vercel project; wire Preview ≠ Production env  
3. Confirm no preview env contains prod DB URL  
4. Domain + email sender verification when invitations go live  
5. Still no “manual prod schema” habit  

**This document does not authorize provisioning.**

---

## 9. Related

`67` stack · `68` boundaries · `70` testing · `18` open questions
