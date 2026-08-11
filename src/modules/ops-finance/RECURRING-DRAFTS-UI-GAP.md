# Recurring financial drafts — UI gap (Agent 12)

**Schema:** `recurring_financial_drafts` exists in `drizzle/schema/next-gen-ops.ts` (migration 0028).
**History:** `recurring_financial_draft_runs` in migration 0030 (must be applied before generate-now history persists).

**Rule:** Drafts only — never auto-finalize expense / vendor bill / billing record.

**UI status:** Implemented in `src/modules/recurring-drafts/` with routes under `/recurring-drafts`.

**Remaining:**
- Apply migration 0030 before generate-now can insert run history (this wave does not migrate).
- No scheduled/cron auto-generation — generate is manual (generate-now) only.
- Expense generate requires both `expenses.finalize` (template/run RLS) and `expenses.create` (`createExpense`).
- Payload capture is the essential money fields (not full allocation / tax-mode editors). Generated drafts can be completed on the expense / AP / billing screens.
