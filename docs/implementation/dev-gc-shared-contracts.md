# Developer / GC / Subcontractor Management - frozen shared contracts

Owner: MAIN AGENT. Waves must conform; changes go through the MAIN AGENT.

## 1. Actor identity

Every write in the new domains records an **actor**:

| actor_type | identity | source |
|---|---|---|
| `internal` | `profiles.id` | `OrgContext.userId` (owner app AND employee app) |
| `external` | `external_principals.id` | external session (never an `OrgContext`) |
| `system` | none | scheduled jobs / domain-event handlers |

Tables that need an actor store `*_actor_type text` + `*_user_id uuid null` + `*_principal_id uuid null`
with a CHECK that exactly one identity matches the type. External principals never receive
`organization_memberships`, never a `employees` row, never an `OrgContext`.

## 2. Internal authorization - project capabilities

- Canonical check: `assertProjectCapability(context, projectId, capability)` (`src/modules/project-team`).
- Source of truth: `project_members` + `project_member_capabilities`. NOT `role_assignments.project_id`
  (the existing RLS helper `app.has_org_permission` unions every role assignment org-wide; a project-scoped
  role placed there would silently become organization-wide).
- Org-wide authority is the single permission `project_team.admin` (Owner has it via the full catalog).
- Capabilities are classified `operational | financial | administrative`. Financial capabilities are never implied by
  operational ones. A grantor can never grant a capability they do not hold (no escalation).
- DB mirror: `app.has_project_capability(org, project, capability)` (SECURITY DEFINER, same semantics).
- Existing org permissions keep working unchanged for existing modules.

### 2.1 Employee App reach (decision 2026-10-03)

The Owner app `(app)` keeps redirecting Employee App sessions to `/employee` (unchanged; no loosening of
`assertOwnerAppSurface`). Internal DG screens are therefore built as **reusable server-component screens exported from each
module** (`<Domain>Screen({ projectId, basePath, ... })`, links built from `basePath`), mounted by thin route pages in both
surfaces: `(app)/projects/[projectId]/<route>` and `employee/(shell)/projects/[projectId]/<route>`. Both pages call
`requireProjectCapabilityPage` from `@/modules/project-team/server`. The Employee App wrappers + hub links are built centrally
in wave 2 (Track S2 "employee surfaces"); domain tracks only need to export their screens with a `basePath` prop.

## 3. External authorization - grants

- `external_principals` (identity, username + password via Supabase Auth, no org membership).
- `external_access_grants` extended with explicit scope columns: organization (always), project, vendor,
  subcontract agreement; plus per-grant external capabilities. Enforced in a DAL (`requireExternalGrant`) and
  RLS-equivalent predicates; never by hidden UI controls.

## 4. Locations

`project_locations` (adjacency list per project, `type`, `code`, `sort_order`, `metadata`, `is_active`).
Any entity may carry an optional `location_id` with composite FK `(location_id, organization_id)`.

## 5. Subcontract identity

- Contractor company = `vendors`. Contract = `subcontract_agreements`. Work package = `work_packages`.
- New: `subcontract_work_lines` keyed by `(id, organization_id)`, belonging to one agreement.
- Claims reference work lines, never client BOQ nodes.

## 6. Documents

`documents` stays the authorization record, bytes stay in external storage. Contractor visibility is expressed by
`document_links` to `subcontract_agreement`/`project` owners plus a contractor-visibility flag; no file copies.

## 7. Domain events (typed, emitted by application services)

`<domain>.<entity>.<verb>` e.g. `subcontract.claim.submitted`, `subcontract.claim.certified`,
`task.external.assigned`, `coordination.readiness.requested`, `coordination.contractor.not_ready`,
`plan.revision.published`, `defect.completion_submitted`. Consumers: notifications, activity feed,
Command Center, audit.

## 8. Audit

`audit_events` keeps its shape; `actor_user_id` stays internal. External actions additionally write
`metadata.actor = { type: 'external', principalId }` until the actor columns migration lands (W2).

## 9. Financial invariants

- Claim submitted != certified. Assessments are append-only (DB triggers deny UPDATE/DELETE).
- Certification != AP Actual != Payment. Certification yields a payable basis; AP bill is created only as draft/expected.
- Claims and certifications are NET; VAT is canonical at the AP invoice.
- Retention is cash timing only. Deductions are first-class records, not hidden AP credits.
- Work certified is independent of payment eligibility (compliance holds).
