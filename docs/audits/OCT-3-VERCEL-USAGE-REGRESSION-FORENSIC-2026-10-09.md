# Oct 3 regression window — Vercel usage forensic (revised)

**Status:** **ROOT CAUSE UNPROVEN** until `PF_USAGE_*` logs identify request sources.  
**UI / marketing / routes:** unchanged.

---

## Corrections (owner-verified)

1. **Public homepage did NOT start on Oct 3.** At `5d4dded25`, `/[locale]` already rendered `PublicHomepage` for anonymous users with `robots: { index: true, follow: true }` in page metadata.
2. **Oct 3 (`70da27b9`) added** `robots.ts`, `sitemap.ts`, proxy matcher exclusions, marketing content/assets — **not** the existence of the homepage.
3. **FOT vs FDT:** Marketing PNGs under `public/marketing/screenshots/` are **CDN static (FDT)**. Do **not** count them in **Fast Origin Transfer** arithmetic.
4. **654 KB × hypothetical crawl rate** proves **magnitude only**, not that crawlers caused the spike. **No Oct-4 route/UA evidence** in Hobby retention.
5. **Do not average 535K invocations over 30 days** — anomaly is **concentrated from ~Oct 4**; pre/post split **UNKNOWN** without Vercel billing buckets.

---

## Phase A — Production DB (read-only)

**Attempted:** Supabase MCP `execute_sql` on project ref `wrsgyjozllmtehiqjtew` → **connection timeout** (project reported **INACTIVE** in prior audit).

| Area | Result |
|------|--------|
| Storage connections / leases / pending folders | **UNKNOWN** (no live SQL) |
| `domain_events` / retries | **UNKNOWN** |
| OCR queue | **UNKNOWN** |
| Other retry queues | **UNKNOWN** |

**IS ANY STORAGE CHAIN CURRENTLY CAPABLE OF RESUMING** = **UNKNOWN**  
**CAN DG WORKER CURRENTLY WAKE UP WITH WORK** = **UNKNOWN**  
**CAN OCR RECOVERY CURRENTLY GENERATE REPEATED WORK** = **UNKNOWN**

Re-run SQL when production Postgres is reachable (service role, read-only SELECTs only).

---

## Phase B — Diagnostics shipped

See [`docs/operations/USAGE-RUNTIME-DIAG.md`](../operations/USAGE-RUNTIME-DIAG.md).

Enable **`USAGE_RUNTIME_DIAG=1`** on Vercel Production.

---

## Phase E — Oct 3 runtime delta (excluding FDT/static-only)

| Commit | Non-cosmetic runtime |
|--------|----------------------|
| `70da27b9` | **Dynamic** `robots.ts` / `sitemap.ts` routes; proxy matcher; OAuth callback validation |
| `4c9e5a49` | **`emitDomainEvent` → `scheduleDgEventDrain` → self-HTTP**; DG consumer; ops bundle +1 job |
| `be0b8e2e` | Build/lint; retention grant SQL (not applied by this doc) |

**Not in Oct 3 window:** root i18n payload bloat (earlier commits); pre-launch SEO lockdown (`d8ac39bd`, later).

---

## Phase F — Invocation multiplier (code-derived, not measured in prod)

| Request | Middleware (`proxy`) | Supabase `getUser` in middleware | Page/RSC function | Notes |
|---------|----------------------|----------------------------------|-------------------|--------|
| **GET `/he-IL`** (anonymous) | **1** | **YES** (not on public fast path) | **1+** (document + possible RSC prefetches) | Fast path does **not** apply to locale root |
| **GET `/he-IL/sign-in`** (no auth cookies) | **1** | **NO** (fast path) | **1+** | |
| **Authenticated app navigation** | **1** | **YES** | **1+** | App shell RSC |
| **RSC flight** (`RSC: 1` header) | **1** if matched | Often **YES** | **1** RSC handler | Logged as `routeClass=rsc` when diag on |

**500K Function Invocations ≠ 500K browser page views** (middleware + RSC + workers + crons).

---

## Phase D — FOT arithmetic (compute bytes only)

Pre-fix anonymous `/he-IL` HTML ≈ **654 KB** (measured Oct 9 pre-`87c86a31`).  
Post-fix ≈ **176 KB** (same conditions).

To reach **~900 MB/h FOT** with **654 KB** compute response only:

- **~1,400 full document responses/hour** (~23/min) **if** each hit is one FOT-sized response (actual multiplier may be higher with RSC).

**This is capacity math, not proof of traffic.**

---

## Next step

Aggregate Vercel logs by `pathname` + `uaClass` + `routeClass` after first burst with `USAGE_RUNTIME_DIAG=1`.

**ROOT CAUSE STATUS:** **STILL UNKNOWN**
