# BUG-05 — Screens at risk (FAB covers composer chrome)

**Proof:** `isFocusedComposerPath-unused-proof.test.ts` + repo `tests/unit/shell/quick-create-fab.test.ts`.

`isFocusedComposerPath` is implemented to hide/demote FAB on focused create/edit routes but **is never called** from `quick-create.tsx`. FAB stays `fixed` + `data-pf-quick-create="fab"` on all routes except `shouldHideQuickCreateForRoute` (project/job `?tab=time` only).

## Surfaces

| Surface | Quick create component | At risk on `/new` `/edit` |
|---------|------------------------|---------------------------|
| Main app | `QuickCreateDeferred` → `QuickCreate` | **Yes** |
| Employee app | `EmployeeQuickCreate` → `QuickCreate` | **Yes** |
| Contractor portal | No global FAB | Lower risk |

## Main app `*/new` routes (45)

All under `src/app/[locale]/(app)/…/new/page.tsx` unless noted:

- `projects`, `jobs`, `work-orders`, `clients`, `vendors`, `expenses`, `billing`, `billing/payments`
- `crm/leads`, `crm/prospects`, `crm/opportunities`
- `procurement`, `procurement/rfqs`, `procurement/ap`, `procurement/ap/credits`
- `workforce/employees`, `workforce/time`
- `field/log`, `field-ops/inspections`, `field-ops/logs`, `field-ops/punch`
- `meetings`, `meetings/.../decisions/new`, `meetings/.../action-items/new`
- `quotes`, `forms`, `assets`, `safety`, `compliance`, `communications`, `changes`
- `recurring-drafts`, `service/recurring`
- `workspaces/[workspaceId]/boards/new`

## Employee shell `*/new`

- `projects`, `tasks`, `hours`, `expenses`, `billing`, `billing/payments`, `clients`, `vendors`, `ap`, `meetings`, `crm/opportunities`

## Main app `*/edit` routes

- `recurring-drafts/[draftId]/edit`
- `meetings/[meetingId]/edit`
- `meetings/.../decisions/[id]/edit`
- `meetings/.../action-items/[id]/edit`

(Additional edit surfaces may live under dynamic segments not named `edit`; composer overlap risk persists wherever sticky Save/Create sits bottom-end in RTL.)

## Playwright bounding-box check

Harness exists: `tests/e2e/fixtures/layout.ts` → `expectQuickCreateClearsBottomNav` (FAB vs **bottom nav**, not vs in-page Save).

**FAB vs primary Save on `/projects/new` at 390px:** **UNVERIFIED** (not run in this wave; would need authenticated Playwright + new geometry assertion).
