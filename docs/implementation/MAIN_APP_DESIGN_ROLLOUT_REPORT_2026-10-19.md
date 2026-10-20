# Main App Design System Rollout — Consolidation Report

**Date:** 2026-10-19  
**Reference:** ProjectFlow RTL Hebrew Dashboard Kit (visual only)  
**Binding contract:** `docs/implementation/MAIN_APP_DESIGN_CONTRACT.md`  
**Route manifest:** `docs/implementation/MAIN_APP_ROUTE_MANIFEST.json` (257 routes)

**Delivery constraints honored:** local only — **no push, no deploy, no SQL.**

---

## 1. Design system components (common UI contract)

| Component | Path | Role |
|-----------|------|------|
| `MainAppPage` | `src/components/patterns/main-app/main-app-page.tsx` | Page canvas, `gap-4`, RTL-aware |
| `MainAppSection` | `main-app-section.tsx` | Section blocks (settings, detail) |
| `MainAppFormGrid` | `main-app-form-grid.tsx` | Dense forms (1→4 cols) |
| `MainAppSummaryGrid` | `main-app-summary-grid.tsx` | Detail key facts |
| `MainAppListToolbar` | `main-app-list-toolbar.tsx` | Search/filter row alignment |
| `MainAppTableShell` | `main-app-table-shell.tsx` | List/table chrome |
| `MainAppReportWorkspace` | `main-app-report-workspace.tsx` | Report catalog + workspace |
| **`MainAppListPagination`** | `main-app-list-pagination.tsx` | **New (consolidation):** 10/20/50 + `QueryPagination` |
| Page size helper | `src/shared/db/main-app-list-page-size.ts` | Shared `pageSize` parsing (default 20) |

**Global chrome (unchanged scope):** `(app)/layout.tsx` — `data-pf-owner-app`, `owner-app-kit.css`, `owner-density.css`, max-width `88rem`.

**Explicitly not universal design system:** `src/app/[locale]/(app)/vendors/vendors-list-owner.css` — vendors-only density/columns; behavior preserved via module UI.

**FAB:** `src/components/shell/quick-create*.tsx` — not modified in this rollout wave.

---

## 2. Seven archetypes

Classified in manifest by rendered UI (heuristic in `scripts/generate-main-app-route-manifest.mjs`):

| Archetype | Count |
|-----------|------:|
| LIST | 85 |
| DETAIL | 35 |
| FORM | 38 |
| WORKSPACE | 55 |
| SETTINGS | 36 |
| REPORT | 4 |
| BOARD_CALENDAR | 3 |
| UTILITY | 1 |

Archetypes are not forced into one card layout; WORKSPACE/REPORT/BOARD keep domain widgets inside kit sections.

---

## 3. Route coverage (honest completion)

**Automated `completionStatus` (pattern detection on `page.tsx` source — not visual QA):**

| Status | Count | Meaning |
|--------|------:|---------|
| NOT_STARTED | 94 | No Main App pattern imports detected |
| WRAPPER_ONLY | 54 | `MainAppPage` only |
| PARTIAL | 109 | Two+ patterns OR inherited `data-pf-ma-page` |
| **COMPLETE** | **0** | **None marked complete** — no owner visual sign-off per route |

**Git working tree vs HEAD (`status` in manifest after `update-main-app-manifest-status.mjs`):**

- **173** route files touched in current diff (page or related module)
- **84** routes unchanged in git diff

**No route has `visualVerified: true`.** Wrapper or pattern presence ≠ finished design.

---

## 4. Domains (subagent + prior waves)

| Domain | Lead / agent | Notes |
|--------|----------------|-------|
| **Settings** | Composer subagent [Settings domain Main App UI](4bd1b9ab-6535-47e6-843d-88d4643a8512) | Card → `MainAppSection` on ~27 settings pages; `MainAppFormGrid` on org/profile/business/Sumit forms; `/quotes/settings` wrapped. Gaps: open-source, list-heavy panels (people, API, tax) without `MainAppTableShell`. |
| **Operations** | Composer subagent [Operations lists Main App UI](4b9be6c7-c89d-4fa0-b7ba-2a762ac2f11b) | 8 lists: approvals, portfolio, assets/maintenance, changes, contracts, notifications, OCR history — table/toolbar/page shells. |
| **Financials / billing / expenses** | Prior local wave | Many lists use `MainAppTableShell` / report workspace |
| **Projects & execution** | Prior local wave | Project list + extensive workspace `screen.tsx` / tab work in diff |
| **Workforce** | Prior local wave | Employee/time tables in module UI |
| **CRM / clients / jobs / meetings** | Prior local wave | CRM shell, client detail, job/meeting lists partial |
| **Procurement & vendors** | Prior local wave | Vendors owner list reference (not final visual approval); procurement pages in diff |
| **Tasks / workspaces / reports** | Partial | Work layout + reports routes mixed NOT_STARTED/PARTIAL |

**Lead (this session):** contract update, `MainAppListPagination` extraction, manifest generator enrichment, manifest regenerate.

---

## 5. Desktop + mobile

- **Desktop:** Owner density CSS + table shells; contracts/notifications toolbars aligned; vendors owner columns (scoped CSS).
- **Mobile:** Vendors filters use Popover + RTL grid (module-level); `useSyncExternalStore` for filter breakpoint (hydration-safe). Other lists rely on existing responsive tables / filter bars — **not visually verified**.

---

## 6. Visual verification

**Result: NOT VERIFIED**

- No authenticated browser session was available for representative desktop/mobile checks.
- Kit mockup used as **code-level** reference only.
- Vendors list is an implementation reference, **not** owner-final-approved universal UI.

**Recommended owner QA (one screen per archetype):** `/projects`, `/vendors`, `/expenses/new`, `/financials/overview`, a project workspace tab, `/calendar` or project calendar, `/settings/org-profile`.

---

## 7. Remaining design gaps

1. **94 NOT_STARTED** routes — mostly DETAIL/FORM/WORKSPACE without pattern imports in page file (logic may inherit shell from layout).
2. **54 WRAPPER_ONLY** — need archetype-appropriate sections, tables, toolbars, grids.
3. **List pagination** — only vendors wired to `MainAppListPagination`; other lists still on legacy page sizes until opted in.
4. **Settings list panels** — need `MainAppTableShell` / toolbar pass.
5. **Field-ops, assets index, documents, forms, imports** — PARTIAL/inherited only.
6. **Manifest `status`** — tracks git diff, not design completion; do not treat CHANGED as verified.

---

## 8. Local Git state

- **Branch:** `main` (ahead of `origin/main` by 1 commit at session start)
- **HEAD reference in manifest:** `d9b79f4c`
- **Working tree:** large uncommitted redesign (~322+ files in diff stat at consolidation start; **173** main-app page routes flagged CHANGED after settings/ops subagents)
- **Typecheck:** `npx tsc --noEmit` — **pass** (post-pagination + subagent edits)

---

## 9. Subagents used

| Agent | Scope |
|-------|--------|
| [Settings domain Main App UI](4bd1b9ab-6535-47e6-843d-88d4643a8512) | Settings + quotes settings |
| [Operations lists Main App UI](4b9be6c7-c89d-4fa0-b7ba-2a762ac2f11b) | 8 operations list routes |

Additional domain waves (financials, projects, workforce, CRM, procurement) were integrated in **prior** local work on this branch; not re-run as separate subagents in this consolidation turn.

---

## 10. Owner next steps

1. Review this report + spot-check manifest routes for your priority domains.
2. Authenticated visual pass (desktop + mobile) per archetype.
3. Approve or redirect before any **push / deploy**.
4. SQL/migrations: **not prepared** in this rollout.

**STOP — awaiting owner approval.**
