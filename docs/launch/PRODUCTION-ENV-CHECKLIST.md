# Production environment checklist (L10)

Apply on Vercel **after** code deploy; **not** during implementation phase.

## Required when `APP_ENV=production`

| Variable | Purpose |
|----------|---------|
| `APP_ENV` | `production` — enables `assertProductionGuards` |
| `APP_URL` | HTTPS production origin (current Vercel `*.vercel.app` URL is OK; custom domain optional) |
| `NEXT_PUBLIC_APP_URL` | Same public origin as `APP_URL` |
| `DATABASE_URL` | Runtime Postgres (pooled) |
| `DIRECT_DATABASE_URL` | Migrations / admin paths |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin operations |
| `STORAGE_TOKEN_ENCRYPTION_KEY` | OAuth token seal (dedicated 32-byte hex or passphrase) |
| `WEBHOOK_SECRET_KEK` | **Dedicated** — webhook secret sealing; **do not** rely on service-role fallback |
| `CRON_SECRET` | Internal cron/worker auth |
| `STORAGE_PROVISION_WORKER_SECRET` | Storage provision worker |
| `NEXT_PUBLIC_SUPABASE_URL` | Client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client |

## Conditional

| Variable | When |
|----------|------|
| `EMAIL_DRIVER=resend` + `RESEND_API_KEY` | Outbound invitation email |
| `EMAIL_FROM` | Verified sender |
| Storage OAuth `*_CLIENT_ID` / `*_SECRET` | Per enabled provider |
| `OCR_*` | Only if live OCR enabled |

## Validation

- [ ] Local/isolated: `APP_ENV=production` + full set → `serverEnv()` succeeds (see `tests/unit/shared/env.test.ts`).
- [ ] Missing `WEBHOOK_SECRET_KEK` with `APP_ENV=production` → startup throws (by design).
- [ ] After Vercel update: redeploy → health check → one authenticated smoke path.
