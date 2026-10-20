# Vendors list regression — forensic report

**Date:** 2026-10-20  
**Route:** `/he-IL/vendors`  
**Scope:** Investigation + repair only (no push / deploy / SQL / commit)

---

## A. Root cause (exact)

| Layer | What happened |
|--------|----------------|
| **1. `git checkout` on `(app)/`** (Phase 2 settings/operations subagent) | Reverted **uncommitted** Main App page work. The approved vendors **UI** lived in uncommitted diffs on `vendors-org-list-view.tsx` and `vendor-list-filters.tsx`, not in commit `d9b79f4c`. |
| **2. Recovery codemods** (`apply-main-app-shells.mjs`, `wrap-main-app-section.mjs`) | Re-applied **generic** `MainAppPage` / `MainAppSection` / `MainAppTableShell` on top of **HEAD** vendors list — restoring old **5-column** table, `PageHeader` **description**, `list.lifecycleHint`, legacy filters, `ORG_LIST_PAGE_SIZE` pagination. |
| **3. Scoped CSS never wired** | `vendors-list-owner.css` remained **untracked** and **`page.tsx` did not import it** — compact row heights, toolbar, mobile grid, column widths had **no effect**. |
| **4. Data layer intact** | `vendors.repository.ts` / `VendorListItem` still expose `registrationId`, `primaryContactName`, `listPhone` — regression was **render + layout**, not SQL. |

**Not the primary cause:** `owner-app-kit.css` / `owner-density.css` alone (they did not remove columns).

---

## B. Files that caused / carried the regression

- `src/modules/vendors/ui/vendors-org-list-view.tsx` — overwritten by checkout + generic shells  
- `src/modules/vendors/ui/vendor-list-filters.tsx` — reverted to default filter UX (no `ownerList`, no Popover mobile)  
- `src/app/[locale]/(app)/vendors/page.tsx` — missing CSS import + `pageSize` param  
- `src/app/[locale]/(app)/vendors/vendors-list-owner.css` — present but unused  
- Phase 2: `scripts/codemods/apply-main-app-shells.mjs` (includes vendors module in allowlist)

**Unchanged (good):** `src/components/shell/quick-create*.tsx`, repository list fields, `MainAppListPagination` helper.

---

## C. What was restored (this repair)

1. **`vendors-org-list-view.tsx` (owner surface)**  
   - `data-pf-vendors-list-owner` on `MainAppPage`  
   - `PageHeader`: title + **«ספק חדש»** only (no page `description`)  
   - Removed owner **`list.lifecycleHint`**  
   - Columns: supplier, type, category, **VAT** (`detail.identifierTypes.vat_number`), **contact**, **phone**, projects, status  
   - `VendorsListPagination` 10/20/50 (default 20)  
   - Compact table/mobile classes for scoped CSS  

2. **`vendor-list-filters.tsx`** — `layout="ownerList"`: desktop toolbar, mobile **2fr/1fr RTL** grid, **Popover** filters (no layout shift), `useSyncExternalStore` for breakpoint  

3. **`vendors/page.tsx`** — `import './vendors-list-owner.css'`, `pageSize` search param  

4. **Employee surface** — unchanged pattern (default filters, 5 columns, org pagination)  

---

## D. Other regressions from the same incident

- **Broad `(app)/` checkout** removed many uncommitted page-level Main App diffs (~322 → ~137 files at one point).  
- **Recovery codemods** caused **574** JSX errors; fixed in a follow-up pass — other screens may still be **generic shells** vs pre-checkout depth.  
- **Not vendors-specific:** any route that depended on **uncommitted** page files only (without module backup) was at risk. Module-heavy routes (financials, CRM modules) retained more pattern code.

**No whole-tree git reset was run during repair.**

---

## E. Completion status mechanism (fixed)

- `scripts/sync-main-app-manifest-from-source.mjs`:  
  - **LIST** routes no longer → `IMPLEMENTED` from **`MainAppSection` alone**.  
  - LIST **`IMPLEMENTED`** requires **`MainAppTableShell`** plus (**toolbar** OR **list pagination** OR **`data-pf-vendors-list-owner`**).  
  - Replaced auto **`COMPLETE`** with **`IMPLEMENTED`** for code-level sync.  
  - Added **`implementationPipeline`**: `NOT_STARTED` \| `IMPLEMENTED` \| `CODE_REVIEWED` \| `VISUALLY_VERIFIED` \| `OWNER_APPROVED` (latter three only via manual flags / owner QA).  

---

## F. Focused verification

| Check | Result |
|--------|--------|
| `npx tsc --noEmit` (project) | Run locally after repair |
| `/vendors` build (use client order) | Filters file: `'use client'` first line |
| Browser visual QA | **Not performed** (no authenticated session) — owner should re-verify `/he-IL/vendors` desktop + mobile |

---

## G. Stop point

**Broad design rollout paused.** Awaiting owner confirmation on vendors list after local review.
