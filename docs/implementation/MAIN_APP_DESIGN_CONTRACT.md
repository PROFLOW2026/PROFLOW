# Main App Design Contract (Owner Product UI)

**Approved visual reference:** ProjectFlow RTL Hebrew Dashboard Kit (owner-provided mock).

**Implementation:** `owner-app-kit.css` + `src/shared/ui/main-app-surface-styles.ts` + `src/components/patterns/main-app/*`.

**Scope:** `src/app/[locale]/(app)/**` and modules rendered only from those routes.  
**Out of scope:** Home dashboard (`[locale]/page.tsx`), employee app, contractor portal, auth/marketing, CAD/PDF viewers.

## Kit tokens (summary)

| Token | Value / behavior |
|-------|------------------|
| Page canvas | `--pf-bg-subtle` on `main` under `[data-pf-owner-app]` |
| Surfaces | White cards, `border-[var(--pf-border-default)]`, **no heavy shadow** |
| Primary | Teal (`--pf-teal-700` / action primary) |
| Radius | `0.5rem` (`rounded-lg`) |
| Control height | 36px (`2.25rem`) in toolbars and forms |
| Nav active | Teal inline-start bar + teal-50 background (sidebar under owner app) |
| Tables | `MainAppTableShell` — muted header row, horizontal row dividers |
| Date presets | Pill buttons; active = teal border + teal-50 fill |

## Page anatomy

| Archetype | Structure |
|-----------|-----------|
| **LIST** | `MainAppPage` → compact `PageHeader` → `MainAppListToolbar` (search/filters) → table/list → pagination |
| **DETAIL** | `MainAppPage` → `PageHeader` (title, meta, actions) → `MainAppSummaryGrid` (key facts) → `MainAppSection` blocks |
| **FORM** | `MainAppPage` → header → `MainAppFormGrid` (grouped fields) → sticky/footer actions |
| **REPORT** | `MainAppPage` → header → `MainAppReportWorkspace` (catalog + config split) |
| **WORKSPACE** | Project/settings shells keep tabs; content uses `MainAppPage` gap/sections inside tab panels |
| **SETTINGS** | Section nav + focused panel; forms use `MainAppFormGrid` |
| **BOARD / CALENDAR** | Timeline/board/calendar shells; keep domain widgets; wrap outer chrome with `MainAppPage` + sections, not a generic list card |

## Seven archetypes (classification rule)

Classify by **rendered UI**, not filename: LIST, DETAIL, FORM, REPORT, WORKSPACE, BOARD_CALENDAR, SETTINGS (+ UTILITY for print-only routes).

Do not force DETAIL or REPORT into the same card layout as LIST.

## Shared list contract (Main App)

| Piece | Component / module |
|-------|-------------------|
| Page shell | `MainAppPage` + existing `PageHeader` |
| Toolbar | `MainAppListToolbar` or module filter bar with `layout="ownerList"` |
| Table | `MainAppTableShell` + domain columns |
| Pagination | `MainAppListPagination` + `parseMainAppListPageSize` (`pageSize` 10 \| 20 \| 50, default 20) |
| Mobile filters | Radix Popover / disclosure — **no layout shift**; scoped CSS per route/module only |

**Do not** promote route-specific CSS (e.g. `vendors-list-owner.css`) as global design system rules.

## Spacing scale (Main App)

- Page vertical rhythm: `gap-4` (`MainAppPage`, `data-pf-ma-page`)
- Section blocks: `gap-3` inside `MainAppSection`
- Compact header: overridden in `owner-density.css` under `[data-pf-owner-app]`
- Avoid `gap-6` / `gap-8` on dense management pages unless a module truly needs breathing room (reports catalog header only)

## Typography

- Page title: `PageHeader` (1.125rem mobile → 1.25rem sm+ in owner-density)
- Section title: `text-sm font-semibold`
- Meta / labels: `text-xs font-semibold text-secondary`
- Body in panels: `text-sm`

## Controls

- Height: 36px (`h-9`) for inputs, selects, default buttons in toolbars
- Width: **content-driven** — use `data-pf-field-span` on `Field` / grid cells, not global combobox max-width
- Short enums: `sm` (8rem min) or `md` (12rem); entities/projects: `lg` (min 16rem, grow in grid); notes: `full`

## Form layout

- `MainAppFormGrid` columns: 1 (default) → 2 @ sm → 3 @ lg → 4 @ xl when `dense`
- Related short fields share a row via grid placement, not fixed 22rem selects
- Full-width: textarea, long text, attachment lists, tables

## Tables / lists

- Use horizontal space; `ResponsiveTable` / native overflow-x on narrow viewports only
- Row density: default table text `text-sm`, cell py-2

## Filters & dates

- One toolbar per list (no duplicate search)
- `DateRangeSelector` on owner surface: TODAY / THIS WEEK / THIS MONTH / THIS YEAR + optional collapsed custom range
- `thisYear`: Jan 1 → today (org timezone via `today` prop)

## Actions

- Primary actions in `PageHeader.actions` or section footers aligned with form grid
- Mobile: wrap actions; full-width buttons only inside forms or when single primary CTA

## Global Quick Create FAB (mandatory — Owner 2026-10-19)

The floating **`+`** (Quick Create) is **out of scope** for Main App visual redesign:

1. Keep it exactly as in production today — global, floating, same position, size, and style.
2. Do **not** replace, resize, restyle, relocate, or add label text beside it.
3. Do **not** introduce a new FAB variant.
4. **Do not remove or hide** create/add/new/`+` controls that **already existed before** this visual redesign — including actions in `PageHeader`, section headers, and empty states (e.g. «ספק חדש» on vendors). Restyle only; do not delete for FAB deduplication.
5. **Do not add** new page-level create controls that **duplicate** Quick Create (same entity/route as a FAB menu entry).
6. **Contextual** creates remain allowed and must be preserved: inside a project tab, line-item «הוסף» in forms, «הוסף משימה» in project context, etc.
7. If you introduced a duplicate create button during UI work, remove **only that new duplicate** — never a pre-existing control.
8. Implementation lives in `src/components/shell/quick-create.tsx` / `quick-create-deferred.tsx` — **no edits** unless Owner explicitly requests a FAB change.

## RTL

- Logical properties (`ms`/`me`, `text-start`, `justify-between` with flex-wrap)
- Grids and toolbars must not assume LTR-only order

## Breakpoints

- Mobile-first; meaningful multi-column from `sm` (640) and `lg` (1024)
- Main column max: `88rem` (layout.tsx) — use grids inside, not arbitrary `max-w-lg` on whole forms

## Collapsible content

- Filters: `OwnerListFilterBar` mobile disclosure
- Date custom range: `collapseInputs` on owner surface
- Do not accordion primary working content

## Saved views

- UI hidden; APIs and stored data unchanged

## Labels (mandatory)

- **Visual-only redesign:** do not rename tabs, pages, nav items, buttons, or business terms.
- Do not copy labels from the Dashboard Kit mock (e.g. keep «לוח בקרה», not «דשבורד»).
- Use existing `t(...)` keys and locale files (he-IL, en, ar, ru) unchanged unless fixing an unrelated product bug with Owner approval.
- Do not add duplicate translation keys to «improve» wording during UI work.
