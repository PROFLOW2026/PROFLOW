# 0070 Coordinated Owner Release Sequence

**Status:** `COORDINATED MAINTENANCE RELEASE REQUIRED`

Production `main` still runs pre-0070 application writers. Migration `0070_financial_classification_architecture.sql`
enforces invariants that those writers violate:

| Pre-0070 writer | 0070 enforcement | Break without code deploy |
|-----------------|------------------|---------------------------|
| AP create may post `status=open` before lines exist | `assert_ap_bill_recognition_gate` | INSERT/recognition denied |
| Expense finalize without `classification_status` | `assert_expense_recognition_gate` | Finalize denied |
| Naked `UPDATE ap_bills SET status='void'` | `ap_bill_void` trusted latch | Denied |
| Expense reversal without trusted latch | `expense_correction` latch | Denied |

There is **no** proven zero-downtime compatibility while old Production code continues financial writes.

## Owner maintenance sequence (required)

1. **Stop financial writes** — no new AP bills, expenses, payments, credits, inventory moves.
2. **Apply corrected `0070`** SQL on Supabase (Owner only).
3. **Commit + push** matching application code from this branch.
4. **CI green** — full preflight per `docs/RELEASE-PREFLIGHT.md`.
5. **Production deploy READY** on Vercel; verify deploy commit == GitHub HEAD.
6. **Live financial smoke tests** — mixed AP, expense finalize, void bill, inventory stock purchase, Owner historical reconcile.
7. **Re-enable** normal use.

## Post-apply verification (Owner)

- Historical financial delta = **0.00**
- `classified = 51`, `needs_classification = 3`, recognized amount delta = **0**
- Company / Project Direct / Project Full / GCM reconciliation = **0.00**
