# BOQ Progress Billing

## Shape (released)

`createProgressBilling` uses the existing Billing financial engine. The invoice is created and finalized as part of the canonical BOQ billing operation. The BOQ link is allowed only after that invoice is finalized.

```text
approve progress batch
  → createProgressBilling(batchId, retentionPercent?)
  → assert not already linked (duplicate billing blocked)
  → create canonical AR invoice via the Billing financial engine
      period net = AR subtotal
      VAT separate (AR tax_amount / total)
      retention separate (existing billing retention helpers)
  → finalize invoice in the same BOQ billing operation
  → link finalized invoice to BOQ batch
  → mark batch status billed
```

Failure anywhere in that operation rolls back AR create, finalize, and BOQ claim/link together. There is no leftover draft invoice for an unbilled batch.

## Linkage

- Do **not** alter frozen `billing_records` / `billing_lines` columns from migrations 0000–0031
- Idempotent linkage lives only in `boq_progress_billing_links`
- The link requires a finalized AR invoice (draft / void / wrong kind are rejected)
- Certificate lines appear as billing line descriptions (plus optional future node id only if Lead adds a column)

## Amounts

- **Period net = AR subtotal.** BOQ `period_net` is the invoice net, not tax-inclusive total.
- **VAT is separate.** Tax stays on the AR record and is not folded into BOQ net.
- **Retention is separate.** Reuse existing retention helpers on billing create as AR cash timing. BOQ does not invent a second retention ledger, and retention does not reduce recognized net.
- **Duplicate billing is blocked.** A batch with an existing progress-billing link cannot be billed again.

## What progress billing is not

- Not Actual cost
- Not a customer payment
- Not a statutory tax invoice (product copy must say so)
- Not a draft-only billing record waiting for a later Billing-module finalize
- Not unlockable by voiding — correction / supersede only

## Permissions

Ordinary Billing finalization:

- `billing.manage`

BOQ progress billing:

- `boq.billing.create` (and module `boq` on)

A BOQ-authorized manager does **not** require broad `billing.manage` merely to create the canonical BOQ progress invoice. Ordinary Billing UI finalization still requires `billing.manage`.
