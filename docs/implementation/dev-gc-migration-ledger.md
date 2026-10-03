# Developer / GC - consolidated migration ledger

**MIGRATION APPLIED = YES** (0154 through 0170 applied to production `rnjeggpsjchayprygkcw`, eu-west-1, after the authenticated browser smoke). Journal has no pending entries. `subcontract_agreements` is a view; `authenticated` cannot select `subcontract_agreements_store`.

Owner of this ledger: MAIN AGENT. Subagents never add migration files directly.

| # | File | Wave | Purpose | Status |
|---|---|---|---|---|
| 0154 | `0154_project_team_capabilities.sql` | W1 | `project_team.admin` permission (+Owner backfill), `project_members`, `project_member_capabilities`, `app.has_project_capability`, additive branch in `app.can_access_project`, integrity triggers (internal-only members, identity frozen, no capability escalation), RLS + grants | applied to production |
| 0167 | `0167_dg_procurement_closeout.sql` | Q | Tenders, closeout, warranty, performance. Explicit authenticated/service_role grants. External offer and financials triggers freeze submitted bids and block select/reject. Closeout trigger blocks requirement and waiver edits. applied to production. | PGlite verified, applied to production |
| 0166 | `0166_dg_compliance_safety_materials.sql` | P | Compliance requirements/documents, safety contractor links, deliveries. Promoted after 18/18 tests. applied to production. | prepared, PGlite-verified |
| 0165 | `0165_dg_daily_log_meetings_instructions.sql` | O | Daily log, contractor reports, site-meeting extension, append-only instructions. Promoted after 23/23 tests. applied to production. | prepared, PGlite-verified |
| 0162 | `0162_dg_documents_plans.sql` | IJ | Evidence metadata, document shares, drawing revisions. Promoted after 14/14 tests. applied to production. | prepared, PGlite-verified |
| 0163 | `0163_dg_rfi_submittals.sql` | KL | RFIs, append-only answers, submittal revisions and reviews. External SELECT accepts `ext.rfi.view` or `ext.rfi.raise`. Insert and update still require `ext.rfi.raise`. applied to production. | PGlite verified, applied to production |
| 0164 | `0164_dg_inspections_defects.sql` | MN | Quality inspections, append-only outcomes, defects, append-only repair cycles. Promoted after contractor A/B isolation (6516ms) and the full repair cycle open→assigned→completion→reject/reopen→resubmit→verify→close (6159ms) both passed. Field-ops inspections/punch_list_items untouched. applied to production. | prepared, PGlite-verified |
| 0161 | `0161_dg_coordination_events.sql` | H | Coordination events, append-only readiness/reschedule/override/outcome, contractor sees only invited vendor. Promoted after 23/23 tests. applied to production. | prepared, PGlite-verified |
| 0160 | `0160_dg_collaboration_tasks.sql` | G | External task assignment on existing tasks, append-only lifecycle, contextual comments, additive task RLS. Promoted after 12/12 tests. applied to production. | prepared, PGlite-verified |
| 0159 | `0159_dg_claims.sql` | F | Claims, immutable submissions, append-only assessments/deductions, payable basis, holds. Promoted after 4/4 tests (80/60/70 + A/B). applied to production. Depends on 0158. | prepared, PGlite-verified |
| 0158 | `0158_dg_subcontract_core.sql` | E | Agreement lifecycle, financial terms split from operational profile, changes, unpriced work. Promoted after 21/21 tests. applied to production. | prepared, PGlite-verified |
| 0157 | `0157_dg_project_profile.sql` | D | Delivery profile, construction characteristics, recommendation decisions. Promoted after 43/43 tests. applied to production. | prepared, PGlite-verified |
| 0156 | `0156_dg_external_identity.sql` | C | Contractor principals, grants, invite tokens, sign-in attempts, RLS, no org membership. Promoted from WIP after 25/25 PGlite tests. applied to production. | prepared, PGlite-verified |
| 0169 | `0169_dg_notifications_command_center.sql` | T | External notifications + domain-event retry schedule. Promoted after consumer tests. applied to production. | prepared, PGlite-verified |
| 0170 | `0170_dg_surfaces_cost_control.sql` | S | External SELECT on existing `project_milestones` for principals who can already see the project. No new tables. applied to production. | in the PGlite chain, applied to production |
| 0168 | `0168_dg_financial_projection_rls.sql` | B | Money gate and secure view. `subcontract_agreements` is a compatibility view over `subcontract_agreements_store`: SELECT does not error, and header money is NULL unless the money gate or `ext.contract.view_value` passes. Store SELECT is revoked from `authenticated`. Safe to apply before the new app build. applied to production. | PGlite verified, applied to production |

## 0154 detail (for the Final Gate report)

- **Tables added:** `project_members`, `project_member_capabilities` (composite same-org FKs, FORCE RLS).
- **Data touched:** one `permissions` row inserted; `role_permissions` row inserted for every existing Owner role (expected: 1 row per organization).
- **Functions:** `app.has_project_capability` (new), `app.can_access_project` (replaced; identical to 0051 plus one additive membership branch that cannot match before this migration), 3 trigger functions.
- **Compatibility with deployed app:** additive only; the current app never reads the new tables.
- **Risk:** low. `can_access_project` is hot; the added branch is an indexed EXISTS evaluated only in `selected`/`assigned` access modes.
- **Recovery:** forward-fix only (re-create `can_access_project` from 0051 to remove the branch; tables are unused by the deployed app).
