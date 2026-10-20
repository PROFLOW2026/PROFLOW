# Main App design — execution units (baseline, not a new design plan)

**Contract:** `MAIN_APP_DESIGN_CONTRACT.md`  
**Manifest:** `MAIN_APP_ROUTE_MANIFEST.json` (do not re-map 257 routes)  
**Vendors:** frozen — `VENDORS_UI_FROZEN.md`

Work by **UI family**, one module/route owner per change set. No bulk codemods.

---

## LIST

| Share | Where used today | Boundaries |
|-------|------------------|------------|
| `MainAppPage`, `MainAppSection` | ~230 `(app)` pages + many `*-org-list-view.tsx` | `(app)/**/page.tsx`, `src/modules/*/ui/*list*.tsx` |
| `MainAppTableShell` | vendors, clients, CRM, AP, contracts, subcontracts, … | List view TSX only; pair with module filters |
| `MainAppListToolbar` | **Not wired** — vendors use `VendorListFilters` `layout="ownerList"` | New lists: copy vendors pattern or adopt toolbar in **one** module first |
| `MainAppListPagination` | **Not wired** — vendors use `VendorsListPagination` | Module-specific wrapper OK (see vendors) |
| `main-app-list-page-size.ts` | vendors `page.tsx` searchParams | Shared helper; no UI |

**Risks:** `MainAppSection` adds inner wrapper + `gap-3`; dense lists may need scoped CSS (vendors: `vendors-list-owner.css`). Do not globalize vendors CSS.

**Subagent file bounds:** single module folder + its `(app)` page(s); exclude `vendors/**` unless Owner unfreezes.

---

## DETAIL

| Share | Where used | Boundaries |
|-------|------------|------------|
| `MainAppPage`, `MainAppSection`, `MainAppSummaryGrid` | CRM lead/prospect detail views | `src/modules/crm/ui/*detail*` |
| Legacy `PageHeader` + tabs | Most other detail routes | Do not rename tabs or routes |

**Risks:** Summary grid is CRM-only so far; test RTL and mobile before reuse elsewhere.

---

## FORM

| Share | Where used | Boundaries |
|-------|------------|------------|
| `MainAppFormGrid`, `mainAppFieldSpan` | CRM new/status forms | Form TSX in owning module only |

**Risks:** Low global CSS; still avoid changing field labels or validation.

---

## REPORT

| Share | Where used | Boundaries |
|-------|------------|------------|
| `MainAppReportWorkspace` | `/reports`, `/reports/preview`, workforce monthly report | Report pages + report module UI |

**Risks:** Catalog/panel props — keep data hooks unchanged.

---

## WORKSPACE

| Share | Notes |
|-------|--------|
| `MainAppPage` + sections | Dispatch, procurement, company-files — mostly wrapper-only in manifest |

**Risks:** Heavy client components; prefer module UI files over page-only edits.

---

## BOARD / CALENDAR

| Share | Notes |
|-------|--------|
| Mostly legacy layouts | Gantt/calendar modules — **no** shared board shell yet |

**Risks:** High; treat as separate family when a shared pattern exists.

---

## SETTINGS

| Share | Notes |
|-------|--------|
| `MainAppPage` wrappers | Many settings routes — visual pass only inside settings module paths |

**Risks:** Permissions and org settings logic untouched.

---

## Recommended parallel split (next waves)

1. **LIST — clients** (`clients-org-list-view.tsx`) — mirror vendors structure, **no** vendors CSS copy-paste.  
2. **LIST — CRM** (leads/prospects) — already has table shell; toolbar/pagination alignment.  
3. **REPORT** — finish catalog wiring on `/reports` family only.  
4. **DETAIL — CRM** — summary grid polish.  
5. **FORM — one module** — CRM forms as reference implementation.

One agent per row; no overlapping `(app)` mass edits.
