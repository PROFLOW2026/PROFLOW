# Vercel ↔ Supabase consumption audit (2026-10-09)

| Field | Value |
|--------|--------|
| **Scope** | AUDIT ONLY — architecture/code review; no production load tests; no dashboard GB proof this session |
| **Region** | Vercel `dub1`; Supabase `eu-west-1` (unchanged policy) |
| **Prior forensic** | [SUPABASE-EGRESS-FORENSIC-2026-10-08.md](./SUPABASE-EGRESS-FORENSIC-2026-10-08.md) |
| **Linked findings** | OPS-001, OPS-002, OPS-003, OPS-004, OPS-005; ops-worker bundle affects egress when cron fires |

## CONFIRMED vs SPECULATIVE cost amplification

### CONFIRMED (code + config — fires without users)

| Mechanism | Evidence | Amplification mechanism |
|-----------|----------|-------------------------|
| **Three Vercel Hobby crons daily** | `vercel.json` schedules `0 5 *`, `0 6 *`, `30 6 *` UTC → `/api/internal/ocr-worker`, `ops-worker`, `sumit-expense-worker` | **3 cold invocations/day minimum** per deployment; each may open Postgres via Drizzle pooler |
| **ops-worker Promise.all fan-out** | `src/app/api/internal/ops-worker/route.ts` L40–52 — **11 parallel workers** (expense recurrence, task recurrence, reminders, notification scan, storage recovery, material market, SUMIT recovery, quote expiry, pressure alerts, margin snapshots, dg-events) | Single cron tick → **multi-module DB scan across all orgs** inside each sub-worker (worst case sum of per-org loops) |
| **Per-sub-worker .catch partial failure** | Same route — notificationScan, storageProvision, materialMarket, sumitRecovery, etc. catch and return failed structs instead of aborting bundle | Failed sub-jobs may **still leave other scans running** → full bundle cost even on partial errors |
| **DG kick self-HTTP fire-and-forget** | `src/modules/dg-events/application/kick.ts` L26–29 `fetch(url).catch(() => undefined)` | Event enqueue paths trigger **extra HTTP** to `dg-events-worker` without await/metrics; errors swallowed (OPS-004) |
| **No dedicated dg-events cron in vercel.json** | Only ops-worker includes `runDgEventsOpsWorker`; separate consumer relies on kicks + daily safety | Backlog drain **depends on kicks + daily ops bundle** — kick loss = latent work until next cron |
| **Hobby cron count cap** | `tests/unit/ops/vercel-hobby-crons.test.ts` documents plan limits (OPS-003 INTENTIONAL) | Cannot add more scheduled drains without plan change — **forces bundling** into ops-worker |
| **Direct Postgres app path** | Architecture per Sep/Oct egress audits — business data via Drizzle `:5432`, not PostgREST bulk | Cron/worker egress class = **Database wire protocol**, not Auth/Storage, when jobs run |

### SPECULATIVE (not measured — no prod load tests / no telemetry this session)

| Hypothesis | Why speculative | What would confirm |
|------------|-----------------|-------------------|
| **Absolute GB/day from ops bundle** | No Vercel function duration × row-count profiling; Supabase MCP logs empty/inactive in prior forensic | Production metrics: Vercel Observability + Supabase Usage split Database vs Auth |
| **notification scan as dominant sub-worker** | Code suggests 22 scanners × per-org caps (prior forensic STRONGLY SUPPORTED) | `logUsageWorkerEnd` byte/duration tags per sub-result in prod logs |
| **Self-HTTP kick doubles invocations** | Kick frequency depends on write volume; not counted in audit | Count `dg-events-worker` 200s vs event insert rate in prod |
| **Storage provision recovery chain** | Kicked from ops-worker; external Google HTTP separate from Supabase egress | Trace single org with stuck provision through one cron |
| **SUMIT expense worker OCR drain** | Third cron at 06:30 UTC — overlap with morning ops bundle | Correlate 06:00 vs 06:30 spikes on dashboard |
| **User RSC session cache hides cron impact** | `loadCachedSessionDb` 45s cache on interactive traffic — crons bypass user cache | Compare egress on zero-DAU days vs active days (Owner dashboard) |
| **Egress spike 2026-10-04 / 500MB 2026-10-08** | Reported in forensic; **not independently verified** here | Supabase service-level egress breakdown for those UTC dates |

### No prod load tests (explicit gap)

- Executable proof wave ran **Vitest only** (integration/unit/UI) — **no k6**, **no production cron replay**, **no Vercel log pull** in this disposition pass.
- **OPS-005** remains **VERIFIED TEST INFRASTRUCTURE** — consumer covered; full `ops-worker` HTTP integration not exercised under load.

## Operational implications (audit verdict)

| Item | Verdict |
|------|---------|
| Zero-user days still incur DB egress | **CONFIRMED** via cron schedules + ops-worker design |
| Bundling 11 jobs increases blast radius of one cron | **CONFIRMED** via `Promise.all` |
| Kick swallow hides under-drain | **CONFIRMED** (OPS-004) — observability gap, not proven GB impact |
| Exact overage GB attributable to ops-worker | **SPECULATIVE** until dashboard + worker diagnostics |

---

*End of Vercel–Supabase consumption section — 2026-10-09.*
