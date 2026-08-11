# Schema request — Approvals (Agent 8)

## Problem
`approval_rules` SELECT RLS requires `approvals.read`. Finalize / issue gates
(`assertApprovalAllowsAction`) need to read **enabled** rules for the org even
when the actor only has domain permissions (e.g. `expenses.finalize`) and not
`approvals.read`. Under current RLS the gate silently no-ops (empty rule list).

Same for reading existing `approval_requests` for the entity during the gate.

## Proposed change (Lead-owned migration 0029+)
1. `approval_rules` SELECT: allow any org member to select **enabled** rules
   (or all rules) for their organization — configuration still gated by
   `approvals.manage` on INSERT/UPDATE/DELETE.
2. Optional: `approval_requests` SELECT for org members on rows they submitted,
   so submitters can see pending status without full `approvals.read`.

## Not requesting
- Multi-step workflow / assignee columns
- Soft FK from `rule_id` (nullable is fine for V1)
