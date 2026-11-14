# Production deployment SHA verification (2026-11-14)

## Active Production

| Field | Value | Status |
|-------|--------|--------|
| Deployment ID | `dpl_613TyYZ4VpKKzeNeMxg4uZc4WuPQ` | **VERIFIED** |
| readyState | `READY` | **VERIFIED PASS** |
| target | `production` | **VERIFIED** |
| source | `cli` / `prebuilt: true` | **VERIFIED** |
| regions | `dub1` | **VERIFIED** |
| Deployment URL | `proflow-5gu25kkqp-erans-projects-dffe05d5.vercel.app` | **VERIFIED** |
| Alias `proflow-two-bice.vercel.app` | → same `deploymentId` | **VERIFIED PASS** |
| Inspector | https://vercel.com/erans-projects-dffe05d5/proflow/613TyYZ4VpKKzeNeMxg4uZc4WuPQ | |
| createdAt / ready | 2026-11-09 17:15:48Z / 17:16:10Z | **VERIFIED** |

API: `list_deployments` + `list_aliases` + `vercel api /v13/deployments/dpl_613…` after Owner team consent.

## Commit SHA vs expected `b2f0b9e766f8c84b7c4f6b4dd3e6f14e65e387e7`

| Source | Result |
|--------|--------|
| Vercel deployment `meta.githubCommitSha` / gitSource | **Absent** (prebuilt CLI upload — no Git commit stamp) |
| `.deploy-linux/out/deploy.log` | Same inspect URL `…/613TyYZ4VpKKzeNeMxg4uZc4WuPQ`; aliased `proflow-two-bice.vercel.app`; Ready |
| `.deploy-linux/out/status` | `SUCCEEDED` at `2026-11-09T17:04:58Z` start → 17:16:12Z done |
| Local `HEAD` / tip at deploy time | Commit `b2f0b9e7` dated **2026-11-09 18:56:57 +0200** (=16:56Z) — **before** archive `17:04Z` |
| `.deploy-linux/src.tar` | Contains `drizzle/migrations/0203_tasks_work_package_id.sql` (introduced on path to `b2f0b9e7`) |
| Commits after `b2f0b9e7` on local main | **None** (still HEAD) |

### Verdict on SHA match

**MATCH — high confidence (reconstructed), not API-stamped.**

Expected audit SHA `b2f0b9e7` is the only credible `git archive HEAD` for the SUCCEEDED prebuilt that became `dpl_613…` and the live alias.

**Not claimed:** cryptographic equality of every file in the live lambdas to `git archive b2f0b9e7` (would require artifact diff).

## Stale local notes (do not confuse)

| Artifact | Note |
|----------|------|
| `.cursor/deploy-run.log` | Older **FAILED_DEPLOY** of `f879c00b…` (2026-11-08) — **not** active Production |
| `.cursor/last-vercel-deploy.json` | Older deployment `dpl_67Pg…` — **not** current alias target |

## Classification labels

1. READY → **VERIFIED PASS**
2. SHA == `b2f0b9e7` → **VERIFIED PASS (inferred from deploy pipeline + timeline; Vercel git meta empty)**
3. Domain alias → **VERIFIED PASS**
