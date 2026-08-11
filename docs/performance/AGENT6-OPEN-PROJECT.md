# Agent 6 — Open-project performance

**Status:** code-path complete (no production Playwright in this agent)  
**Baseline:** `docs/performance/AGENT12-MEASURE-NOTES.md` + `LIVE-VERIFICATION.json`  
**Policy:** React `cache` + in-request authz memo only. No cross-request Actual/Forecast cache.  
**Constraints:** Did not edit `get-project-financials.ts` / compose / batch / migrations `0000–0030` / `session.ts` / portal. No commit/push.

## Before (documented production)

| Flow | Repeated wall | Notes |
|------|---------------|-------|
| C. Projects → open project | **995ms** (Agent 12) / **1009ms** (`LIVE-VERIFICATION.json`) | 3 RSC flights; max RSC 151ms / ~82KB. Wall dominated by Flight + hydrate. Ready = heading + overview tab selected. |

## What changed

| Change | Effect |
|--------|--------|
| `load-project-financials.ts` — React `cache` wrapper around `withOrgContext` + `getProjectFinancials` | Dedupes Overview snapshot, Financials panel, and Budget panel in one request. Formulas unchanged. |
| `load-project-detail.ts` — chrome ∥ structure and chrome ∥ WP-count | Removes sequential `withOrgContext` txs on open. Layout + overview share chrome cache. |
| Overview no longer awaits WP/phase/milestone rows before contract cards | Nested Suspense: schedule + milestones own structure fetch (same `cache` key). |
| Warm `loadProjectDetail(id, true)` as soon as the request is not a module tab | Structure overlaps chrome instead of starting after the page shell. |
| Warm `loadProjectFinancials` on overview | Snapshot compose overlaps chrome instead of starting after OverviewTab translations. |
| Module panels loaded via conditional `import()` of the **active tab only** | Overview does not pull financials/expenses/billing/budgets/team client graphs. |
| Slimmer milestone Flight props | Client list only needs id/name/date/status/archivedAt. |

Pressable classes and list `PrefetchOnIntentLink` were not touched.

## After (how measured)

Production `next start` Playwright was **not** re-run here (no live app in this agent).

**Code-path query / compose count on repeated open (overview):**

| Step | Before | After |
|------|--------|-------|
| Layout chrome + WP-count | Sequential txs | Parallel txs; chrome shared with page |
| Overview structure (WP/phase/milestone) | Blocks contract cards | Nested Suspense; warmed in parallel with chrome |
| `getProjectFinancials` / compose | 1× (snapshot) on overview | 1× via request `cache` (snapshot). 0 extra on module-tab collision |
| Module-tab panels | Statically imported in page graph | Active tab only |
| Financials + Budgets same request | 2× compose | 1× compose (`cache`) |

**Expected repeated open wall:** **~650–800ms** if the router can commit layout chrome (heading + overview tab) without waiting on structure + compose. Residual hydrate of tab enhancer + milestones client still sits in the 995ms → 700ms gap.

If Next buffers the whole page Flight until nested Suspense resolves, wall improvement is smaller (parallel txs + slimmer milestone props only) — **residual risk** below.

## Residual risk

| Item | Severity |
|------|----------|
| Shared `(app)` layout RSC sibling (~27KB in live verify) still ships on route entry | MEDIUM — outside this route’s payload |
| Overview snapshot still runs full `getProjectFinancials` (required for the overview card) | Accepted — correctness over skipping the card |
| Nested Suspense may not split the measured Flight if the App Router waits for all postponed content before commit | MEDIUM — re-run `performance-verify.spec.ts` flow C at final gate |
| Overview imported `@/modules/financials/ui` barrel (home/reports/cash-flow) | Fixed by Lead: snapshot is a slim server module; tab panels import concrete files |
| Warming structure before job/work-order redirect costs one extra structure fetch on mis-routed job URLs | LOW |
| Tab list still uses default Next `Link` prefetch (not `PrefetchOnIntentLink`) | Unchanged — do not confuse with list intent prefetch |

## Files touched

- `src/app/[locale]/(app)/projects/[projectId]/load-project-financials.ts` (new)
- `src/app/[locale]/(app)/projects/[projectId]/load-project-detail.ts`
- `src/app/[locale]/(app)/projects/[projectId]/page.tsx`
- `src/app/[locale]/(app)/projects/[projectId]/overview-tab.tsx`
- `src/app/[locale]/(app)/projects/[projectId]/overview-schedule-milestones.tsx` (new)
- `src/app/[locale]/(app)/projects/[projectId]/milestones-panel.tsx`
- `src/app/[locale]/(app)/projects/[projectId]/financials/page.tsx`
- `src/modules/financials/ui/load-cached-project-financials.ts` (new)
- `src/modules/financials/ui/project-financials-panel.tsx`
- `src/modules/budgets/ui/project-budget-panel.tsx`
- `src/modules/budgets/application/queries.ts` (`costPromise` option only; compose still from engine cost)
- `docs/performance/AGENT6-OPEN-PROJECT.md` (this file)
- `docs/performance/AGENT12-MEASURE-NOTES.md` (pointer)
