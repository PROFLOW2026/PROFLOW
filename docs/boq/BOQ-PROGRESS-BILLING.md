# BOQ Progress Billing

## Shape (Lead contract)

```text
approve progress batch
  → createProgressBilling(batchId, retentionPercent?)
  → assert not already linked
  → createBillingRecord({ projectId, netAmount: periodNet, retentionPercent, notes, lines from progress })
  → insert boq_progress_billing_links (unique batch)
  → mark batch status billed
```

## Linkage

- Do **not** alter frozen `billing_records` / `billing_lines` columns from migrations 0000–0031
- Idempotent linkage lives only in `boq_progress_billing_links`
- Certificate lines appear as billing line descriptions (plus optional future node id only if Lead adds a column)

## Retention

Reuse existing retention helpers on billing create. BOQ does not invent a second retention ledger.

## What progress billing is not

- Not Actual cost
- Not a customer payment
- Not a statutory tax invoice (product copy must say so)
- Not unlockable by voiding — correction / supersede only

## Permissions

Requires `boq.billing.create` (and module `boq` on). Billing module permissions still apply inside `createBillingRecord`.
