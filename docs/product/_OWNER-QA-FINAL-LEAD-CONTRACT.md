# Owner QA Final Closure — Lead Contract

**Status:** BINDING  
**Commit / push / db:migrate:** FORBIDDEN  
**Migrations 0000–0020:** IMMUTABLE  
**New schema:** ONE additive `0021_project_contacts_and_team.sql` — DO NOT APPLY  

## Closed (do not reopen unless regression)

- Expense VAT inclusive/exclusive
- Project page ordering (tabs above setup)

## Remaining ownership

| Agent | Owns | Must not touch |
|-------|------|----------------|
| **Perf** | Prefetch strategy (shell Links), project `[projectId]/layout.tsx` soft-nav split, dashboard expense single-load, drizzle chunk probe/fix, perf measurement notes | VAT forms, click polish (except prefetch props on Links), 0021 SQL |
| **Click** | All clickable press feedback exceptions → shared pressable/pending | Financial formulas, schema, perf loaders |
| **Schema/Lead** | `0021` SQL + Drizzle schema mirrors + journal | Product UX beyond types |
| **Contact UI** | Project contact select/create/header — uses `projects.primary_contact_id` | Team membership, VAT |
| **Team UI** | `project_team_members` application + Project צוות + Employee projects | Contact primary FK logic |

## Architecture locks

### Prefetch
- Default `prefetch={false}` on shell/nav/quick-create/settings Link wrappers.
- Opt-in prefetch only for high-probability next actions (document which).

### Soft-nav
- Move stable project chrome + `loadProjectDetail(chrome)` into `[projectId]/layout.tsx`.
- Keep `?tab=` deep links; page loads tab-gated panels only.
- Do not reverse tab order / setup-below-tabs rule.

### Contact V1
- `projects.primary_contact_id` → `client_contacts.id`
- Same-org composite FK + trigger: contact.client_id must match project.client_id
- Optional; does NOT mutate client-wide primary role
- Header: project contact, else client practical primary fallback

### Team V1
- Table `project_team_members` (org, project, employee, optional role/notes)
- UNIQUE(project_id, employee_id); same-org composite FKs; RLS
- Assignment ≠ Actual Cost (zero financial effect)

## Financial non-negotiables

- Actual Cost = NET; no stale financial caches; no alternate VAT formulas
- Team assignment never creates labor Actual

## Delivery

Each agent: STATUS, files, schema YES/NO, tests, limitations, BLOCKER/HIGH/MEDIUM.  
Lead: disposable 0020→0021 upgrade, Full Gate, Hebrew FINAL REPORT.
