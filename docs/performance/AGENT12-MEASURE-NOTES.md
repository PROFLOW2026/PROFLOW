# Agent 12 — Performance measure notes (overnight)

Source baseline: `docs/performance/LIVE-VERIFICATION.json` (2026-08-10 production `next start`).

## Open project (primary target)

| Flow | Repeated wall | Classification | Notes |
|------|---------------|----------------|-------|
| C. Projects → open project | **995ms** | ACCEPTABLE (near NOTICEABLE) | RSC ~80KB across 2–3 flights; max RSC 137ms. Wall dominated by Flight size + hydrate, not DB alone. |

**Changes this wave (code):**
- Strip milestone `notes` before client `MilestonesPanel` props (smaller Flight)
- Preserve global press feedback (`pressable*` classes untouched)
- Prefetch-on-intent already on project list / dashboard recent

**Still toward &lt;700ms (realistic next):**
- Nested Suspense: schedule/contract first, milestones panel own fetch — **done in Agent 6** (`docs/performance/AGENT6-OPEN-PROJECT.md`)
- Slimmer WP/phase rows for schedule-only overview (avoid full structure DTO) — structure no longer blocks contract cards; WP rows stay server-side for schedule
- Coalesce panel `withOrgContext` txs (R2 in PERFORMANCE-AUDIT) — chrome ∥ structure/count; request-cached financials wrapper
- Avoid re-shipping large layout Flight on soft-nav where possible (shared `(app)` sibling still residual)

**Agent 6 (2026-08-11):** code-path only; expected repeated open **~650–800ms** if chrome commits before structure/compose. Lead re-measure: `tests/e2e/authenticated/performance-verify.spec.ts` flow C.

## Other surfaces (baseline — not re-instrumented overnight)

| Surface | Baseline repeated | Band |
|---------|-------------------|------|
| Dashboard (warm) | ~760ms | ACCEPTABLE |
| Dashboard → Projects | ~178ms | FAST |
| Overview → Financials | ~501ms | ACCEPTABLE |
| Jobs / Employees / Time / Attendance / AP / Work Orders / Planning / Quotes | Not freshly timed this wave | Use list pages + intent prefetch; Quotes module still landing |

Press feedback: keep `pressableClassName` / `ShellNavLink` / `PrefetchOnIntentLink` — do not replace with spinner-only pending.

## Caching policy (unchanged)

React `cache` + in-request authz memo only. No cross-request Actual/Forecast cache.
