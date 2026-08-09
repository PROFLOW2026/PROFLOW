# Expense Lifecycle

**Status:** Wave 2  
Legend: **CURRENT** | **FIXED** | **NEW MODEL** | **KNOWN LIMITATION**

## Lifecycle

```text
שמירת טיוטה → draft (not in Actual)
אישור לעלות בפועל → finalized (in Actual; auto-allocation applied if driver+period)
קיזוז / ביטול → reverse row or void (history preserved)
```

Hebrew banners (**FIXED**):
- Draft: ההוצאה נשמרה כטיוטה ואינה נכללת עדיין בעלויות הפרויקט.
- Finalized: ההוצאה אושרה ונכללת בעלויות הפרויקט.

## Overhead path (**NEW MODEL**)

Choose automatic driver (contract / labor hours / direct cost / equal) + period,  
**or** manual allocation lines. Unallocated overhead warns and does not hit project Actual.

**FIXED (Wave 3):** Unallocated finalized org costs remain visible on home/reports as
**Unallocated Business Costs / Costs Awaiting Allocation** and reconcile via
`PROJECT-TOUCHING + UNALLOCATED = ORG FINALIZED EXPENSE TOTAL`
(see `ORG-FORECAST-RECONCILIATION.md`).

## Corrections (**NEW MODEL**)

- `createExpenseReversal` — negative finalized mirror (`voidsExpenseId`)
- `createExpenseAdjustment` — reverse + draft replacement (`adjustsExpenseId`)
- UI: Reverse button on finalized expense detail

## KNOWN LIMITATION

Full guided “replace amount” wizard UI is minimal; reverse + new expense is the primary path.
