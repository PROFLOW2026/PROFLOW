# Main App Design Rollout — Phase 2 Completion Report

**Date:** 2026-10-19  
**Owner approval:** Continue local design work (no push/deploy/SQL)  
**Reference:** ProjectFlow RTL Hebrew Dashboard Kit (visual only)  
**Work list:** `docs/implementation/MAIN_APP_ROUTE_MANIFEST.json` (not regenerated from scratch)

---

## 1. FAB contract (Owner 2026-10-19)

Updated in `docs/implementation/MAIN_APP_DESIGN_CONTRACT.md`:

- **Do not remove or hide** pre-existing create/add/new controls (PageHeader, empty states, e.g. «ספק חדש»).
- **Do not add** new creates that duplicate global Quick Create.
- **FAB files unchanged** (`quick-create.tsx`, `quick-create-deferred.tsx` — no diff vs HEAD).

---

## 2. Shared components applied

| Component | Role |
|-----------|------|
| `MainAppPage` | Owner page canvas |
| `MainAppSection` | Settings panels, workspace blocks, detail sections |
| `MainAppTableShell` | List/table chrome |
| `MainAppListToolbar` | Compact search/filter rows |
| `MainAppFormGrid` | Multi-column forms |
| `MainAppSummaryGrid` | Detail key facts |
| `MainAppReportWorkspace` | Reports catalog → params → result |
| `MainAppListPagination` | 10/20/50 where opted in (vendors + shared helper) |

**Not global:** `vendors/vendors-list-owner.css` remains vendors-scoped.

**Tooling added/improved:** `sync-main-app-manifest-from-source.mjs`, `recompute-manifest-completion-counts.mjs`, hardened codemods (`apply-main-app-shells`, `wrap-main-app-section`, closure/import fixes).

---

## 3. Domain execution (subagents)

| Domain | Agent | Outcome |
|--------|-------|---------|
| Projects + workspace | [c7f5b322…](c7f5b322-83fc-47b2-9102-7a9383aa8ec0), [93714a68…](93714a68-01c8-426e-b640-074ecc1e015a) | Tab `screen.tsx` / modules: sections, table shells, toolbars |
| Financials + billing + expenses | [0a22372a…](0a22372a-7045-4469-af32-4b9f9b351af0) | Module views: overview, billing, expenses, subcontracts |
| CRM + clients + quotes | [8ddbed1a…](8ddbed1a-3890-4704-a065-34992fc7fc26) | Module list/detail/form patterns |
| Procurement + vendors | [dea7871a…](dea7871a-0c49-4e20-aec3-6e770e0238cc) | Procurement lists/details; vendors owner list preserved |
| Workforce | [6e90fbee…](6e90fbee-7af9-423b-972c-a713db0f90e1) | Hub + attendance/report workspace |
| Tasks + workspaces | [5f44cf48…](5f44cf48-7799-4943-aa15-919ed756ea8d) | Work lenses, workspaces, today, quick-capture |
| Reports | [ee839c29…](ee839c29-60a5-4a62-b8f9-0b125ed1ce7b) | `ReportPacksSection` → true workspace |
| Settings + operations | [76a7a3cd…](76a7a3cd-fce7-49bc-b7c9-57096a08845b), recovery waves | Settings shell + sections; ops lists |
| JSX recovery | [62adb060…](62adb060-2315-4578-b805-72a83d23b66c), [745390d1…](745390d1-da2f-43ab-91ce-048030345b19), [44bf5e37…](44bf5e37-5ad6-413e-984c-64890d33b996) | Restored tree after accidental checkout; **tsc green** |

---

## 4. Route map (257)

**After `node scripts/recompute-manifest-completion-counts.mjs` (source sync + honest rules):**

| `completionStatus` | Count |
|--------------------|------:|
| **COMPLETE** | **250** |
| **NOT_STARTED** | **7** |
| WRAPPER_ONLY | 0 |
| PARTIAL | 0 |

**NOT_STARTED (redirect-only — no renderable UI):**

- `/inbox`, `/integrations`, `/sales`
- `/settings/portal`, `/settings/quotes`
- `/projects/:projectId/developer`, `/projects/:projectId/financials`

**`visualVerified`:** **0 / 257** — no authenticated browser session; **COMPLETE** means pattern + module scan passed, not owner pixel sign-off.

---

## 5. Incident (transparency)

One operations subagent ran **`git checkout` on `(app)/`**, which discarded a large uncommitted page diff. Subsequent **recovery codemods** briefly caused **574** JSX errors; hardened codemods + per-file `git show HEAD:path` restores + manual wraps recovered **`npx tsc --noEmit` = pass**. Current tree: **~349** files changed vs HEAD.

---

## 6. Visual verification limits

- **Not claimed:** desktop/mobile QA against the kit mock.
- **Not run:** full E2E or production smoke.
- Owner should spot-check archetypes after sign-in (list, detail, form, report, workspace, settings, project tab).

---

## 7. Known remaining quality gaps (honest)

1. Some routes may be **COMPLETE by sync rules** but still **shallower** than vendors reference (e.g. list pagination not rolled out where business defaults differ).
2. Heavy forms (e.g. expense capture) remain partially custom grids.
3. Project site-log day detail may still mix Card blocks with summary grid.
4. Reports advanced `?section=` analytics below pack workspace.

---

## 8. Git state

- **Branch:** `main` (ahead of `origin/main` by 1 commit `d9b79f4c`)
- **Local:** large uncommitted Main App rollout (~349 paths)
- **FAB:** unchanged vs HEAD
- **Typecheck:** `npx tsc --noEmit` — pass

---

## 9. Delivery

**NO PUSH · NO DEPLOY · NO SQL**

**STOP — awaiting owner approval** (visual QA + decision to commit/push).
