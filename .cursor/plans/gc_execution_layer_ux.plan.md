---
name: GC execution layer UX
overview: Project mode decides whether the Developer/GC execution layer exists. The organization Owner has full access without a project_members row. Every other main-app user needs membership and project capabilities. Subcontract agreements never set the mode.
todos:
  - id: mode-gate
    content: "Enable the execution layer only when the project mode is developer_gc. Do not infer it from agreements or from the viewer's org role."
    status: completed
  - id: capability-hubs
    content: "Owner gets every hub without a project_members row. Every other user sees a hub only with membership plus the matching capability. Hide money unless a financial capability is held, and enforce that in the server."
    status: completed
  - id: create-edit-mode
    content: "Keep project create/edit as the mode choice only. Keep project team as the separate screen for who can access the project."
    status: completed
  - id: static-nav
    content: "Replace existsSync page detection with a static hub catalog gated by mode and project capability, shared by the main app and the employee app."
    status: completed
  - id: seven-hubs
    content: "Add the seven hub screens that link into existing contractor, claim, coordination, quality, and team routes."
    status: completed
  - id: team-templates
    content: "Let an authorized administrator assign multiple people to the same template and customize capabilities. Job title grants nothing by itself."
    status: completed
  - id: partial-gaps
    content: "Add payment-stage presentation, progress, contractor closeout, and a GC planning hub on top of existing engines."
    status: completed
  - id: standard-guard
    content: "Keep standard, execution-contractor, and project-management projects free of the GC layer and of GC-only FAB actions."
    status: completed
isProject: true
---

# GC execution layer — implementation map

No application code in this step.

Two decisions stay separate.

**Project mode** answers what kind of project this is. It turns the Developer/GC execution layer on or off.

**Who may use it** is a second decision. The organization Owner is the exception. Every other internal user is authorized per project.

Access rules on a `developer_gc` project:

- Organization Owner → full GC execution-management access. No `project_members` row. No project capability assignment. Do not insert the Owner into `project_members` to unlock this.
- Every other internal/main-app user → `developer_gc` + project membership + the required project capability = that hub or action.
- External contractor → external principal + scoped grant + contractor portal. Not a project member.

A non-Owner sees every hub their capabilities allow, and does not see an empty hub. A job title grants nothing by itself. Access to the project does not grant money.

## Project mode

`project_delivery_profiles.operating_roles` stays the stored field. There is no exclusive mode column today. Do not add one unless a later review finds the array cannot express the four choices.

| Mode chosen on create/edit | Stored roles | Execution layer |
|---|---|---|
| standard_project | `{}` or no profile row | absent |
| execution_contractor | `subcontractor` only | absent |
| project_management | `project_management` only | absent |
| developer_gc | `developer` + `general_contractor` | present |

Empty roles remain the default. Vendors and subcontract agreements never flip the mode. Any other role mix is not treated as developer/GC until that mode is saved.

`execution_contractor` means this company is the contractor on the job. It is not a smaller Developer/GC menu. It keeps the normal project page. That layer is out of this slice.

PRJ-00012 already stores `developer` + `general_contractor`, so the layer exists for every authorized user on that project. No reseed.

## Who can use the layer

Use the existing resolver. Do not add a check that the GC layer exists only for Owner, and do not require the Owner to be a project member.

**Organization Owner.** Full access to every hub and action on a `developer_gc` project. The Owner role already holds org permission `project_team.admin`, and that permission already resolves to every project capability without reading a membership row. Keep that path. Do not insert the Owner into `project_members` merely so the layer appears.

**Every other internal/main-app user.** An active `project_members` row is required. The capabilities on that row decide what they can see and do. This includes project manager, site manager, engineer, secretary / project administrator, developer representative, client coordinator, finance, document controller, safety, quality, consultant, and any other main-app user explicitly assigned. No membership means no GC hub, even on a Developer/GC project.

- Templates pre-fill a capability set. They are not roles and do not grant authority by job title.
- Several people may hold the same template at once. There is not a single Project Manager slot.
- The grantor may assign only capabilities they hold.
- External contractors stay external principals on the contractor portal. They are not employees and they are not `project_members`.

The same capability set is the authority in the main application and in the employee app. Both surfaces call the same project services. They do not keep separate financial truths.

Financial capabilities are never implied by operational ones. Server projections, the data layer, and RLS keep enforcing that. Hiding an amount in the page is not the control.

### Capability names already in the catalog

Operational: `project.view`, `project.manage`, `schedule.view`, `schedule.manage`, `tasks.view`, `tasks.manage`, `contractor.view`, `contractor.coordinate`, `progress.view`, `progress.verify`, `documents.view`, `documents.share`, `rfi.manage`, `submittal.manage`, `quality.manage`, `defects.manage`, `daily_log.manage`, `meetings.manage`, `safety.manage`.

Financial: `financial.view`, `contract.financial.view`, `contract.manage`, `change.financial.manage`, `claim.view`, `claim.review`, `claim.certify`, `deductions.manage`, `retention.manage`, `payment.view`, `payment.manage`, `project_budget.view`, `project_budget.manage`.

Administrative: `contractor.invite`, `external_access.manage`, `project_team.manage`, `project_settings.manage`.

`contractor.view` shows contractors and does not include contract money. Money requires `contract.financial.view` or another financial capability.

### Hub visibility

On a `developer_gc` project, the Owner sees all seven hubs. Every other internal user sees only the hubs their membership capabilities can open.

| Hub | Shown when the viewer holds any of |
|---|---|
| סקירת ביצוע | `project.view` |
| קבלנים | `contractor.view` |
| חוזים וכתבי כמויות | `contractor.view`, `contract.financial.view`, or `contract.manage` |
| חשבונות קבלנים ותשלומים | `claim.view`, `payment.view`, `deductions.manage`, `retention.manage`, or `project_budget.view` |
| תכנון ותיאום | `schedule.view`, `schedule.manage`, `tasks.view`, or `contractor.coordinate` |
| איכות ומסמכים | `documents.view`, `rfi.manage`, `submittal.manage`, `quality.manage`, `defects.manage`, `daily_log.manage`, `meetings.manage`, or `safety.manage` |
| צוות הפרויקט | `project.view` to read the team; `project_team.manage` to add, edit, or deactivate |

Inside a visible hub, each child link and each amount follows the child capability. A secretary with `contractor.view` and `contractor.invite` sees contractors and portal-user controls, and sees no prices. A site manager with operational capabilities and no financial capability sees execution hubs and no contract money. Finance with claim, retention, and payment capabilities sees the claims hub without receiving unrelated operational manage rights. A client representative sees only the capabilities explicitly stored on their membership.

Existing templates already cover project manager (full and operational), site manager, foreman, execution engineer, quantity surveyor, project accountant, document controller, safety manager, quality manager, consultant, and viewer. Senior project manager, secretary / project administrator, client coordinator, and developer representative are additional starting templates or custom capability sets. Adding a title does not grant access until capabilities are saved on that membership.

## A. Routes to reuse

Do not rewrite these domains. Hub pages link to them. The same routes serve the main app and the employee app when that surface already has the page.

- סקירת ביצוע → `/projects/{id}/execution`
- קבלנים → `/projects/{id}/contractors`, `/contractors/{agreementId}`, `/contractor-access`
- חוזים → `/contractors/{agreementId}/lines`, `/contractors/{agreementId}/changes`, `/unpriced-work`
- חשבונות → `/claims`, `/claims/{claimId}`, `/deductions`, `/cost-control`
- תיאום ומשימות → `/coordination`, `/coordination/{eventId}`, `/tasks`, `/boards`, `/calendar`, `/timeline`
- איכות ומסמכים → `/plans`, existing `?tab=documents`, `/rfi`, `/submittals`, `/inspections`, `/defects`, `/site-log`, `/site-meetings`, `/instructions`, `/contractor-compliance`, `/site-safety`, `/deliveries`, `/contractor-closeout`
- צוות → `/projects/{id}/team`
- Structure profile and locations stay on `/structure`, reached from סקירת ביצוע, not as a primary button. `project.view` may open and read construction characteristics and the location hierarchy. `project.manage` or `project_settings.manage` may edit them. Opening the screen does not require `project.manage`.
- Contractor portal routes stay on `/contractor/…` for external principals only

The classic schedule remains `?tab=schedule` inside the existing Work hub for projects that are not `developer_gc`. It is not the Developer/GC planning entry.

## B. Hubs to create

One compact block on the existing project page, title **ניהול ביצוע**, at most these seven links:

1. סקירת ביצוע
2. קבלנים
3. חוזים וכתבי כמויות
4. חשבונות קבלנים ותשלומים
5. תכנון ותיאום
6. איכות ומסמכים
7. צוות הפרויקט

Header, commercial summary, billing, profitability, files, work, and the current tabs stay. Mobile uses the same list, wrapped, not a 25-wide bar.

New hub pages are indexes plus the genuine gaps below. Remove `existsSync(page.tsx)`. Register hubs and child routes in a static catalog. Show a link only when the project mode is `developer_gc` and the viewer is either the organization Owner or a project member who holds the capability in the table above.

## C. Genuine gaps

- Payment stages: a milestone/payment-stage view on the existing work-line model. No second money engine. Retention setup, advance setup, and payment terms sit on the contract hub and stay behind financial capabilities.
- Progress on Contractor 360, behind `progress.view` / `progress.verify`.
- Contractor 360 sections over the existing data, including that agreement's handover and warranty.
- One planning hub over the existing planning items, coordination, readiness, linked tasks, and board/calendar/timeline. No new schedule tables. Do not send this hub to `?tab=schedule`.
- Create/edit controls only where a reused page has none, still capability-gated.
- Starting templates for senior project manager, project administrator, client coordinator, and developer representative, as editable presets only.

## D. When the layer is absent

For `standard_project`, `execution_contractor`, and `project_management`, the layer is absent for everyone, including the Owner. Mode controls existence. It does not remove the Owner's access on a project that is `developer_gc`.

- no ניהול ביצוע panel
- no contractor hub, portal-user hub, GC claims hub, GC quality hub, or GC planning button
- no GC-only floating + actions
- `?tab=schedule` stays the normal Work-hub schedule
- existing client billing, profitability, files, and work tabs are unchanged

On a `developer_gc` project the floating + keeps today's global actions. The Owner receives every GC create action. Every other user receives contractor/agreement, task, coordination event, RFI, submittal, defect, inspection, instruction, and claim only for capabilities on their membership.

## E. Create, edit, and team are different screens

Project create and project edit ask what type of project this is. Default is standard project:

- פרויקט רגיל
- קבלן מבצע
- יזם / קבלן ראשי
- ניהול פרויקט

Saving writes the role mapping above. It does not assign people, and it does not create an Owner membership row.

Project team, for the Owner or a member with `project_team.manage`, assigns the other participants: add a main-app user, apply one or more templates, customize capabilities, keep financial grants explicit, activate or deactivate access, and allow more than one person in the same function. The Owner is not added to that list in order to keep full access. Construction characteristics and locations stay on `/structure`, opened from סקירת ביצוע. A site manager, engineer, client coordinator, consultant, or any other member with `project.view` can see buildings, floors, apartments, rooms, and project characteristics. Editing that definition requires `project.manage` or `project_settings.manage`.
