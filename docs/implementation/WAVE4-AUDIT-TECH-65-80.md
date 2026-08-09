# WAVE4 Audit D — Tech docs 65–80 vs engineering

**Date:** 2026-08-09  
**Auditor:** Auto/Composer (PART B / AUDITOR D)  
**Scope:** Architecture, deployment, migrations, data access, RLS, auth, storage, email, jobs, observability, testing, CI, security boundaries, env validation  
**Policy:** Implement safe missing engineering work; **no** `0014+` migrations; **no** push; **no** remote migration apply.

---

## Verdict

Stack A / Wave0 foundations are substantially in place: Next.js app, Drizzle migrations through local `0013`, RLS + tenant tests, permission asserts, EmailPort/JobPort/StoragePort, Zod env contracts, CI quality job. Gaps worth closing now are webhook revoke wiring, production env hardening, observability (Sentry package not installed), and a few loading/CI polish items. Outbound webhook HTTP worker and real OCR remain deferred or credential-gated.

---

## Checklist vs docs

| Doc | Topic | Status | Notes |
|-----|-------|--------|-------|
| **65** | Decision pack | **IMPLEMENTED** | DECIDED items reflected in schema/UX |
| **66–67** | Stack | **IMPLEMENTED** | Next + Supabase + Drizzle + Vitest/Playwright |
| **68** | Boundaries | **IMPLEMENTED** | Module barrels + ESLint boundaries |
| **69** | Environments / deploy | **PARTIAL** | `.env.example` + APP_ENV guards; hosting runbook thin |
| **70** | Testing | **IMPLEMENTED** | Unit + integration + UI + e2e harness |
| **71** | Implementation blueprint | **IMPLEMENTED** | Module layout matches |
| **72** | DB blueprint | **IMPLEMENTED** (+ Wave2/3 extensions) | Local ahead of remote |
| **73** | Auth/tenancy/permissions | **IMPLEMENTED** | Session + OrgContext + catalog |
| **74** | RLS | **IMPLEMENTED** | Migrations + hardening tests |
| **75** | Storage | **PARTIAL** | Port + rules; private bucket owner action residual |
| **76** | Module boundaries | **IMPLEMENTED** | |
| **77** | Migrations/seed | **IMPLEMENTED** | Journal check in CI; Lead owns numbering |
| **78** | Wave plan | Historical | Wave4 = audit/exhaustion |
| **79** | Multi-agent protocol | Active | Auto/Composer OK; subagent APIs forbidden |
| **80** | Wave0 acceptance | **PASS locally** | CI gate exists; prod credentials separate |

---

## Findings

### Architecture / boundaries

| ID | Sev | Finding | Action |
|----|-----|---------|--------|
| T-01 | — | `src/modules/*/domain|data|application|ui` respected | Keep |
| T-02 | LOW | Some app routes hold large forms | Acceptable; extract only when painful |

### Migrations / data

| ID | Sev | Finding | Action |
|----|-----|---------|--------|
| T-03 | HIGH (ops) | Remote through `0008`; local `0009`–`0013` pending owner apply | Document only — no push |
| T-04 | — | `db:check-journal` in CI | OK |
| T-05 | — | No `0014+` invented this wave | OK |

### RLS / auth / security

| ID | Sev | Finding | Action |
|----|-----|---------|--------|
| T-06 | — | `assertPermission` + org filters + RLS tests | OK |
| T-07 | MEDIUM | Webhook revoke missing at application/UI despite repo | **FIX** |
| T-08 | MEDIUM | Production env does not require service role when APP_ENV=production | **FIX** harden guards |
| T-09 | LOW | API whoami Bearer path present | OK |
| T-10 | — | `server-only` on env | OK |

### Storage / email / jobs

| ID | Sev | Finding | Action |
|----|-----|---------|--------|
| T-11 | MEDIUM | Private documents bucket console steps | **REQUIRES EXTERNAL CREDENTIAL** / owner doc |
| T-12 | — | EmailPort console + Resend adapters | OK; prod needs credential |
| T-13 | LOW | JobPort sync logger stub | SAFE later: webhook delivery worker |
| T-14 | — | OCR stub inert without key | OK |

### Observability

| ID | Sev | Finding | Action |
|----|-----|---------|--------|
| T-15 | MEDIUM | `SENTRY_DSN` in env but no `@sentry/*` package / init | **REQUIRES EXTERNAL CREDENTIAL** + package add — document; do not add deps casually |
| T-16 | — | Structured `logger` with redaction | OK |

### Testing / CI

| ID | Sev | Finding | Action |
|----|-----|---------|--------|
| T-17 | — | CI: journal, typecheck, lint, vitest, build | OK |
| T-18 | LOW | Playwright not in default CI job | Acceptable (e2e local/harness) or future CI job |
| T-19 | LOW | Expand unit coverage for revoke webhook | Add with fix |

---

## Safe implementations this wave

1. Webhook revoke + rotate secret Settings UI (use cases/actions already existed)  
2. Activity log labels for webhook revoke / secret rotate / key rotate / delivery enqueue  
3. `assertProductionGuards` requires `SUPABASE_SERVICE_ROLE_KEY` in production (+ unit tests)  
4. List-route `loading.tsx` for projects, clients, workforce, reports, CRM  
5. EN “work area” terminology consistency  
6. Project financials CSV export discovery link

---

## Explicit non-goals

- Creating migration `0014+`  
- Applying remote migrations  
- Installing Sentry SDK without Lead package ownership confirmation  
- Building notifications product  
- Real OCR provider adapter beyond stub
