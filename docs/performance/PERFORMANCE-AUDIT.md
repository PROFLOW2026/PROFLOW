# Performance Audit — ProjectFlow

**Status:** Wave complete (measure → optimize) · 2026-08-09  
**Constraints:** No financial formula changes · No RLS weakening · No long-lived stale financial cache · No commit in this wave

Legend: **P0** user waits seconds / major nav · **P1** noticeable repeated delay · **P2** minor

---

## Executive summary

| Rank | Bottleneck | Severity | Fix |
|------|------------|----------|-----|
| 1 | Org rollup called `getProjectFinancials` per project (~10×N queries) | P0 | Set-based `loadProjectFinancialsBatch` + shared `composeProjectFinancials` |
| 2 | Project `?tab=` soft-nav reloaded structure + work/details extras every click | P0 | Chrome-only detail on module tabs; gate extras; request `cache` for detail |
| 3 | Auth/org/permission re-resolved on every `withOrgContext` in one request | P0 | Request-scoped `org-authz-memo` |
| 4 | Home dashboard double-loaded org billing for overdue count | P1 | Derive overdue from already-loaded rows |
| 5 | Client paid for Drizzle schema leak + always-mounted More/sync/heavy panels | P0/P1 | Client-safe settings options; lazy More/OCR/import/export/marketing/offline |

**Caching policy:** React `cache` and in-request authz memo only. No cross-request cache of Actual/Forecast. Financial truth stays query-fresh under RLS.

**Client bundle (measured on disk chunks):** `.next/static/chunks` **3058 KB → 2631 KB (−427 KB)**. Largest client chunk **463 KB → 277 KB**. `exceljs` remains server-only.

---

## Important routes

| Route | Current behavior | Server/query bottleneck | Client bottleneck | Severity | Fix | Result |
|-------|------------------|-------------------------|-------------------|----------|------|--------|
| Login → Dashboard | Shell + home financial rollup | N× `getProjectFinancials` | Shell hydrate | P0 | Batch financials + authz memo + overdue reuse | ~O(N) → O(1) query groups |
| Dashboard → Projects | List + filters | Light list queries | — | P2 | Unchanged (already set-based) | OK |
| Projects → open project | Full detail + extras | Structure + lists always | Tab shell | P0 | Conditional structure/extras | Module tabs much cheaper |
| Overview → Financials | Soft-nav RSC | Was full detail + extras | Pending skeleton | P0 | Chrome-only + Suspense panel | Structure/extras skipped |
| Financials → Expenses | Soft-nav RSC | Same | Same | P0 | Same pattern | Same |
| Expenses → Changes | Soft-nav RSC | Same | Same | P0 | Same | Same |
| Changes → Billing | Soft-nav RSC | Same | Same | P0 | Same | Same |
| Project → Documents | Soft-nav RSC | Same | Document client | P1 | Chrome-only + lazy where applicable | Improved |
| Dashboard → Reports | Org rollup + analytics | Same N× financials | Export actions | P0/P1 | Batch rollup + lazy export actions | Query O(1); export deferred |
| Settings → roles | Permissions per role | N+1 | — | P1 | `listPermissionsByRoleIds` | 2 queries |
| Mobile nav | More destinations | — | Large client nav | P1 | Split “more” sheet lazy | Smaller initial mobile chrome |

---

## Measurement notes

Exact wall-clock TTFB was **not** instrumented in a live production browser in this wave. Query-count changes are derived from code paths and unit tests.

| Flow | Query count BEFORE (approx) | Query count AFTER (approx) |
|------|----------------------------|----------------------------|
| Org rollup N projects | `2 + ~10×N` | `2 + ≤12` org-scoped groups |
| Module tab soft-nav | Full structure + up to 6 extras + detail | Chrome detail (+ panel own queries) |
| Settings roles R roles | `1 + R` | `2` |
| Home overdue | Extra full billing load | 0 extra |

| Flow | Timing BEFORE | Timing AFTER |
|------|---------------|--------------|
| Org rollup / dashboard financials | Scales with N (pool of 8) | Dominated by few set scans |
| Module tab click | Full RSC page work | Reduced server work; optimistic tab still immediate |
| Authz within one request | Repeat membership/permission loads | Once per (user, org, locale) |

Dev Next.js compile/HMR still inflates local feel; production Vercel remains the truth for TTFB.

---

## Indexes / migrations

**No new migration in this wave.** Existing allocation indexes (`expense_id`, org+status, `run_id`) are adequate for V1 access patterns. Candidates for a future **0019+** only if EXPLAIN shows pressure: `committed_costs (organization_id, project_id)`, `ap_bills (organization_id, project_id)`.

---

## Deferred / remaining

| ID | Item | Severity |
|----|------|----------|
| R1 | Soft-nav still re-executes project page RSC (no stable layout chrome slot) | P1 |
| R2 | Many small RLS txs per `withOrgContext` (panels) — coalesce later | P1 |
| R3 | Edge + RSC each call Auth `getUser` (required cookie refresh) | P2 |
| R4 | Dashboard may still load org expense contributions twice (rollup batch + expense layer) | P2 |

---

## Targeted tests (this wave)

- Financial unit suite under `tests/unit/financials` (incl. compose / forecast / committed)
- `tests/unit/shared/org-authz-memo.test.ts`
- `tests/ui/query-tab-pending.test.tsx`, `tests/ui/mobile-nav.test.tsx`
- `tests/integration/tenancy/rls-hardening.test.ts`
- Vitest `server-only` stub so Node tests can import server modules (production client still blocked)

**Lead verification:** 17 files / 74 tests PASS + `tsc --noEmit` PASS. No commit/push.
