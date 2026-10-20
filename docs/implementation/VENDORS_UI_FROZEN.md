# Vendors UI — local freeze (Owner baseline)

**Route:** `/vendors` (owner surface)  
**Status:** FROZEN — no visual changes until Owner explicitly approves.

## Protected files (do not edit for other routes)

- `src/modules/vendors/ui/vendors-org-list-view.tsx`
- `src/modules/vendors/ui/vendor-list-filters.tsx`
- `src/modules/vendors/ui/vendors-list-pagination.tsx`
- `src/app/[locale]/(app)/vendors/page.tsx`
- `src/app/[locale]/(app)/vendors/vendors-list-owner.css`

## Rules

- Do **not** copy `vendors-list-owner.css` selectors to global or other modules.
- Do **not** run bulk codemods on `vendors/**`.
- Column labels / layout per Owner recovery (8 columns, 10/20/50, mobile Popover, «ספק חדש»).

**Backup copy:** see `projectflow-design-recovery-2026-10-20/untracked-design-snapshot-2026-10-20/` in user agent store.
