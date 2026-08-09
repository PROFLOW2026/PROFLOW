# ProjectFlow — Current Implementation Status

**Updated:** 2026-08-09 · **Phase:** Pre-launch completion program (Wave 1 in progress) · **Git:** local Wave 1 checkpoint (not pushed) · **Migrations:** through `0008_light_scheduling` (local; remote through `0007` until owner applies `0008`)

> Authoritative live delta. Do not trust older counts without re-checking the repo.

---

## 1. Live infrastructure

| Layer | Status |
|-------|--------|
| Git / GitHub | Yes — `PROFLOW2026/PROFLOW` |
| Supabase Auth + Postgres | Yes |
| Vercel | Yes (deployed main) |
| Drizzle migrations | `0000`–`0008` in repo; **remote applied through `0007`** |
| GitHub Actions CI | **Added** (`.github/workflows/ci.yml`) — green after push |
| Notifications (doc 26) | **Intentionally deferred** |

---

## 2. Capability matrix

| Capability | State | Docs | Notes |
|------------|-------|------|-------|
| Auth / tenancy / RLS / RBAC | I | 12–15, 73–74 | |
| Clients / Projects / WP / Phases | I | 03, 39 | |
| Contracts + VAT include/exclude + original lock | I | 04, 11 | |
| Changes / Expenses / Vendors / Workforce / Billing | I | 04–07 | |
| Documents + private storage | P→I-ish | 09, 75 | drag/drop + mobile capture; needs bucket config |
| Home dashboard | I | 46 | |
| Org project comparison / reports | I | 29, 46 | `/reports` + CSV exports |
| CSV export | I | 29, 37 | projects/clients/vendors/expenses/billing/project-financials |
| Light scheduling (dates/progress/milestones) | I | 22 | migration `0008` |
| Profession presets | I | 35–36 | onboarding + settings |
| Module visibility | I | 35, 41 | settings/features |
| Onboarding polish | I | 42–43 | optional preset |
| GitHub CI | I | 69–70 | |
| CRM / AR depth / portals / compliance | M | 20, 25, 28, 24 | Wave 2 |
| Procurement / inventory / field / assets | M | 21–23 | Wave 3 |
| PWA / OCR / AI | M | 31, 27 | Wave 4 |
| Notifications | D | 26 | owner deferral |

Legend: **I** implemented · **P** partial · **M** missing · **D** deferred

---

## 3. Wave 1 delivered this session

- Phase 0 status rewrite
- CI workflow
- Authz-aware CSV exports (`/exports/[kind]`)
- Migration `0008_light_scheduling` + milestones/progress UI
- Profession presets (onboarding + settings apply)
- `/reports` project comparison rollup
- Documents drag/drop + mobile capture attribute
- Adaptive nav: Reports item

## 4. Before push to main

1. Owner applies remote migration `0008_light_scheduling`
2. Wave 1 reviewers (financial / security / UX) + fix BLOCKER/HIGH/MEDIUM
3. Full gate (typecheck, lint, vitest, playwright, build)
4. Then push / Vercel

## 5. Modules in `src/modules`

`billing`, `clients`, `commercial`, `documents`, `expenses`, `exports`, `financials`, `identity`, `projects`, `rbac`, `tax`, `tenancy`, `vendors`, `workforce`
