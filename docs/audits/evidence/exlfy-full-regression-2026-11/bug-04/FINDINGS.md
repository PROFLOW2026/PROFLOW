# BUG-04 — Employer cost display formatting

**Date:** 2026-11-14  
**Mode:** READ-ONLY code audit  
**Severity:** P2 (UX / money presentation consistency)

## Observed symptoms (owner report)

- Values such as `ILS8250` (ISO code concatenated with amount, no spacing)
- Missing proper currency formatting / spacing
- English technical notes in Hebrew UI
- Six decimal places
- Internal technical text unsuitable for end users
- Product rule: money display uses **2 decimal places**

## Verified sources

### 1. `MoneyInput` receives ISO currency as `currencySymbol`

`monthly-employer-cost-review.tsx` (~532–551):

```tsx
<MoneyInput
  value={estimated}
  onValueChange={setEstimated}
  currencySymbol={currency}  // e.g. "ILS"
/>
```

`money-input.tsx` renders `currencySymbol` as absolute prefix with `ps-8` padding sized for a short glyph (₪), not a 3-letter ISO code. Result: **`ILS` overlaps / concatenates with digits** → `ILS8250`.

Also, `currency` prop (used for display-scale rounding) is **not** passed; only `currencySymbol` is. Storage-scale `*.000000` strings are still rounded by the storage-scale regex path (default scale 2), but confirm dialogs bypass `MoneyInput` entirely (see below).

### 2. Business-change confirm diffs use raw numeric strings

`monthly-employer-cost-review.tsx` (~264–277):

```tsx
before: monthRow.estimatedAmount ?? '—',  // e.g. "8250.000000"
after: estimated || '—',
```

`employee-payroll-retroactive-edit.tsx` (~56–58):

```tsx
before: `${initialPaidAmount} ${currency}`,  // "22000.000000 ILS"
after: `${paidAmount.trim()} ${currency}`,
```

These feed `BusinessChangeConfirmDialog` without `MoneyText` / `formatMoneyDisplay`.

### 3. English internal accrual descriptions

`monthly-accrual.ts` `describeMonthlyEmployerCostRecognition` (~108–118) returns English strings such as:

`Defined monthly employer cost 33000.000000; accrued to date 11000.000000 (7 of 21 work days)`

If surfaced in UI notes / explanations (allocation run `explanation` in `monthly-cost-recompute.ts` also embeds English), users see technical English + 6dp.

### 4. Surfaces that format correctly

Cards in the same month-review UI use `MoneyText` + `money(...)` for known/allocated/unallocated — those paths are **consistent** with 2dp display when `MoneyText` uses currency formatters.

## Root cause summary

| Symptom | Cause | Confidence |
|---------|-------|------------|
| `ILS8250` | ISO code passed as `currencySymbol` + insufficient padding | High |
| 6 decimals | Raw DB `numeric(18,6)` strings in confirm diffs / English describe helpers | High |
| English notes | `describeMonthlyEmployerCostRecognition` / allocation explanations are English literals | High |
| Inconsistent money UI | Mixed `MoneyText` (good) vs raw strings / ISO symbol (bad) | High |

## Proposed fix (do not implement)

1. Pass `currencySymbol="₪"` (or locale currency display) and `currency={currency}` into `MoneyInput`.
2. Format confirm dialog before/after via `formatMoneyDisplay` / `MoneyText`.
3. Localize recognition/explanation strings; never show storage-scale English in owner UI.
4. Add unit/UI test asserting no ISO concatenation and 2dp in employer-cost review + confirm dialog.

## Regression link

Not introduced by `0c43a36e` / `787623f0` / `3cffcab7` / `b2f0b9e7` (no workforce UI changes there). Long-standing presentation debt; still present on current HEAD.
