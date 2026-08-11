# Budgets — schema requests (Agent 4)

Lead-owned migrations are not edited by this agent. Current `project_budgets` /
`project_budget_lines` / `project_budget_revisions` are sufficient for V1.

## Optional follow-ups (not blockers)

1. **One active budget per project** — unique partial index on
   `(organization_id, project_id) WHERE status = 'active' AND archived_at IS NULL`
   would enforce what application code already rejects.
2. **Line-level Actual allocation** — intentionally omitted. Category / WP /
   discipline / cost-code lines are budget structure only; Actual remains the
   shared financial engine total. Do not add a second Actual formula.
3. **`work_package_id` FK** — optional composite FK to `work_packages` if Lead
   wants referential integrity beyond UUID storage.
