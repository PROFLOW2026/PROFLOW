# Recurring financial drafts — UI gap (Agent 12)

**Schema:** `recurring_financial_drafts` exists in `drizzle/schema/next-gen-ops.ts` (migration 0028).

**Rule:** Drafts only — never auto-finalize expense / vendor bill / billing record.

**UI status:** Not implemented in this agent wave (time spent on portal + global search + open-project payload).  

**Suggested follow-up (no migration):**
- Thin settings or ops list under `src/modules/ops-finance` or a dedicated `recurring-drafts` module
- CRUD for `active|paused|ended` templates + manual “generate draft row” action that creates an **unfinalized** draft entity only
- Permissions: reuse existing expense/AP/billing manage keys by `draft_kind`
