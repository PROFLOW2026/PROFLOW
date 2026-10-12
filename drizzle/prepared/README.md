# Prepared migrations (not in CI journal)

SQL files here are **reviewed and tested** but **not** listed in `drizzle/migrations/meta/_journal.json` until the Owner explicitly approves apply to Production.

- `0180_expense_installment_payments.sql` — installment payment ledger; tests in `tests/integration/migration/hardening-0180-expense-installment-payments.test.ts`.

When approved: copy or move into `drizzle/migrations/` with the next journal tag, then run migrate per release policy.
