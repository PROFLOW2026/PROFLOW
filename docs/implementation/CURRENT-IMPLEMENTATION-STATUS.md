# ProjectFlow — Current Implementation Status

**Updated:** 2026-08-09 · **Phase:** Pre-launch completion · **Local HEAD:** `defc088` (3 commits ahead of `origin/main`, not pushed) · **Remote migrations:** through `0007` · **Local migrations:** through `0008`

---

## OWNER ACTION REQUIRED BEFORE PUSH

```
REMOTE MIGRATIONS REQUIRED
- 0008_light_scheduling
```

Do not push `main` until `0008` is applied on Supabase (or push will deploy code that expects milestones/progress columns).

---

## Wave 1 (local checkpoint — largely complete)

| Item | Status |
|------|--------|
| Reality/status matrix | Done |
| GitHub Actions CI | Done |
| CSV exports | Done |
| Light scheduling / milestones / progress | Done (`0008`) |
| Profession presets | Done |
| Org reports / project comparison | Done (`/reports`) |
| Documents drag/drop + mobile capture | Done |
| Onboarding preset + Reports nav | Done |
| Module visibility | Already existed; presets in settings |
| Receivables aging (Wave 2 start) | Done (no new migration) |
| Full UX 39–64 audit | Partial (targeted gaps) |
| Formal Wave 1 review gate | Pending before push |
| Full Vitest / Playwright / build gate | Pending before push |

## Intentionally deferred

- Notifications / doc 26 (owner)
- Marketing / pricing / SaaS packaging
- Native apps, SSO, deep Gantt, fake OCR

## Next (continuing locally)

- Cash-flow views from due dates
- CRM pre-project foundation (migration `0009` when Lead ready)
- Formal security/financial/UX review fixes
- After remote `0008`: full gate → push

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
