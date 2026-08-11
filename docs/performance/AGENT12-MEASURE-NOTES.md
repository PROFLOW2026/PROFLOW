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
- Nested Suspense: schedule/contract first, milestones panel own fetch
- Slimmer WP/phase rows for schedule-only overview (avoid full structure DTO)
- Coalesce panel `withOrgContext` txs (R2 in PERFORMANCE-AUDIT)
- Avoid re-shipping large layout Flight on soft-nav where possible

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
