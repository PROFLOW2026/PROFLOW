# Retention / Holdback — Design (DEFERRED)

**Status:** Design only — NOT implemented in next-gen overnight run  
**Reason:** Cost/Revenue recognition ≠ cash payable/receivable. Current AP/AR engine lacks a safe payable-now vs recognized-amount split without risking double-count or silent history rewrite.

## Desired product behavior (optional)

On Vendor Bill or Customer Billing:

- Bill amount: 100,000
- Retention: 10%
- Recognized economic amount follows existing recognition rules
- Payable / receivable **now** differs (90,000 now; 10,000 held)

## Required engine changes before implement

1. Explicit `recognized_amount` vs `payable_amount` / `receivable_amount` on bill/billing records
2. Retention schedule / release events with audit
3. Aging and cash outlook must use payable/receivable side
4. Profitability Actual must use recognition side only once
5. Credits/voids must conserve both sides
6. Migration + RLS + concurrency tests
7. UI disclosure: retention is operational cash timing, not a second cost

## Decision

**Defer** until a dedicated financial wave. Do not hack overnight.
