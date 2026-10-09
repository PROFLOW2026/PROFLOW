# Supabase egress forensic audit (read-only)

**Date:** 2026-10-08  
**Project ref:** `wrsgyjozllmtehiqjtew` (eu-west-1)  
**Owner-reported usage:** ~5 GB included, ~9.87 GB used, ~4.87 GB overage; ~500 MB on 2026-10-08 with minimal user activity; large spike ~2026-10-04  
**Code / DB / deploy changes:** NONE  

---

## Evidence availability (critical)

| Source | Result |
| --- | --- |
| Supabase MCP `get_project` | Project found; **status `INACTIVE`** at audit time |
| Supabase MCP `execute_sql` | **Connection timeout** (including `SELECT 1`) |
| Supabase MCP `query_logs` (ClickHouse) | **Empty** for 2026-10-04, 2026-10-08, and default 24h window |
| Supabase MCP usage GB by service | **Not exposed** via MCP (same as 2026-09-12 audit) |
| GitHub / Vercel API from agent | **Not available** (`gh` not authenticated) |

**Implication:** Service-level GB breakdown, `pg_stat_statements`, and log-derived call counts **cannot be proven from telemetry in this session**. Findings below separate **PROVEN**, **STRONGLY SUPPORTED**, and **NOT SUPPORTED**. Owner dashboard numbers are cited as reported, not independently verified here.

Prior audit (2026-09-12) established that ProjectFlow’s live app path uses **Drizzle + direct Postgres** (`db.*.supabase.co:5432`), not PostgREST, for business data; Supabase JS is **Auth + Storage**. That architectural fact remains true in current code.

---

## 1. Egress breakdown by service (dashboard metadata)

Fill from **Supabase Dashboard → Organization → Usage → Total egress** (hover day → service split). MCP could not retrieve these values.

| Window | SERVICE | EGRESS | TIME WINDOW | EVIDENCE |
| --- | --- | --- | --- | --- |
| Billing period | *All* | ~9.87 GB used (Owner) | Current period | Owner dashboard |
| A. Billing period | Database | **___ GB** | Period | Dashboard |
| A. Billing period | Storage | **___ GB** | Period | Dashboard |
| A. Billing period | Auth | **___ GB** | Period | Dashboard |
| A. Billing period | Realtime | **___ GB** | Period | Dashboard |
| A. Billing period | Edge / API | **___ GB** | Period | Dashboard |
| B. Oct 4 spike | *TBD* | Spike day | 2026-10-04 UTC | Dashboard + logs (MCP empty) |
| C. Oct 8 | *TBD* | ~500 MB (Owner) | 2026-10-08 | Dashboard + logs (MCP empty) |

**STRONGLY SUPPORTED (architecture, consistent with Sep 2026 audit):** **Database (direct wire protocol)** is the dominant egress class when this app or `scripts/*` run against production. Auth is secondary by bytes (high request count, small payloads). Storage/Realtime/Edge data plane historically negligible unless dashboard shows otherwise.

---

## 2. High-volume database callers (metadata)

**PROVEN:** `pg_stat_statements` / row-return stats **not obtainable** (SQL timeout; project inactive).

**STRONGLY SUPPORTED top patterns from code** (when workers or authenticated traffic run):

| Pattern | Module | Egress profile |
| --- | --- | --- |
| `collectAllSources` | Command Center | Large multi-module SELECT fan-out per org |
| `runNotificationScan` × all orgs | `notification-scan-ops-worker` | 22 scanners × per-org cap (8s / 25 items cron) |
| `listActiveOrganizationIds` + per-org owner context | All daily ops jobs | O(orgs) × (membership + permission resolution) |
| `runMaterialMarketRefresh` | Material market cron | External fetch + DB upserts; reads from `2016-01` bootstrap on new sources |
| `runStorageProvisionCycle` | Storage provision worker chain | Many mapping/project rows; **external** provider HTTP (not Supabase Storage egress) |
| `runDgEventConsumer` | DG events | Bounded batch consumer + backlog count |
| `loadCachedSessionDb` / `loadCachedOrgAuthz` | Every authenticated RSC request | Short transactions; cached 45s |
| `scripts/consultancy-demo/*`, `scripts/*audit*`, `diagnose-*` | Local operator | **Direct DB**; can be 10+ MB per heavy JSON dump (Sep audit) |

**NOT on normal shell path (see §6):** `collectAllSources` on initial HTML for app chrome.

---

## 3. Background activity map

| JOB | SCHEDULE | ENDPOINT | DB QUERIES (summary) | ZERO USERS | POTENTIAL EGRESS | LAST KNOWN RUN |
| --- | --- | --- | --- | --- | --- | --- |
| OCR drain | `0 5 * * *` UTC | `/api/internal/ocr-worker` | Admin OCR queue drain | YES | Low–medium (queue depth) | Daily cron |
| Ops bundle | `0 6 * * *` UTC | `/api/internal/ops-worker` | See rows below | YES | **High** (all orgs) | Daily cron |
| SUMIT expense + OCR | `30 6 * * *` UTC | `/api/internal/sumit-expense-worker` | Enabled orgs poll + OCR drain | YES | Medium | Daily cron |
| DG events consumer | On event + ops bundle | `/api/internal/dg-events-worker` | SKIP LOCKED consumer | YES* | Medium | Event-driven + daily safety |
| Storage provision | Kick + daily recovery | `/api/internal/storage-provision-worker` | Batch clients/projects/mappings | YES | Medium–high DB reads | Chain / recovery |
| Recurring drafts + auto payments | In ops bundle | (ops-worker) | Per-org occurrences + payments | YES | Medium | Daily |
| Task recurrence | In ops bundle | (ops-worker) | Per-org | YES | Medium | Daily |
| Task reminders | In ops bundle | (ops-worker) | Per-org | YES | Medium | Daily |
| Notification scan (22 scanners) | In ops bundle | (ops-worker) | **Per-org full scan** | YES | **High** | Daily |
| Material market refresh | In ops bundle | (ops-worker) | Seed + observations + snapshots | YES | Medium–high | Daily |
| SUMIT recovery | In ops bundle | (ops-worker) | Per-org ambiguity scan | YES | Medium | Daily |
| Quote expiry | In ops bundle | (ops-worker) | Per-org | YES | Low–medium | Daily |
| Material pressure alerts | In ops bundle | (ops-worker) | Per-org | YES | Medium | Daily |
| Margin snapshots | In ops bundle | (ops-worker) | Per-org | YES | Medium | Daily |
| DG events ops | In ops bundle | (ops-worker) | Consumer ≤20s | YES | Medium | Daily |

\*DG worker also fires on **`emitDomainEvent`** via HTTP kick (`scheduleDgEventDrain`), not on every page view.

**Accidental recursion (code review):**

- Storage provision: HTTP chain with lease guards (`shouldScheduleStorageProvisionHop`) — **designed**, not unbounded in-process recursion.
- DG events: `scheduled` flag + daily ops safety net — **not** proven runaway loop without logs.
- OCR: enqueue + kick; daily cron is recovery — **not** proven loop.

---

## 4. Build-time database access

**Question:** Does `next build --webpack` query production Supabase?

| Check | Result |
| --- | --- |
| CI `npm run build` | **No `DATABASE_URL`** (`.github/workflows/ci.yml`) |
| `generateStaticParams` | **Only** `[locale]/layout.tsx` (locales list) — no DB |
| Root `layout.tsx` | Uses `cookies()` → routes are **dynamic**; no static prerender of authenticated trees |
| `getSessionState` at build | Without request cookies → **anonymous** → public homepage branch only (no `withOrgContext` dashboard) |
| Module-level `getDb()` | **Not** at import top-level |
| `prebuild` / postbuild DB scripts | **None** in `package.json` |

**PROVEN:** GitHub CI production build does **not** configure `DATABASE_URL`.

**STRONGLY SUPPORTED:** Standard Vercel **`next build`** does **not** execute authenticated page data collection against Postgres (dynamic RSC + no static params over product routes).

**NOT SUPPORTED:** Claim that **webpack compile alone** generates hundreds of MB Supabase egress per build.

**Caveat (STRONGLY SUPPORTED):** Local/Vercel build loads **`.env.local` / project env**. If the operator runs **`next dev`**, **scripts**, **migrations**, **seeds**, or **tests** with production `DATABASE_URL`, that traffic is **Database egress** and is **not** attributed to “build” in Supabase metrics but may coincide with deploy days.

---

## 5. Polling / recurring client & server fetch

| INTERVAL | ENDPOINT / ACTION | QUERY / WORK | STOPS WHEN HIDDEN |
| --- | --- | --- | --- |
| Every request | `proxy` → `refreshSupabaseSession` | Auth `getUser()` | N/A (server) |
| 45s cache | `loadCachedSessionDb`, `loadCachedOrgAuthz` | Session + membership + permissions | N/A |
| 2s | Quick capture OCR UI | `pollCaptureOcr` / actions | Page unmount |
| 2s | OCR review panel | Poll job status | Page unmount |
| 4s | `ConnectivityBanner` | Offline queue counts (IndexedDB, not Supabase) | Unmount |
| On bell open only | `listNotificationsAction` | **`listMergedNotificationInbox`** → CC collectors | N/A |
| Manual | Notification “Scan” button | `runNotificationScanAction` | N/A |

**No shell-wide notification polling loop** found.

---

## 6. Shell load (regression check)

**PROVEN (current code + unit tests):**

- `NotificationBellLoader` uses **`getShellNotificationBadgeCount`** only — not `collectAllSources` (`notification-bell-loader.tsx`, `shell-cpu-collect.test.ts`).
- `AppShell` does not import Command Center collectors.
- `listMergedNotificationInbox` → `getActionableInboxIfAllowed` → **`collectAllSources`** runs on **bell open**, `/notifications`, and related actions — **not** on initial shell render.

**One normal authenticated page load (call graph, simplified):**

1. Edge: `proxy` → Supabase Auth `getUser()`
2. RSC: `getSupabaseUser()` (cached) + `loadCachedSessionDb` (45s cache)
3. `(app)/layout`: `withOrgContext` → `assertOwnerAppSurface`
4. `AppShell`: `getShellContext` → org settings, modules, logo (single org authz memo per request)
5. `NotificationBellLoader`: badge snapshot + unread count (small)
6. **Page segment**: route-specific `withOrgContext` queries only

**SHELL REGRESSION = NO** for Command Center fan-out on initial load (optimizations **present**).

---

## 7. Storage egress

**STRONGLY SUPPORTED:** Primary file traffic is **external storage** (Microsoft/Google/Dropbox/Box), not Supabase Storage CDN.

**Sep 2026 audit:** Storage log volume tiny; OCR test fixture traffic only.

**NOT PROVEN** for Oct 2026 without dashboard/logs. If Storage GB > 0, check bucket `documents` / OCR artifacts and signed URL loops — **not supported** as primary driver without metrics.

---

## 8. Oct 4 spike

| Factor | Evidence |
| --- | --- |
| Deployments | Git: `4c9e5a49` (2026-10-04 00:48 +0300) **feat(developer-gc)**; `be0b8e2e` (02:21) **Webpack build unblock** — implies **multiple Vercel build attempts** |
| Schema/data | No migration executed in this audit |
| Demo seed | `npm run seed:consultancy-demo` → `scripts/consultancy-demo/*` uses **`DATABASE_URL`** (heavy writes + reads) — **egress if run against prod** |
| Cron | Single daily ops window (05:00–06:30 UTC) — unlikely alone to explain **single-day GB spike** unless org/data grew step-wise |
| New GC surfaces | More routes/modules → **more dev smoke** and **ops scan surface**, not build-time DB |

**OCT 4 ROOT CAUSE (best evidence in this session):**  
**STRONGLY SUPPORTED:** Combination of **(a) operator/CI-adjacent activity against production Postgres** (deploy day + GC release: local scripts, demo seed, dev server, or repeated authenticated smoke) and/or **(b) heavy daily ops-worker first run after data growth** — **not provable without dashboard hour-by-hour split or logs**.

**CONFIDENCE:** **LOW–MEDIUM** for exact mechanism; **MEDIUM** that spike is **Database**, not Storage.

---

## 9. Oct 8 / today

| Observation | Assessment |
| --- | --- |
| ~500 MB, low user traffic (Owner) | Consistent with **non-browser** drivers |
| Git activity | **9 commits** 2026-10-08 17:20–23:01 +0300 — release fixes (shell, notifications, GC hubs, build typecheck) → **many Vercel builds likely** |
| MCP logs | Empty (project inactive / log pipeline unavailable) |
| Local build attempt | `next build` reported **`.env.local` loaded** — if production `DATABASE_URL` present locally, **dev/build machine** can generate egress **without production users** |

**OCT 8 ROOT CAUSE (best evidence):**  
**STRONGLY SUPPORTED:** **Database egress from environments holding production `DATABASE_URL`** (local `.env.local` builds/dev, operator scripts, and/or Vercel **runtime** cron/workers) — **not** from CI `npm run build` (no DB URL).

**NOT SUPPORTED:** That **~500 MB is primarily Supabase Storage or Auth** without dashboard split.

**NOT PROVEN:** Exact top query or call count today.

---

## 10. Vercel correlation

| Signal | Correlation |
| --- | --- |
| Oct 8 commit burst | **Build count ↑**; **DB egress correlation only if runtime or local env hits DB** |
| Crons | 3 paths/day — predictable; ops-worker is largest DB consumer |
| Build OOM / RAM | **Independent** of Supabase egress unless build process runs DB clients (ruled out for standard build) |

---

## Final report card

```
CURRENT BILLING EGRESS = ~9.87 GB used / ~5 GB included (Owner-reported; MCP unverified)
TODAY EGRESS           = ~500 MB (Owner-reported; MCP unverified)
OCT 4 SPIKE            = Large (Owner-reported); MCP logs unavailable

EGRESS BY SERVICE (MCP) = NOT AVAILABLE — use Dashboard
DATABASE                = STRONGLY SUPPORTED dominant (architecture + Sep audit)
STORAGE                 = NOT PROVEN material
AUTH                    = Secondary (middleware + getUser per request)
REALTIME                = NOT SUPPORTED material
OTHER                   = PostgREST data plane NOT SUPPORTED (app uses Drizzle)

TOP EGRESS SOURCE       = Direct Postgres (app + workers + scripts) — STRONGLY SUPPORTED
SECONDARY SOURCE        = Supabase Auth HTTP — STRONGLY SUPPORTED when traffic exists

ZERO-USER BACKGROUND TRAFFIC = YES (Vercel crons + workers + possible local/scripts)
BUILD-TIME SUPABASE ACCESS   = NO (standard next build) — PROVEN for CI; STRONGLY SUPPORTED for Vercel build phase
BYTES PER BUILD              = ~0 DB (expected)
BUILDS TODAY                 = Not counted (gh unavailable); STRONGLY SUPPORTED many from git timestamps
ESTIMATED BUILD EGRESS TODAY = NOT SUPPORTED as significant

TOP DB QUERY / ENDPOINT = NOT PROVEN (pg_stat_statements unavailable)
                        = STRONGLY SUPPORTED candidates: ops-worker notification scan, Command Center collectors (on bell/today), session/authz cache misses

SHELL REGRESSION     = NO
POLLING REGRESSION   = NO (shell); bell-open CC merge unchanged by design
WORKER LOOP          = NOT PROVEN
STORAGE LOOP         = NOT PROVEN

OCT 4 ROOT CAUSE     = Deploy/GC release day + likely prod DB clients (scripts/dev/cron) — STRONGLY SUPPORTED, not isolated
OCT 8 ROOT CAUSE     = Prod DATABASE_URL on operator/build/cron path without users — STRONGLY SUPPORTED

CONFIDENCE           = LOW for byte-level attribution; MEDIUM for Database + non-user drivers

CODE MODIFIED        = NO
DB MODIFIED          = NO
DEPLOYED             = NO
```

---

## Recommended fixes (do not implement in this audit)

1. **Restore observability:** Unpause project if intentional pause; re-run dashboard hour split + enable log retention; export Oct 4 / Oct 8 Database vs Auth vs Storage GB.
2. **Prove top queries:** When DB reachable, run read-only `pg_stat_statements` top by `shared_blks_hit + shared_blks_read` and `rows` — focus ops-worker statements and CC collectors.
3. **Separate build from prod DB:** Ensure Vercel **Build** env omits `DATABASE_URL` (Runtime only); keep CI as today; add guard in `shared/db/client` refusing `*.supabase.co` unless `ALLOW_LIVE_DB=1` for scripts.
4. **Cap zero-user blast radius:** Ops-worker already sequential; consider stricter per-org budgets on `runNotificationScan` and material-market bootstrap window for cron path.
5. **Owner workflow:** Never run `seed:consultancy-demo`, `scripts/*`, or local `next dev` with production URLs; use branch DB or local PGlite.

---

## MCP session notes

- `list_projects` returned only unrelated org project; `get_project('wrsgyjozllmtehiqjtew')` succeeded with **`INACTIVE`**.
- Align MCP OAuth org with ProjectFlow billing project before relying on agent for live log/SQL forensics.
