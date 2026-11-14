# BUG-02 — Serialization proof (isolated)

**Date:** 2026-11-14  
**Script:** `flight-incompatible-props.mjs` → `flight-incompatible-props.json`

## Proven (shape / boundary)

1. `loadMonthlyEmployerCostReview` returns Drizzle rows typed with `timestamp(..., { mode: 'date' })` → **`Date` instances** on `month`, `months[]`, `run` (`createdAt`/`updatedAt`/`appliedAt`/`lockedAt`).
2. Owner employee page passes `initialReview={monthReview}` into **client** `MonthlyEmployerCostReview` when `payrollPayment && showMonthReview`.
3. Diagnostic walk found **7 Date paths** on a realistic payload. After `JSON.stringify`/`parse`, Dates become strings (0 incompatible) — proving the issue is **Flight boundary**, not JSON.
4. Precedent: `serializeTaskCardsForClient` exists for tasks; **no** equivalent for month review.

## Not yet proven (needs harness browser)

- Live Next.js digest / stack from Playwright against PGlite seed with EMC history.
- Status of that reproduction: see `BUG-02-RUNTIME.md` when available (subagent).

## Classification

| Claim | Status |
|-------|--------|
| Payload shape is Flight-incompatible | **PROVEN** |
| Page mounts that payload on payroll deep link | **PROVEN** (static) |
| This is the exact Production crash stack | **HIGH CONFIDENCE / PENDING live stack** |
