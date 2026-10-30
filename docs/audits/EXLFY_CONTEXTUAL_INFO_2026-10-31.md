# EXLFY — Contextual info pattern (2026-10-31)

Non-essential explanatory copy moves behind a unified (i) dialog. Business logic unchanged.

## Shared component

- `src/components/ui/contextual-info.tsx`
  - **`ContextualInfo`** — circular info trigger + mobile sheet / desktop modal (`DialogContent mobileSheet`).
  - **`ContextualInfoLabel`** — compact filter/field group label + info.
- **`PageHeader`** — `descriptionMode: 'info'` (default): page subtitle behind (i) beside title; `inline` opt-out.
- **`Field`** — `descriptionMode: 'info'` (default): field help behind (i) beside label; `inline` opt-out.

i18n: `common.contextualInfo.*` (he-IL, en, ar, ru).

## Screens / areas touched (first wave)

| Area | Change |
|------|--------|
| **All `PageHeader` with `description`** | System-wide default → info dialog |
| **All `Field` with `description`** | System-wide default → info dialog |
| Financial overview KPI cards | Hint + basis in dialog |
| Business profitability | Page notes + section notes + KPI hints in dialog |
| Billing hub | Statutory note, period filter hints, collected-in-period hint |
| AP bills | Filter hints, paid-in-period banner hint |
| Expenses list | Date basis hint in advanced filters |
| Vendors list | Page description + employee lifecycle hint |
| Clients create form | Walk-in + section hints |
| Project work nav | Identity hint |
| Project schedule | Planning vs tasks (icon only) |

## Still visible (by design)

- Errors, validation (`Field` error, `Alert tone="danger"`)
- Primary KPI amounts, labels, drill links
- Operational banners (label + amount); only the explanatory clause moved to (i)
- Empty-state titles (short); descriptions remain for legitimate empty UX unless migrated later

## Tests

- Targeted ESLint on new/changed UI files.

## Deploy

Record commit SHA and Vercel status after push.
