# Public launch — production URL & email (L8)

**Do not execute in implementation phase.** Owner applies on launch day.

## Domain & HTTPS

**Custom domain is optional.** Launch may use the **current free Vercel production HTTPS URL** (`*.vercel.app`).

- [ ] Confirm Vercel Production deployment **READY** on the chosen public origin.
- [ ] Set `APP_URL=https://<production-origin>` (no trailing slash) — Vercel app URL or custom domain if added later.
- [ ] Set `NEXT_PUBLIC_APP_URL` to the same origin.

Optional later: register custom domain, point DNS to Vercel, update the same env vars and Supabase URLs to match.

## Supabase Auth

- [ ] **Site URL** = `https://<production-origin>`
- [ ] **Redirect URLs** include:
  - `https://<production-origin>/auth/callback`
  - Local dev URLs if still used
- [ ] Email templates (password reset, confirm) use correct locale/query params.

## Transactional email (delivery only — EN templates OK)

- [ ] `EMAIL_DRIVER=resend`
- [ ] `RESEND_API_KEY` set on Vercel Production
- [ ] `EMAIL_FROM` on verified sender domain
- [ ] Smoke: member **invitation** email delivers
- [ ] Smoke: **password reset** email delivers
- [ ] Smoke: sign-up **confirm** link (if enabled in Supabase) opens callback

## Code readiness (done in L8 implementation)

- Employee/public links use `NEXT_PUBLIC_APP_URL` / `APP_URL` — no hardcoded `vercel.app` in `app-origin.ts`.
