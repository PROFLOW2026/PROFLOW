# Payment Scheduling Audit — ProjectFlow

Date: 2026-09-07  
Status: **COMPLETE** (code fixed locally — not committed)

---

## Part 1 — Pre-fix mapping (how it worked / where it broke)

### Architecture (before)

| Layer | Storage / behavior |
|-------|-------------------|
| **Installments** | No `payment_schedule` table. Cash installments computed in-memory via `buildCashInstallmentSchedule`. Progress on `expenses`: `installment_count`, `installments_paid_count`, `paid_gross_amount`. |
| **Managerial Actual** | Separate: `expense_managerial_schedule_lines` (NET spread for P&L). |
| **Recurring fixed expenses** | `recurring_financial_drafts` → one `expenses` row per month via `ensure-occurrences` / ops-worker. |
| **Vendor terms** | `organization_catalog_entries` (`kind=payment_term`) + `vendors.default_payment_term_id`. |
| **Due date** | Multiple paths: `deriveDueDate` (canonical), but vendor `recurringPaymentDay` could override; recurring draft pre-injected `dueDate` on generate. |
| **Alerts** | On-demand: `collectExpensesDueToday` in command-center (Today + Bell). No payment-alert cron. |
| **Auto approval** | Hardcoded skips for: all `installmentCount > 1`, all recurring expense templates, vendor/template `automatic` override — **ignored org `manual` default**. |

### Root causes

1. **Full-amount approval bug** — `confirmExpensePaid` always set `paidGrossAmount = grossAmount` and `paymentStatus = paid`.
2. **Full-amount alerts** — collectors used `row.grossAmount` instead of current installment / payable slice.
3. **Premature vendor alerts** — vendor `recurringPaymentDay` applied even when payment terms (e.g. שוטף+120) already produced a future `dueDate`; also `recurringPaymentDay` on vendor card overrode term-based dates for regular invoices.
4. **Auto approval not org-gated** — installments and recurring templates bypassed owner confirmation regardless of org setting.
5. **Multiple due-date semantics** — stored `expenses.due_date` (term), cash schedule dates, recurring day — not unified for payment UI/alerts.

### Sources of truth (after fix)

| Concern | Canonical source |
|---------|------------------|
| **Due date (terms)** | `deriveDueDate` / `suggestDueDateFromPaymentTerm` in `business-catalog/domain/types.ts` |
| **Effective payment due date + payable amount** | `resolveExpensePaymentObligation` in `expenses/domain/resolve-expense-payment-obligation.ts` |
| **Cash installment schedule** | `buildCashInstallmentSchedule` in `expenses/domain/cash-installment-schedule.ts` |
| **Installment progress** | `expenses.installments_paid_count` + `paid_gross_amount` (derived validation via schedule) |
| **Recurring instances** | `recurring_financial_drafts` + `recurring_financial_draft_runs` (one expense per month) |
| **Vendor terms** | Catalog entry FK on vendor / document; stored `due_date` frozen at create |
| **Auto approval** | Org only: `expense_payment_confirmation_mode = automatic_on_due` via `resolveExpenseAutomaticPaymentKind` |
| **Alert idempotency** | `itemKey = sourceType + expenseId:inst-N` per installment index |

### Jobs

- **ops-worker** (06:00 UTC / 09:00 Israel summer): for **every active org** —
  1) ensure recurring expense occurrences through today
  2) `syncAutomaticExpensePayments` (org `automatic_on_due` only)
- **Alerts (UI)**: still computed on Today/Bell page load for manual orgs and display only.
- Page load also triggers sync for manual review path; auto orgs rely on worker if nobody visits.

---

## Auto payment execution (post-fix)

| Question | Answer |
|----------|--------|
| **Who runs auto approval?** | `generateDueRecurringDrafts()` → `syncAutomaticExpensePayments()` per org |
| **Schedule** | Vercel cron `0 6 * * *` UTC → `/api/internal/ops-worker` |
| **Installments** | Yes — `syncInstallmentAutomaticPayments` via obligation |
| **Recurring** | Yes — occurrences ensured first, then sync |
| **Single due expenses** | Yes — `syncDueAutomaticPayment` |
| **Uses resolveExpensePaymentObligation?** | Yes |
| **Idempotent?** | Yes — re-run skips fully paid / zero payable |
| **Catch-up overdue?** | Yes — pays while `effectiveDueDate <= today` |
| **Manual org protected?** | Yes — early return when not `automatic_on_due` |
| **Future protected?** | Yes — breaks when `effectiveDueDate > today` |
| **Partial payment** | Auto **completes remainder** on due date (e.g. 150 after manual 200/350) |

---

## Part 2 — Fixes applied

### New canonical module

`src/modules/expenses/domain/resolve-expense-payment-obligation.ts`

- `payableAmount` — current installment remainder (or single-payment remainder)
- `effectiveDueDate` — from cash schedule for multi-installment, else stored due date
- `totalRemaining` — transaction total minus paid
- `obligationAlertSourceId` — stable per-installment notification key

### Key file changes

| File | Change |
|------|--------|
| `payment-behavior.ts` | Auto approval **only** when org `automatic_on_due` |
| `resolve-expense-payment-schedule.ts` | Removed vendor `recurringPaymentDay` override; recurring day only for `draftKind=expense` |
| `expense-payments.ts` | Per-installment confirm, partial pay, obligation-based sync, upcoming cash sums |
| `collect-owner-payments.ts` | Payable amount + installment labels in alerts; per-installment itemKey |
| `expense-payment-panel.tsx` | Shows transaction total / remaining / current payable; passes installment amount to confirm |
| `payment-actions.ts` | Accepts `paidGrossAmount` from form |
| `expenses.repository.ts` | Exposes `installmentsPaidCount`, `automaticInstallmentPayment` on detail |
| Locales | `transactionTotal`, `remainingBalance`, `installmentProgress` |

### Preserved (unchanged)

- Managerial Actual spread (`expense_managerial_schedule_lines`) — Payment ≠ Actual
- AP bills single `due_date` model
- Stored due dates not rewritten when vendor terms change post-create

---

## Part 3 — Acceptance checklist

```
PAYMENT SCHEDULING AUDIT = COMPLETE

Root cause =
  Multiple non-unified payment paths: full-gross confirm/alerts, hardcoded auto-approval,
  vendor recurringPaymentDay overriding canonical term due dates.

Canonical due date source =
  deriveDueDate / suggestDueDateFromPaymentTerm (terms)
  + resolveExpensePaymentObligation.effectiveDueDate (payment actions)

Installment source of truth =
  buildCashInstallmentSchedule (amounts/dates)
  + expenses.installments_paid_count / paid_gross_amount (progress)

Recurring source of truth =
  recurring_financial_drafts + one expense per month (recurring_financial_draft_runs)

Vendor terms source of truth =
  organization_catalog_entries (payment_term) + document/vendor FK; frozen due_date on row

Auto approval default = OFF REQUIRED ✓

Premature vendor alerts = 0 REQUIRED ✓ (term due respected; vendor recurring day removed from invoice path)

Installment full-amount approval bug = 0 REQUIRED ✓

Duplicate alerts = 0 REQUIRED ✓ (itemKey includes installment index)

Partial payment = PASS ✓

Historical paid records preserved = YES ✓ (stored due_date / paid rows not rewritten on vendor term change)

Actual financial regression = 0 REQUIRED ✓ (managerial schedule untouched)

Tests =
  payment-obligation.test.ts — PASS
  payment-terms-recurring.test.ts — PASS (incl. scenarios A,B,C,H,J)
  payment-actionable-window.test.ts — PASS
  owner-payments-collector.test.ts — PASS
  generated-note-and-payment.test.ts — PASS

Typecheck = PASS
Build = PASS
Migration required = NO
```

### Scenario coverage

| Scenario | Status |
|----------|--------|
| A — 4200/12, 350/month | PASS (with sequential paid count) |
| B — 1000/4, first paid | PASS |
| C — rounding to 1000 | PASS |
| D — recurring 500 manual | PASS (org manual → alert only) |
| E — recurring 500 auto | PASS (org automatic_on_due) |
| F — שוטף+120 Aug invoice, no Sep alert | PASS |
| G — overdue after due | PASS (existing status logic) |
| H — partial 200/350 | PASS |
| I — vendor term change post-invoice | PASS (frozen due_date) |
| J — no duplicate installment alerts | PASS (itemKey) |

---

## Part 4 — Follow-ups (not in scope)

- Per-installment DB rows (would enable non-sequential skip tracking without cumulative inference)
- Wire `expense_due_soon` collector (type exists, never emitted)
- Register `collectVendorBillsApproaching` in `collectAllSources`
- Partial void (reverse last payment only)
