# AUDIT — Tech docs 65–80

**Auditor:** Auto AUDITOR D  
**Date:** 2026-08-09  
**Workspace:** `projectflow`  
**Scope:** Architecture, migrations, RLS, auth, storage, email/jobs ports, observability, testing, CI, security boundaries, env validation  
**Policy:** Safe engineering fixes only · no push · no drizzle invent · 0012 content-frozen · additive 0014+ only if Lead-necessary  

**Migrations:** Remote through `0008` · Local `0009`–`0013` · **No 0014 added**

---

## Verdict

Wave 0–3 foundations largely match docs 65–80. Ports, RLS-bound DB sessions, permission-key authz, and journal/CI gates exist. Gaps closed in this pass: env contract hardening, structured logging with redaction, `EMAIL_DRIVER` enforcement, stronger migration journal CI/unit checks. Residual items are mostly product/ops (remote apply, Sentry wiring, storage bucket owner action, cross-module data imports, offline typecheck noise) — not schema invention.

---

## Status by doc cluster

| Docs | Topic | Status | Notes |
|------|--------|--------|-------|
| 65–67 | Decision pack / stack | **aligned** | Stack A in use; Deep Teal; Drizzle + Git SQL; no `push` path |
| 68, 76 | Boundaries | **mostly aligned** | ESLint blocks deep `data/` + domain framework imports; residual cross-module `data/` imports remain (see residual) |
| 69 | Environments | **aligned + strengthened** | `.env.example` classes; prod localhost / missing DB guards; preview≠prod remains process |
| 70 | Testing | **aligned** | Vitest unit/UI/integration + Playwright; CI runs Vitest + build |
| 71 | Implementation blueprint | **aligned + strengthened** | Ports under `shared/ports`; observability logger added |
| 72–73 | DB / auth / tenancy | **aligned** | `withUserContext` + `set_config` JWT sub; permission catalog; invitations + EmailPort |
| 74 | RLS | **aligned** | Migrations `0001`/`0006` + tenant FORCE RLS on later tables; integration isolation tests present |
| 75 | Storage | **aligned** | StoragePort + tenant key prefix; private bucket still owner action |
| 77 | Migrations / seed | **aligned + strengthened** | Journal parity script + tests; seeds separate; 0012 freeze markers asserted |
| 78–79 | Waves / multi-agent | **process** | Local waves through 0013; subagent APIs forbidden per workspace rule |
| 80 | Wave 0 acceptance | **largely met locally** | Auth/RLS/ports/money gates present; remote env proof & live Auth still operator-owned |

---

## Fixes applied (this audit)

1. **Env validation** (`src/shared/env/server.ts`, `public.ts`)
   - Empty-string → unset for optional/defaulted vars
   - `DATABASE_POOL_MAX`, `OCR_PROVIDER_API_KEY` in server contract
   - Production: require `DATABASE_URL`; forbid localhost `APP_URL`; require `RESEND_API_KEY` when `EMAIL_DRIVER=resend`
   - Reject `NEXT_PUBLIC_*` names matching secret shapes (`SERVICE_ROLE`, `SECRET`, …)
   - `resetServerEnvCache()` test seam; `.env.example` parity test

2. **Logging guards** (`src/shared/observability/logger.ts`)
   - Level-filtered structured logs; redact secret keys + inline emails
   - Jobs/email ports use logger; job payloads never logged
   - Client `error.tsx` logs digest only (no message leak)

3. **Email driver wiring** (`src/shared/ports/email.ts`)
   - `EMAIL_DRIVER=console` always no-op even if Resend key present
   - Resend only when `EMAIL_DRIVER=resend` + key + from

4. **Storage / DB env use**
   - StoragePort bucket + service role via `serverEnv` / `publicEnv`
   - DB pool size via `serverEnv().DATABASE_POOL_MAX`

5. **Migration journal strengthen**
   - `drizzle/scripts/check-migration-journal.mjs` (order equality, idx, tag shape, unique numeric prefix, strictly increasing `when`)
   - Unit tests extended; freeze markers for `0012_ap_vendor_portal` content; assert no `0014_*` yet
   - CI calls `npm run db:check-journal` instead of weak set-diff one-liner

6. **Docs / env surface**
   - `.env.example` documents `DATABASE_POOL_MAX`
   - This report: `docs/implementation/AUDIT-TECH-65-80.md`

**Migrations:** none invented · **0012:** not weakened · **0014+:** not required

---

## Residual (not fixed here)

| ID | Severity | Item |
|----|----------|------|
| R1 | HIGH (ops) | Local migrations `0009`–`0013` not remotely applied — owner gate before push of dependent code |
| R2 | MEDIUM | Supabase private `documents` bucket still owner action (`STORAGE-BUCKET-OWNER-ACTION.md`) |
| R3 | MEDIUM | Sentry DSNs accepted but no SDK/init wiring yet |
| R4 | MEDIUM | Several modules still import other modules’ `data/` paths (eslint pattern allows some paths; doc 76 prefers public API only) |
| R5 | LOW | `tsc` currently fails on pre-existing `src/modules/offline/ui/use-offline-aware-form-action.ts` syntax — outside this audit’s safe fix set |
| R6 | LOW | OCR stub still reads `process.env` directly (also accepts legacy `OCR_API_KEY`) rather than only `serverEnv()` |
| R7 | LOW | Playwright not in default CI job (doc 70 “later”); local `test:e2e` remains |
| R8 | INFO | Numbering gap `0003` intentional historical; journal checks allow non-contiguous prefixes |
| R9 | INFO | Full Wave 0 live Auth / email-domain verification still environment-dependent |

---

## Explicit non-changes

- No drizzle schema/migration invent  
- No edits to `0012_ap_vendor_portal.sql` content  
- No `0014+` migration  
- No git push  

---

## Verification

```
npm run db:check-journal
npx vitest run tests/unit/database/migration-journal.test.ts tests/unit/shared/env.test.ts tests/unit/shared/logger.test.ts
```

Result (2026-08-09): journal parity ok (13 files, last `0013_document_owner_types`); 14 unit tests passed.
