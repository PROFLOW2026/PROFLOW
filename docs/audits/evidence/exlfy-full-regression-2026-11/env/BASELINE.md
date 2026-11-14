# Environment baseline (read-only)

**Captured:** 2026-11-14  
**Workspace:** `PROFLOW2026/PROFLOW` → local `projectflow`

## Git / Production SHA

| Item | Value | Status |
|------|-------|--------|
| Local `HEAD` | `b2f0b9e766f8c84b7c4f6b4dd3e6f14e65e387e7` | Verified |
| Branch | `main` tracking `origin/main` | Verified |
| Reported Production SHA | same as above | Matches local HEAD |
| Production URL | https://proflow-two-bice.vercel.app | Named; live deploy metadata **UNVERIFIED** (Vercel team auth required) |
| Local `.cursor/last-vercel-deploy.json` | `READY` Production alias `proflow-two-bice.vercel.app`, created **2026-10-30** | **Stale vs reported Nov SHA** — does not contain `b2f0b9e7`; cannot prove live Prod matches HEAD |
| CI run `42659848441` | Reported green previously | **UNVERIFIED** (`gh` not authenticated in this session) |

## Release commits examined

| SHA | Role |
|-----|------|
| `787623f0` | BOQ client barrel only |
| `3cffcab7` | CI locales + migration `0203` + sheet-mark dialog |
| `b2f0b9e7` | Unit test alignment |
| `0c43a36e` | Major EXLFY sprint (goals, baselines, CPM, automations, webhooks, drawing workspace, tasks work packages, migrations 0201–0202) |
| `6b156d1f` | Prior wave + migration `0200` |
| `fd136c18` (2026-10-23) | Owner open-month employer-cost accrual (BUG-01 related; outside listed trio) |

## Migrations journal (repo)

Journal includes `0200`…`0203` as latest tags. **Live shared/Production apply status: UNVERIFIED** (no read-only DB session; Supabase MCP unauthenticated; Owner policy forbids speculative Production queries).

Prior readiness docs still mark **0197–0199** as prepared-not-applied in some artifacts — treat Production migration completeness as a **gate risk** until Owner confirms with a read-only `drizzle.__drizzle_migrations` query.

## Working tree note

Local workspace has many **unrelated** modified/untracked files (prior audits, scripts, `.cursor/*`). This audit did **not** revert or commit them. Product code was not modified; only evidence/report paths under `docs/audits/` were written.

## Auth gaps for runtime verification

- Vercel MCP: authenticated to user, **team scope consent required** for Production list (`team_KmHjkIHVd9QPNVW0NYZAoCfM`).
- Supabase MCP: needs auth for read-only schema probes.
- GitHub CLI: not logged in → CI run status unverified.
