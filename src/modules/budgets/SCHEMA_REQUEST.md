# Budgets — schema requests (Agent 4)

Lead-owned migrations are not edited by this agent. Current `project_budgets` /
`project_budget_lines` / `project_budget_revisions` are sufficient for V1.

## Optional follow-ups (not blockers)

1. **One active budget per project** — unique partial index on
   `(organization_id, project_id) WHERE status = 'active' AND archived_at IS NULL`
   would enforce what application code already rejects.
2. **Line-level Actual** — display overlay only (`mapBudgetLineActuals`).
   Category / WP lines receive expense contribution slices when the key
   matches. Discipline / cost-code stay unmapped (expense/AP do not carry
   those keys). Unmapped remainder = engine Actual − mapped line Actuals.
   Do not add a second Actual formula.
3. **`work_package_id` FK** — optional composite FK to `work_packages` if Lead
   wants referential integrity beyond UUID storage.
