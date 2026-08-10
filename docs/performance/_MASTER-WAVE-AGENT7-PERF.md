# Master Wave — Agent 7 Performance Final Pass

**Status:** COMPLETE (code-path; Lead owns Playwright re-measure)  
**Baseline:** `docs/performance/LIVE-VERIFICATION.json` (2026-08-10 production)  
**Constraints:** No commit/push · no migrations · no financial-formula changes · no tab/deep-link/mobile regressions · no loader theater

## Baseline (production)

| Flow | Measured | Target |
|------|----------|--------|
| Dashboard warm (A2, networkidle) | ≈1202ms | <1000ms |
| Open project repeated (C) | ≈1043ms / ~296KB RSC | <700ms |
| Project tabs (D–J) | ~171–512ms | do not regress |

## Root causes found

### Open project (HIGH)

1. **Tab list blocked behind page Suspense** — `[projectId]/layout` wrapped `ProjectTabsShell` (tabs + children) in one Suspense. Perf ready-condition waits for overview tab selected → wall clock included full overview page work (structure + extras), not just chrome.
2. **Duplicate project detail** — `loadProjectDetail(id, false)` (layout) and `loadProjectDetail(id, true)` (overview page) used different React `cache` keys, so project/contract/events/client paid **twice** on every open.
3. **Work setup extras leaked** — when `showWorkPackages` was false, org templates / phase packs / all-projects clone list loaded on **every** tab, and `WorkTab` rendered outside the active tab.
4. **~259KB RSC sibling** (`_rsc=QHMF2hP…`) — size peers with projects-list (~242KB) and reports (~291KB); likely shared `(app)` layout flight on route entry, not overview row payload. Not fully removable in this agent’s scope; lighter project chrome still helps prefetch/open.

### Dashboard warm (HIGH)

1. **Serial waves** — existence probes finished before rollup/expense layer started → latency ≈ sum, not max.
2. **Rollup double project scan** — `listActiveProjectIds` + all non-archived `projects` select; only active rows are eligible.
3. **networkidle harness** — A2 waits for recent-project **prefetch** (2× ~34KB project RSC) after KPIs; intentional opt-in per `OWNER-QA-FINAL-PREFETCH.md`, still counts toward warm wall.
4. **hasAny* used `count(*)`** — full aggregate for boolean existence.

## Changes shipped

| Area | Change | Expected effect |
|------|--------|-----------------|
| `projects/[projectId]/layout.tsx` | Suspense only around `{children}`; tabs render with chrome | Open-project ready ≈ layout chrome time; tabs no longer wait on overview structure |
| `load-project-detail.ts` + `get-project-detail.ts` | Split chrome / structure / WP-count with nested `cache` | −1 full chrome reload on open overview; module tabs share one chrome |
| `get-organization-project-rollup.ts` | Single active-projects select | −1 projects round-trip on dashboard/reports rollup |
| `get-home-dashboard.ts` | Start rollup + expense layer in parallel with boot probes | Warm path latency ≈ max(probes, rollup) + billing wave |
| expenses/billing/projects `hasAny*` | `LIMIT 1` existence | Cheaper boot probes |
| `projects/[projectId]/page.tsx` | Work extras + orphan `WorkTab` only on overview (no WP) or work tab | Module soft-nav stays light; no regress |
| `overview-contract-history.tsx` | History table in own Suspense (chrome cache hit) | Overview primary flight can stream without history table |

## Expected timings (code-path; not re-measured)

| Flow | Before | Expected after | Confidence |
|------|--------|----------------|------------|
| Open project repeated | ~1043ms / ~296KB | **~550–750ms** wall if ready = chrome+tabs; RSC bytes may still show shared ~250KB sibling | High on wall; Medium on bytes |
| Dashboard warm | ~1202ms | **~900–1100ms** (overlap + −1 query; prefetch still in networkidle) | Medium |
| Tab soft-nav | ~171–512ms | Unchanged or slightly better (no work-extras leak) | High |

Lead should re-run `tests/e2e/authenticated/performance-verify.spec.ts` after build.

## Tests run

```
vitest: org-report-aggregate, compose-project-financials, expense-contributions-scope,
        calculations, forecast-engine, project-job-parity-scenario-e, query-tab-pending
→ 15 + related PASS
```

No Playwright in this agent (Lead owns full gate).

## Schema asks for Lead

None.

## Findings severity

| Severity | Item |
|----------|------|
| **BLOCKER** | None |
| **HIGH** | Open-project wall was inflated by Suspense wrapping tabs; fixed. Dashboard warm still includes intentional project prefetch under networkidle — may land ~900–1100ms until prefetch strategy or harness changes. |
| **MEDIUM** | Shared ~250KB `(app)` layout RSC on major route entry (projects list / open project / reports) — outside slim project payload; worth a follow-up AppShell flight audit. |
| **MEDIUM** | Soft-nav still re-fetches page segment (prior R1); layout chrome now correctly survives `?tab=` — do not regress. |

## Files touched

- `src/modules/projects/application/get-project-detail.ts`
- `src/modules/projects/index.ts`
- `src/app/[locale]/(app)/projects/[projectId]/load-project-detail.ts`
- `src/app/[locale]/(app)/projects/[projectId]/layout.tsx`
- `src/app/[locale]/(app)/projects/[projectId]/page.tsx`
- `src/app/[locale]/(app)/projects/[projectId]/overview-tab.tsx`
- `src/app/[locale]/(app)/projects/[projectId]/overview-contract-history.tsx` (new)
- `src/modules/financials/application/get-home-dashboard.ts`
- `src/modules/financials/application/get-organization-project-rollup.ts`
- `src/modules/financials/data/projects.repository.ts`
- `src/modules/financials/data/expenses.repository.ts`
- `src/modules/financials/data/billing.repository.ts`
- `docs/performance/_MASTER-WAVE-AGENT7-PERF.md` (this file)
