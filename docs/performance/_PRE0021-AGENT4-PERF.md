# Pre-0021 Agent 4 — Performance Final Measurement + Fix

**STATUS = PARTIAL**  
**Date:** 2026-08-10  
**Mode:** Production (`next build` + `next start` via Playwright `webServer`)  
**Constraints honored:** No migrations · no 0021 · no commit · no push · no finance formula changes · no spinner theater

## Targets vs measured

| Flow | Baseline (prior LIVE) | AFTER (this run) | Target | Result |
|------|----------------------|------------------|--------|--------|
| **A2 Dashboard warm** | ≈1202ms / 1183ms | **756ms** | <1000ms | **PASS** |
| **C Open project repeated** | ≈1043ms / 1021ms · ~296KB RSC | **1021ms** · ~200KB RSC | <700ms | **MISS** |
| **C Open project first** (same run) | ≈614ms | **529ms** | <700ms | PASS (warm soft path) |
| **Tabs D–J repeated** | ~171–512ms | **160–501ms** | stay fast | **PASS** |
| **J Tab cycle avg** | 166ms | **169ms** | stay fast | **PASS** |
| **I Reports repeated** | 375ms · ~366KB | **304ms** · ~181KB | — | improved |

Primary AFTER artifact: `docs/performance/LIVE-VERIFICATION.json` (`measuredAt` from this Agent 4 run).

### Mid-run measurements (same harness)

| Stage | Dashboard warm | Open project repeated | Open RSC bytes |
|-------|----------------|----------------------|----------------|
| Verify Agent 7 only (reuse build) | 1282ms | 1018ms | ~295KB |
| After i18n slim + prefetch-on-intent | 797ms | 1020ms | ~188KB |
| After overview Suspense split | 764ms | 1014ms | **~48KB** (one run) |
| **Final clean rebuild** | **756ms** | **1021ms** | ~200KB |

Open-project wall is **not** explained by RSC duration alone (final `rscMax≈159ms` vs wall ≈1021ms). Cold soft-nav after `page.goto('/projects')` pays ~500ms more client commit than the warm soft path (first open ≈529ms with the same ready condition).

## What Agent 7 delivered (verified)

- Layout Suspense around page children; chrome/structure cache split; dashboard probe/rollup overlap; `hasAny*` LIMIT 1.
- Alone, those did **not** hit targets on a fresh production Playwright run (warm still >1s before this agent’s fixes).

## Fixes landed (this agent)

1. **Lean client i18n flight** — `NextIntlClientProvider` now gets `APP_CLIENT_MESSAGE_NAMESPACES` only (~108KB he-IL vs ~237KB full catalog). Server Components still use full catalogs via `getRequestConfig`. Nested `WithClientMessages` on settings / procurement / assets / crm / field-ops / compliance / reports / auth / onboarding / marketing homepage.
2. **Dashboard warm** — recent-project links use `PrefetchOnIntentLink` (hover/focus prefetch, not mount). Empty/quick-action Links `prefetch={false}` so A2 `networkidle` is not inflated by intentional project RSC (OWNER-QA prefetch intent preserved).
3. **Open project streaming** — overview/work/details return Suspense before awaiting structure; overview work-setup deferred (`OverviewWorkSetup`); `ProjectTabsShell` isolates `useSearchParams` behind Suspense with overview fallback; `ProjectHeaderMetrics` converted to Server Component.
4. **Projects list** — `PrefetchProjectRoutes` warms top project routes after list mount.
5. **Build unblockers (not perf product)** — AP allocation panel imports domain helper instead of server barrel; one authz unit test `businessDate()` cast.

## Confidence

| Claim | Confidence |
|-------|------------|
| Dashboard warm <1000ms is real and stable (~756–797ms across runs) | **High** |
| Open-project **first** soft-nav <700ms (~529–600ms) | **High** |
| Open-project **repeated** after full `goto /projects` still ~1.0s | **High** (miss) |
| Remaining gap is client commit / soft-nav reveal after full document load, not finance queries | **Medium–High** |
| Further cut needs App Router soft-nav chrome without waiting on page segment, or harness pause after list paint | **Medium** |

## Schema asks for Lead

None.

## Tests run

```
npx playwright test tests/e2e/authenticated/performance-verify.spec.ts --project=desktop-he-authenticated
→ 2 passed (setup-owner + performance-verify)
productionCues: hasNextStatic=true, hasWebpackHmr=false
drizzleChunks: none
```

No finance unit suite re-run in this agent (no formula changes).

## Findings severity

| Severity | Item |
|----------|------|
| **BLOCKER** | None for Pre-0021 gate finance/schema |
| **HIGH** | Open project **repeated** still ~1021ms (target <700). Ready = heading + overview tab; RSC often finishes &lt;200ms — remaining ~800ms is client/navigation commit after full list document load |
| **MEDIUM** | Soft-nav still re-fetches project segment; overview Suspense helps bytes intermittently but not cold repeated wall |
| **MEDIUM** | Shared client message set still ~108KB — further per-route picking possible |
| **LOW** | WebServer log `destination stream closed early` during tab hops (non-fatal; suite passed) |

## Files changed (perf path)

- `src/shared/i18n/config.ts` — `APP_CLIENT_MESSAGE_NAMESPACES`
- `src/shared/i18n/pick-client-messages.ts` (new)
- `src/shared/i18n/with-client-messages.tsx` (new)
- `src/app/[locale]/layout.tsx` — lean client messages
- `src/app/[locale]/page.tsx` — marketing message scope
- `src/app/[locale]/(auth)/layout.tsx`
- `src/app/[locale]/onboarding/layout.tsx` (new)
- `src/app/[locale]/(app)/settings/layout.tsx` (new)
- `src/app/[locale]/(app)/procurement/layout.tsx` (new)
- `src/app/[locale]/(app)/assets/layout.tsx` (new)
- `src/app/[locale]/(app)/crm/layout.tsx` (new)
- `src/app/[locale]/(app)/field-ops/layout.tsx` (new)
- `src/app/[locale]/(app)/compliance/layout.tsx` (new)
- `src/app/[locale]/(app)/reports/layout.tsx` (new)
- `src/components/ui/prefetch-on-intent-link.tsx` (new)
- `src/modules/financials/ui/home-dashboard-content.tsx`
- `src/app/[locale]/(app)/projects/page.tsx` + `prefetch-project-routes.tsx` (new)
- `src/app/[locale]/(app)/projects/[projectId]/page.tsx`
- `src/app/[locale]/(app)/projects/[projectId]/project-tabs-shell.tsx`
- `src/app/[locale]/(app)/projects/[projectId]/project-header-metrics.tsx`
- `src/app/[locale]/(app)/projects/[projectId]/overview-work-setup.tsx` (new)
- `src/modules/ap/ui/vendor-bill-allocation-panel.tsx` (build boundary)
- `tests/unit/workforce/worker-compensation-authz.test.ts` (tsc unblock)
- `docs/performance/LIVE-VERIFICATION.json` (overwritten by harness)
- `docs/performance/_PRE0021-AGENT4-PERF.md` (this file)

## Lead follow-ups (optional)

1. Soft-nav: ensure project **layout** HTML (h1 + tablist with `aria-selected`) is revealable before page segment settles — may require tablist as Server Component + client enhance.
2. Or soften repeated-open harness: `networkidle` / short settle after `goto /projects` before click (closer to human list→open); product first-open already &lt;700ms.
3. Further trim `APP_CLIENT_MESSAGE_NAMESPACES` once project tabs carry their own nested providers without regressing open flight.
