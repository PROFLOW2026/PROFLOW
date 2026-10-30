# EXLFY — Mobile density (2026-10-30)

Focused UX fixes after unification wave: date period chrome, work tasks tabs/filters, shared surfaces. No business-logic or permission changes.

## Root causes

| Screen | Cause |
|--------|--------|
| Financial monthly overview | `DateRangeSelector` always showed from/to inputs; form wrapped selector in bordered `p-3` card (double chrome). |
| Work hub tabs | `WorkHubNav` used `overflow-x-auto` + `shrink-0 whitespace-nowrap` → clipped tabs and hidden horizontal scroll. |
| Work task list filters | `OwnerListFilterBar` always expanded advanced grid on desktop; full title + heavy panel padding; search not paired with collapsed advanced panel on mobile. |
| Empty lists | `EmptyState` default `py-12` added excess vertical space on small viewports. |
| Technical copy | `PlanningVsTasksHint` (UWM/Kanban/Gantt) on owner work hub and project tasks list. |

## Components changed

- `date-range-selector.tsx` — preset chips + **Custom**; `dateInputs: custom-only` for standard presets; hidden inputs when collapsed; exported `computePresetRange` / `findMatchingPreset`.
- `financials-overview-view.tsx` — flat GET form, standard preset labels only.
- `uwm-surface-styles.ts` — wrap tab bar; lighter filter/panel spacing; `uwmFilterPanelCompactClass`.
- `owner-list-filter-bar.tsx` — `compact`, `suppressTitle`, `collapseDesktop`; panel class selection.
- `work-hub-nav.tsx`, `my-work-view.tsx` — flex-wrap tab layout (2-column on narrow screens).
- `work-task-filters-bar.tsx` — compact collapsed filter panel + toolbar search.
- `empty-state.tsx` — responsive vertical padding.
- `work/page.tsx`, `_project-tasks-page.tsx` — removed developer-facing planning hints from UI.

## Shared vs local

| Shared | Local |
|--------|--------|
| DateRangeSelector, UWM surface tokens, OwnerListFilterBar, EmptyState | Financial overview form wrapper; work hub nav layout; work task filter bar props |

Other `DateRangeSelector` consumers inherit compact preset behavior when using `STANDARD_DATE_RANGE_PRESETS` (default). Legacy screens passing `LEGACY_DATE_RANGE_PRESETS` keep always-visible date fields.

## Mobile structure (before → after)

- **Overview:** Card + chips + two date rows + apply → chips (+ custom expands dates) + apply, no outer card.
- **Work tabs:** Horizontal scroll strip → wrapped grid (50% basis on xs).
- **Filters:** Always-visible filter grid on lg → search + “Filters” toggle; advanced fields behind panel at all breakpoints.

## Tests

- `tests/unit/patterns/date-range-selector-presets.test.ts` — preset constants, `computePresetRange`, `findMatchingPreset` (pass).

Runtime sign-in smoke not re-run in this session.

## Deploy

Filled after push (commit SHA, Vercel production deployment).
