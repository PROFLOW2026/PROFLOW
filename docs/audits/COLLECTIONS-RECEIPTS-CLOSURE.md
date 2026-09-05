# ProjectFlow Collections / Receipts Closure Audit

Date: 2026-09-06  
Scope: Billing → Receivable → Collection/Receipt → Allocation → Remaining AR → Cash Received → Project/Org reporting  
Status: Code fixes applied; Owner review (no commit / push / deploy)

## Authority map (current model)

| Concern | Authority |
|--------|-----------|
| Receipt amount | `payments.amount` — **gross cash received only** (no payment net/VAT columns) |
| VAT / NET / GROSS composition | `billing_records.subtotal_amount`, `tax_amount`, `total_amount`, `tax_snapshot` |
| What receivable was settled | `payment_applications.applied_amount` |
| Open AR (receivable now) | `signed(total) − Σ recorded applications − retention_held_remaining` |
| Collection / cash in period | `payments.amount` filtered by `payment_date` + `status=recorded` |
| Retention interaction | Held reduces collectible/receivable-now; release events in `retention_releases`; does not rewrite invoiced |
| Credits | `billing_records.kind = credit_note` (signed negative); cannot receive applications |
| Unallocated receipt | Domain: payment header may exceed Σ applications; now surfaced on billing receivables panel |
| Overpayment on an invoice | **Blocked** (domain + DB). Excess stays unallocated cash if header > applications |

```text
Current receipt amount authority = payments.amount (cash)
Current VAT authority = billing_records (+ tax_snapshot)
Current AR formula = signed(invoiced gross) − paid applications − held retention
Current collection formula = Σ recorded payments.amount by payment_date (org); applied amounts by project
Current retention interaction = cash timing only; reduces receivable-now
Current credit interaction = credit_note reduces signed invoiced / AR
Current unallocated receipt support = YES (domain + UI remainder + org panel)
Current overpayment support = DENY on invoice; unallocated remainder allowed on payment header
```

## Findings closed in this wave

1. **HIGH** — Org/dashboard `sumCollectionsInDateRange` joined `payments.billing_record_id`, dropping split/customer payments (`billing_record_id` null). Fixed: sum payment headers.
2. **HIGH** — `loadCashFlowPayments` same join bug. Fixed: org = headers; project = applications (+ legacy 1:1).
3. **HIGH** — Project financials bundle SQL loaded paid only via `payments.billing_record_id`. Fixed: union applications + legacy.
4. **MEDIUM** — Jobs list paid rollup missed split applications. Fixed: join `payment_applications`.
5. **MEDIUM** — Payment UX lacked cash/remaining-AR clarity and used ambiguous Hebrew “סגורות”. Fixed form + locales (no VAT toggle on invoice-linked receipts).
6. **MEDIUM** — Receivables integrity copy omitted held retention. Fixed HE/EN + domain note; panel shows held retention + unallocated receipts.
7. **LOW** — Void split payment revalidated only one invoice. Fixed: revalidate all affected billing records/projects.
8. **LOW** — Missing currency-mismatch unit test. Added.

## Explicit non-changes (by design)

- **No VAT selector on invoice-linked collection** — cash against gross receivable; invoice remains VAT authority.
- **No payment net/VAT columns** — prevents drift from invoice composition.
- **No profitability contamination** — collections do not enter project Actual / profit formulas.
- **No migration** — schema already correct for cash receipts + applications.

## Standalone cash-on-account (closed)

UI now supports:

* Allocate to existing invoice
* Unallocated receipt (client + cash + date; zero applications)

Later allocation: `/billing/payments/[paymentId]/allocate`

Appears in cash received / org collections / unallocated panel. Does not change revenue, billing totals, project profit, or Actual.

Optional later: FX conversion.

## Verification

Targeted unit tests under `tests/unit/billing/` plus typecheck and production build for this wave.
