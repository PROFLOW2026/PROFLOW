# Production read-only verification — blockers (wave 2)

**Date:** 2026-11-14  
**Local HEAD:** `b2f0b9e766f8c84b7c4f6b4dd3e6f14e65e387e7`  
**Vercel project (linked):** `prj_lfPR4I06dLL06s9kARjMSa2MjAd6` / name `proflow`  
**Team:** `team_KmHjkIHVd9QPNVW0NYZAoCfM`

## 1. Production SHA

| Item | Status |
|------|--------|
| What cannot be verified | Active Production deployment `meta.githubCommitSha` / alias target |
| Missing permission | Vercel MCP team grant for `team_KmHjkIHVd9QPNVW0NYZAoCfM` (403 on list_deployments) |
| Required action | Owner opens one-time consent link from `authorize_team_access`, then agent retries `list_deployments` target=production |
| Risk if wrong | Audit compares code that is not what users run; false confidence on fixes |

**Consent link issued (10 min TTL when created):** agent must re-issue if expired — do not store secrets.

## 2. Live migrations / schema

| Item | Status |
|------|--------|
| What was verified | See `MIGRATIONS_LIVE_READONLY.md` — PROFLOW `rnjeggpsjchayprygkcw` |
| Result | Journal timestamps + schema probes indicate **0197–0203 applied**; `tasks.work_package_id` present; `automation_rules_preset_known` includes `task_blocked` |
| Residual | Confirm this Supabase project is the Production app DB (only ACTIVE PROFLOW project in MCP account) |
| Risk if wrong project | False confidence on migrate state |

## 3. Classification (updated after team consent)

- Production READY + alias: **VERIFIED PASS** — `PROD_SHA_VERIFICATION.md`
- Production SHA == `b2f0b9e7`: **VERIFIED PASS (inferred)** — Vercel git meta empty on prebuilt; pipeline reconstruction
- Migrations apply (PROFLOW Supabase): **VERIFIED PASS** — `MIGRATIONS_LIVE_READONLY.md`
- BUG-006: **WEAKENED → P3 Residual**
