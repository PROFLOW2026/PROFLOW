# Focused E2E results (EXLFY regression audit)

Harness: **local disposable Postgres** (`projectflow_e2e` @ `127.0.0.1:5432`), not Production.  
Workers: **1**. Logs: `RUN_LOG_FULL.txt`, `RUN_LOG_PORTAL.txt`, `RUN_LOG_VIEWPORT.txt`.

## PGlite attempt (blocked)

| Attempt | Port | Result |
|---------|------|--------|
| Isolated PGlite wire | `56542`, `56432`, `56650`, `55433` | **FAIL** — post-login `read ECONNRESET` → error boundary `משהו השתבש` on `/he-IL/sign-in` |

See `HARNESS.md` and `docs/audits/exlfy-comprehensive-qa-2026-11/evidence/harness-root-cause.md`.

## `release-smoke.spec.ts` (desktop-he-authenticated)

**5/5 PASS** in full batch (`RUN_LOG_FULL.txt`).

## `overnight-surfaces.spec.ts`

| Run | Viewport | Result |
|-----|----------|--------|
| Full batch, `desktop-he-authenticated` | 390×844 (project default) | **PASS** — scheduling, safety, notifications, timesheet approvals |
| Full batch, `mobile-he` (after ~25m suite) | Pixel 7 | **FAIL** — app unreachable / timeouts |

## `mobile-shell-audit.spec.ts` (`mobile-he`, 390×844)

| Route | Result |
|-------|--------|
| dashboard, projects-list, project-overview, project-team, project-documents | **PASS** |
| project-files-alias, financials, company-files, work, calendar, field, reports, quotes-new | **FAIL** — `MOBILE_NAV` wait timeout (~180s each); harness degraded late in long serial run |

## `workforce-discoverability.spec.ts` (`mobile-he`)

**0/2 PASS** — same late-run harness failure (timeouts).

## `mobile.spec.ts` (`mobile-he`)

| Test | Full batch | Isolated rerun (Postgres, fresh DB) |
|------|------------|-------------------------------------|
| Bottom nav / overflow | FAIL | not rerun |
| **FAB clears bottom nav** | FAIL | **PASS** |
| Reports / project create / More sheet | FAIL | not rerun |

## `exlfy-viewport-coverage.spec.ts` (regression-viewport)

**17/17 PASS** on subset: dashboard + expenses + project-infra @ 320/375/390/768/1280 + dark dashboard @390.  
Screenshots: `screenshots/viewports/*.png`.

## `exlfy-portal-smoke.spec.ts` (regression-portal)

| Portal | Result | Notes |
|--------|--------|-------|
| Contractor | **FAIL** | Sign-in reached portal; `assertNoPageHorizontalOverflow` failed (`html { overflow-x: hidden }`) |
| Employee | **FAIL** | Stuck on `/he-IL/employee/login`; server `authentication_required` |

## Full batch summary

`RUN_LOG_FULL.txt`: **12 passed, 16 failed, 28 tests** (35.8m). Failures clustered after mobile-shell route 12 — treat as **harness stability under long serial load**, not isolated product conclusions for those routes.
