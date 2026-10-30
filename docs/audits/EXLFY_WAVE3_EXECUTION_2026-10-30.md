# EXLFY Wave 3 — Execution report (2026-10-30)

**Baseline:** `f6655de2` (FormDialogFooter seed) → wave 3 commit on `main` (local, not pushed).  
**Runtime smoke:** Not claimed — sign-in required; prior verification doc still applies.

## Dialogs & overlays migrated

| Component | Change |
|-----------|--------|
| `confirm-action.tsx` | Already on `FormDialogFooter` (prior commit) |
| `business-change-confirm-dialog.tsx` | Already on `FormDialogFooter` (prior commit) |
| `duplicate-record-warning-dialog.tsx` | `FormDialogFooter` (back / continue) |
| `confirm-payment-button.tsx` | `DialogBody` + `FormDialogFooter` + submit loading |
| `save-to-storage-button.tsx` | Duplicate-artifact dialog → `FormDialogFooter` (+ trailing save) |
| `project-cloud-file-picker.tsx` | Attach confirm → `FormDialogFooter` |
| `employee-credentials-share-dialog.tsx` | Shared `CredentialsOutboundShareActions` |
| `contractor-credentials-share-dialog.tsx` | Shared actions + copy-link `trailingActions` |
| `employee-app-access-panel.tsx` | `ConfirmAction` (block/disable); collapse unsaved guard |
| `contractor-access-manager.tsx` | `ConfirmAction` (disable account) |

**Not migrated (by design):** `project-team-manager.tsx` form dialogs (already secondary cancel); grant revoke inline form; one-click suspend/resume.

## Forms — `MainAppFormActions`

New: `src/components/patterns/main-app/main-app-form-actions.tsx` (page-form counterpart to dialog footer).

Applied: CRM new opportunity/prospect/lead, `approve-change-form`, `client-create-form`, `new-vendor-form` (+ grid), `submittal-create-form`.

**Not touched:** `expense-form` BH-01/BH-02 fields and auto_pool semantics.

## 360 / detail tabs

New: `main-app-detail-tabs-shell.tsx` (`MainAppDetailTabsShell`, route tab CSS, `MainAppDetailAdvancedSection`).

| Entity | Parity |
|--------|--------|
| Vendors | Shell wraps client-side 360 tabs |
| Clients | Shared route tab strip classes; deep links unchanged |
| Projects | Hub tab list/shell/commercial frame/section nav constants |
| Workforce | Sub-nav uses shell; `Link` + `TabsTrigger asChild` preserved |
| Employees | Single-page detail (no tab strip) |
| Contractor-access | No entity 360 tabs in scope |

## Duplications removed

- Outbound share button row → `CredentialsOutboundShareActions`
- Ad-hoc dialog footers (ghost cancel) → `FormDialogFooter` on confirm-family dialogs
- Ad-hoc single submit buttons on create forms → `MainAppFormActions`
- Vendor 360 tab chrome → shared detail tabs shell

## Shared infrastructure added

- `credentials-outbound-share-actions.tsx`
- `use-dialog-unsaved-guard.ts` (+ `useCollapseUnsavedGuard`)
- `collapsible-section.tsx` — optional `onBeforeToggle`

## Tests (targeted, post-merge)

| Suite | Result |
|-------|--------|
| `tests/ui/main-app-form-actions.test.tsx` | PASS (3) |
| `tests/ui/confirm-action.test.tsx` | PASS (4) |
| `tests/ui/project-tabs-order.test.tsx` + `query-tab-pending.test.tsx` | PASS (6) |
| `tests/unit/employee-app/credentials-share.test.ts` | PASS (8) |
| `tests/unit/contractor-access/credentials-share.test.ts` | PASS (3) |
| `tests/unit/patterns/date-range-selector-presets.test.ts` | PASS (2) |

**Known unrelated:** `i18n-messages.test.ts` may still report vendors/quotes/procurement gaps (pre-existing).

## Open / next

1. **Runtime smoke** (Owner): dialogs, sticky form actions, 360 tabs on mobile RTL, credentials share channels.
2. **Vendors onto kit** — after smoke stable (plan todo `vendors-onto-kit`).
3. **BH-01/BH-02** — `.cursor/plans/expense_bh01_bh02_sprint.plan.md` (await Owner approval).
4. **No production release** until runtime sign-off on touched screens.
