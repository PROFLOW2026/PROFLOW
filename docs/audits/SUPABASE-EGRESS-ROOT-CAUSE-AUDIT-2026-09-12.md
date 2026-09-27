# PROJECTFLOW SUPABASE EGRESS ROOT CAUSE AUDIT

**Date:** 2026-09-12  
**Project:** `wrsgyjozllmtehiqjtew` (`GLA7479's Project`, `eu-west-1`)  
**Method:** Code/config review + Supabase MCP logs (no broad live SQL data scans)  
**Commit / Push / Deploy:** NONE

---

## Executive summary card

| Field | Value |
| --- | --- |
| Current egress | **20.47 GB** (Owner-reported) |
| Quota | **5.5 GB** (Owner-reported; Free plan docs list **5 GB** uncached) |
| Primary source | **Database** (direct Postgres connections) |
| Tests hitting live DB | **NO** (default unit/integration/migration/E2E/CI) |
| Tests hitting live Storage | **YES (conditional)** — `real-storage-roundtrip` when `.env.local` present |
| Recent audit scripts hitting live DB | **YES** |
| N+1 / repeated query issue | **YES** (scripts + historically heavy app round-trips) |
| Storage hotspot | **NO** |
| Cron hotspot | **NO** |
| Code fix required | **YES** (guards / stop prod-targeting scripts) — deferred per Owner |
| Upgrade required immediately | **YES** (to avoid Fair Use restriction by 2026-09-14) |
| Commit / Push / Deploy | **NONE** |

---

## 1. Primary source

**Primary source = Database egress via direct Postgres**, not Storage / Realtime / Edge Functions / PostgREST Data API.

### Evidence

1. **Local `.env.local` points both `DATABASE_URL` and `DIRECT_DATABASE_URL` at**  
   `db.wrsgyjozllmtehiqjtew.supabase.co:5432`  
   That is the **direct** endpoint. Per Supabase docs, result bytes on this path count as **Database Egress**.

2. **App data path is Drizzle + `postgres` (wire protocol), not `supabase.from()` / PostgREST.**  
   Supabase JS is used for **Auth** + **Storage** only.

3. **Edge logs (sample days):**

   | Day (UTC) | Edge total | `/auth/` | `/rest/` | `/storage/` | `/realtime/` |
   | --- | ---: | ---: | ---: | ---: | ---: |
   | 2026-09-01 | 97 | (low activity day) | — | — | — |
   | 2026-09-07 | 2643 | **2634** | **0** | 6 | 0 |
   | 2026-09-11 | 376 | **340** | **0** | 36 | 0 |

   **Zero REST/Data API traffic.** Almost all HTTP API traffic is Auth (`GET /auth/v1/user`).

4. **Storage log volume is tiny** (tens of events/day). Recent storage traffic includes OCR audit uploads matching the live storage integration test (`documents/ocr-audit/*.jpg`), not mass file serving.

5. **Realtime ≈ 0** in sampled days.

6. **PostgREST log volume (~13k/day) is not query traffic.** Samples show schema-cache reload / reconnect noise (`schema "pg_pgrst_no_exposed_schemas" does not exist`), not `/rest/v1` data reads.

### Inferred ranking (exact GB unavailable via MCP)

MCP has **no usage-GB API**. Exact service GB must be confirmed on:

**Supabase Dashboard → Organization → Usage → Total Egress → hover day → breakdown by service.**

| Category | Evidence-based share | Notes |
| --- | --- | --- |
| Database (direct) | **Dominant (inferred)** | Local scripts + app `postgres` → `db.*:5432` |
| Shared Pooler | Possible secondary | Supavisor activity spikes on heavy-dev hours |
| Auth | Small–moderate | High request count, small payloads |
| Storage | Small | Low request count; OCR test roundtrips |
| Realtime | ≈ 0 | |
| Functions | ≈ 0 | No Edge Functions traffic observed |
| Other / PostgREST API | ≈ 0 for data | Reconnect log noise only |

**Breakdown numbers to fill from Dashboard (Owner):**

```
Database   = ___ GB
Storage    = ___ GB
Realtime   = ___ GB
Functions  = ___ GB
Auth       = ___ GB
Other      = ___ GB
```

---

## 2. Spike vs gradual

**Pattern: bursty development/audit activity on top of baseline app/auth traffic — not a steady Storage CDN burn.**

### Sep 7 spike (UTC hours) — coincides with `diagnose-alert-eligibility-output*.json` (mtime 2026-09-07)

| Hour (UTC) | Edge | Auth | Supavisor |
| --- | ---: | ---: | ---: |
| 12:00 | 17 | 13 | 0 |
| **13:00** | **516** | **519** | **261** |
| **14:00** | **475** | **474** | **257** |
| **15:00** | **1061** | **1073** | **512** |
| 16:00–18:00 | 0 | 0 | 0 |

Quiet baseline (Sep 5): most hours **0**; peak hour ~107 edge.

**Spike period (observed):** heavy clusters around **2026-09-07** (and similarly elevated **2026-09-09** with ~1521 edge).  
**Estimated daily average if 20.47 GB over ~30 days:** ~**0.68 GB/day** — but actual days are uneven (audit days >> quiet days).

---

## 3. Tests vs live Supabase

### Definitive answers

| Suite | Hits live Postgres? | Hits live Storage/Auth? |
| --- | --- | --- |
| `npm run test` / `test:unit` / `test:ui` | **NO** | NO |
| `test:integration` / `test:migration` | **NO** (PGlite WASM) | **Conditional YES** — only `tests/integration/documents/real-storage-roundtrip.test.ts` loads `.env.local` and runs against live Storage when keys exist |
| Playwright local default | **NO** (PGlite harness) | Local mock auth URL |
| CI quality job | **NO** | Build uses `https://example.supabase.co` |
| CI Playwright smoke | **NO** — `postgres:16` service on localhost | Local harness auth URL |

`TEST_DATABASE_URL` in `.env.local` is empty → integration suite stays on PGlite.

**Did the full test suite use production/live DB?**  
**NO** for Postgres.

**Did any test hit live Supabase recently?**  
**YES for Storage** — edge/storage logs show `ocr-audit/*.jpg` signed upload/download/delete patterns matching `real-storage-roundtrip.test.ts` (observed 2026-09-11). Payload size is small (tiny JPEG fixture); not the 20 GB driver, but it must be gated off production.

---

## 4. Recent live scripts (high risk)

Dozens of `scripts/*` load `.env.local` and **require** real `DATABASE_URL` / `DIRECT_DATABASE_URL`. They all count as Database egress.

### Highest-risk examples

| Script | Tables / paths | Pattern | Est. egress/run |
| --- | --- | --- | --- |
| `diagnose-alert-eligibility.mjs` | inbox, expenses, labor runs, time_entries, attendance | **N+1** per labor run; dumps large nested JSON | **~10–15+ MB** proven (local dump 14.06 MB; `fadi375Trace` alone ~9.3 MB) |
| `validate-workforce-derived-data.ts` | employees × months, outcomes, payroll, allocations | Org-wide loops | Medium–high |
| `repair-workforce-historical-recompute.ts` | attendance outcomes → recompute | Per-employee historical | Medium–high |
| `profile-real-tab-path.ts` | overview/billing/expenses/schedule payloads | Repeated cold+warm tab loads | Medium (many queries × large payloads) |
| `audit-payment-basis-inventory.mjs` | **all** `payments` + joins | Global inventory SELECT | Medium |
| `audit-billing-vat-live.ts` | billing_records + tax_snapshot JSON | Org-wide + JSON blobs | Medium |
| `audit-legacy-payments-vs-vat.mjs` | billing + payments | Org-wide | Low–medium |
| `owner-gate-final-verify.ts` | many modules / sync probes | Broad live verification | Medium–high |
| `post-migration-0083-audit.mjs` | payments / billing aggregates | Org-scoped aggregates | Low–medium |
| Many `verify-*` / `probe-*` / `diagnose-fadi*` | targeted SELECTs | Live direct connection | Low each; costly when repeated |

**Recent audit scripts hitting live DB = YES.**

Proven artifact: `scripts/diagnose-alert-eligibility-output.json` (**14.06 MB**, 2026-09-07) + compact twin (**14.06 MB**). That is **local disk copy of bytes already egressed** from Supabase.

---

## 5. Application query volume

### High-traffic paths

| Area | Finding |
| --- | --- |
| Financials | Historical audit: **~51 serialized queries** / page load (`docs/audits/financials-sql-performance-closure.md`). Round-trip latency problem; egress scales with payload × visits × local-dev against prod. |
| Command Center / Home | `getActionableInbox` + collectors pull multi-source alert sets (used heavily by diagnose scripts). |
| Project tabs | `profile-real-tab-path.ts` exists specifically to measure real Supabase tab payloads (duplicate table reads detected in profiler). |
| Polling / Realtime | No meaningful Realtime subscriptions found; no Storage CDN hot-loop. |
| Auth middleware | Frequent `GET /auth/v1/user` — request-heavy, payload-light. |

**App N+1 / repeated reads:** YES as a contributor (especially Financials round-trips + inbox collectors), but **not sufficient alone** without the volume of **local live-DB scripting + local/prod direct connections**.

---

## 6. Storage

| Question | Answer |
| --- | --- |
| Storage hotspot? | **NO** |
| Top pattern | Occasional document uploads + OCR audit test files under `documents/` / `ocr-audit/` |
| Role in 20.47 GB | Unlikely primary |

---

## 7. Ops worker / cron

`vercel.json` (region `dub1`):

| Cron | Path | Schedule |
| --- | --- | --- |
| OCR recovery | `/api/internal/ocr-worker` | `0 5 * * *` (daily) |
| Ops / recurring | `/api/internal/ops-worker` | `0 6 * * *` (daily) |

`ops-worker` runs `generateDueRecurringDrafts()` — daily, not a full-table dump loop.

**Cron hotspot = NO** (unless Owner later finds Dashboard GB attributed to these routes — unlikely vs script bursts).

---

## 8. Exact root cause

**Exact root cause:**  
ProjectFlow’s **production Postgres is used as the daily development/audit database** via **direct** `db.*:5432` connections from local machines (and Vercel). A large wave of **live read/repair/diagnose/verify scripts** (plus local app sessions) returned **multi‑MB result sets** repeatedly. Supabase Fair Use meters that as **Database egress**. Storage/Realtime/REST are not the drivers.

Secondary contributors: Auth request volume; occasional live Storage test; production app page loads with multi-query financial/inbox payloads.

---

## 9. Immediate safe actions (no code deploy required)

1. **STOP** all `scripts/audit-*`, `diagnose-*`, `verify-*`, `probe-*`, `repair-*`, `profile-real-*`, `validate-*`, `owner-gate-*` against `.env.local` production.
2. **Do not** point local `next dev` at production until egress is under control (or use a local/throwaway DB).
3. Owner: open **Supabase Usage → Egress by service by day** and paste the GB breakdown into this report.
4. Owner: **upgrade to Pro (250 GB quota)** or otherwise lift Fair Use restriction **before 2026-09-14** — past egress cannot be undone; quota increase prevents restriction.
5. Gate `real-storage-roundtrip` so it never runs against production (env flag / skip unless `ALLOW_LIVE_SUPABASE_STORAGE=1`).
6. Keep CI as-is (already safe). Do not add production secrets to CI.
7. Optional: delete local mega-dumps (`scripts/diagnose-alert-eligibility-output*.json`) — disk only; does not reclaim egress.

---

## 10. Code fix required?

**YES** (later wave):

- Hard refuse scripts when host is `*.supabase.co` unless explicit `ALLOW_LIVE_DB=1`
- Ensure `.env.local` for day-to-day work uses local DB
- Disable live Storage test by default
- Continue reducing Financials / inbox query fan-out (already partially addressed historically)

**Not in this wave** — Owner ordered no code changes yet.

---

## STOP
