# ProjectFlow — Overnight Report

**Baseline parent:** `4b1099eb756d1b2ec366f274be054afeded710f8`  
**Date:** 14 August 2026  
**Owner SQL apply:** 0036–0045 APPLIED  
**Portal:** OFF  
**0000–0045 modified after apply:** NO  

This wave is local work on top of the released BOQ baseline. Migrations **0036–0045 are applied** (`npm run db:migrate`). **0000–0045 are immutable history.**

---

## What closed

### Financial truth

- AP bills and vendor credits carry `net_amount` / `tax_amount` / `gross_amount` / `tax_basis` (0036).
- **Actual = NET.** Payable and aging = **GROSS**.
- Historical rows: `legacy_undivided`, net = gross = historical total, tax = 0. No invented VAT.
- Constraint: `legacy_undivided` cannot carry `tax_amount > 0` or a net/gross split.
- Vendor credits use the same tax split. Payable reduction = GROSS. Actual reduction uses the **credit’s** NET/GROSS, not the bill VAT ratio.

### Integrity

- Closed-month freeze at the database (0037). Draft expense/AP/billing/vendor-credit INSERT in a closed month is allowed. `archived_at` is **not** a global allowlist. Payments have no draft: closed-month INSERT of a recorded payment is forbidden. Recorded → void is allowed; void → recorded is blocked. `is_month_closed_unrestricted` is not granted to `authenticated`.
- Change Order reversal (0038): same-org composite FK; `reversal_reason` immutable; reversing CO is a new row.
- Split AR (0039): BEFORE INSERT guard includes **NEW**; `FOR UPDATE` on payment then billing record; existing + NEW ≤ payment amount; existing bill apps + NEW ≤ **collectible** (`total − retention_held_remaining`). Split payments require `client_id`; applications must be that client. Same-org client FK. Recorded AR and AP payment **economic fields** (amount, currency, date, client/vendor, invoice, org) cannot be rewritten; correction is recorded → void.
- PO receiving (0040): line locks; no over-receive; receipt lines immutable; direct `received_quantity` mutation blocked; some qty → `partially_received`; full qty stays `partially_received` (catalog has no `received`); close remains explicit. Receiving ≠ Actual.
- Document storage cleanup (0041) and internal numbering (0043).
- Inventory locations (0044): same-org location FKs; movement semantics; balances movement-driven; qty-only.

### Security

- 0042: `authenticated` has no table DML/SELECT on `boq_nodes`.
- 0045: draft node insert/update/delete/archive via `app.boq_mutate_draft_node` (`boq.manage` + org member).
- 0043: `app.next_document_number` is SECURITY DEFINER with org membership + **document-kind** permission (not blanket `org.update`). Cross-org UUID cannot bump another tenant’s sequence.
- 0045: public `app.boq_reverse_change_allocation` remains **`boq.manage` only**. Commercial reversal is `app.reverse_change_order` (`changes.approve`): reversing CO + opposite contract event + scoped BOQ unwind in one transaction. Reversing INSERT is allowed only while `app.co_reversal_ctx` holds a row written by that DEFINER function (`pid` + `txid_current()` + org + original CO). Authenticated and `service_role` have no DML on that table. Session `set_config` is **not** authorization. `app.boq_reverse_allocations_for_change_order` is **not** granted to `authenticated`.

### Product / UX (overnight plan)

Client AR 360, split AR UI, PO receive UI, BOQ field measure, work-order checklist ↔ Forms, field photo staging, `/sales` hub, job employee picker, `/overhead`, numbering settings, CRM board + next-action, custom-field search, draft AP from subcontractor valuation, inventory locations labeled qty-only, reports `?section=` deep links, Playwright critical job in CI.

---

## Migrations as they finally exist

| Tag | File |
|---|---|
| 0036 | `0036_ap_vat_net_tax_gross.sql` |
| 0037 | `0037_month_close_db_freeze.sql` |
| 0038 | `0038_change_order_commercial_reversal.sql` |
| 0039 | `0039_ar_split_payment_applications.sql` |
| 0040 | `0040_po_receiving.sql` |
| 0041 | `0041_document_storage_cleanup.sql` |
| 0042 | `0042_boq_raw_money_revoke.sql` |
| 0043 | `0043_product_columns_numbering_crm_quotes.sql` |
| 0044 | `0044_inventory_locations_qty.sql` |
| 0045 | `0045_boq_reverse_allocation_changes_approve.sql` (canonical `app.reverse_change_order`; unforgeable `app.co_reversal_ctx`; unwind RPC not granted to authenticated; draft node mutate RPC) |

Journal last tag: `0045_boq_reverse_allocation_changes_approve`.

---

## SQL adversarial correction (owner review of 0036–0045)

Closed in place before apply (now applied):

1. 0039 over-application included NEW + row locks + concurrency tests A–E.
2. Retention collectible uses existing `retention_held_remaining` truth.
3. Split payment same-org client + required client for split + invoice client match.
4. 0043 numbering tenant + kind permission; Org B sequence unchanged.
5. 0045 `changes.approve` cannot unwind BOQ without `app.reverse_change_order`. Direct `boq_reverse_allocations_for_change_order` is revoked from authenticated. Reversing Change Order INSERT cannot be authorized by a forged GUC; only `app.co_reversal_ctx` written by the DEFINER path.
6. 0038 same-org reversal FK + immutable `reversal_reason`.
7. 0037 payment recorded→void only; `archived_at` removed from closed-period allowlist; draft INSERT policy matches comments.
8. 0040 receiving concurrency, immutability, same-org, lifecycle.
9. 0044 location same-org FKs, movement semantics, protected balances.
10. 0036 `legacy_undivided` cannot contradict tax>0.

---

## Tests

Final verification gate passed after owner code review: unit, UI, integration, migration (clean 0000→0045 and upgrade 0035→0045), typecheck, lint, build, and `playwright:ci`.

---

## Intentionally excluded

- Portal ON
- FIFO / average inventory costing
- Israeli statutory invoice numbering
- MS Project / CPM
- Legal e-signature
- Auto-post of vendor bills from BOQ
- Merging quote / CRM quote / change-order objects
