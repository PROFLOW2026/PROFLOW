# Infrastructure mapping — capability matrix across the three surfaces

Binding rule: the same permission gives the same capability on every surface. The surface (owner app,
employee app, contractor portal) is never a reason by itself to remove a capability. One shared UI
(`InfraWorkspace`), one shared server layer (`InfraActor` = internal | external), one resolver
(`src/modules/infra-mapping/domain/permissions.ts`).

Surfaces: **Main** = owner / office app, **Employee** = employee app (internal account with employee grants),
**Contractor** = contractor portal (external account with vendor grants).

## Capability matrix

| Capability | Main | Employee | Contractor | Gated by (same permission, any surface) |
|---|---|---|---|---|
| Open the infrastructure workspace | yes | yes | yes | `project.view` (internal) / `ext.document.view` (contractor) |
| Live camera, 4 points, magnifier, opacity, perspective, fine-tune, freeze/lock/release | yes | yes | yes | right to document |
| Take a photo / choose a phone photo | yes | yes | yes | `project.view` / `ext.document.upload` |
| Record or choose a short video (chunked upload, org storage) | yes | yes | yes | right to document (`canCaptureVideo = canDocument`) |
| Pick from the organization storage through the system | yes | yes | no (documented limit 1) | `documents.view` + employee file gate (`documents.read` + openable folder) |
| Pick from the infrastructure gallery (org photos) | yes | yes | yes (own grant / location / visibility) | view right + visibility |
| Locations / floors / apartments / rooms / walls browse and pick | yes | yes | yes (within allowed locations) | view right + `allowedLocationIds` |
| Document from an existing task | yes | yes | yes | task visible to the account |
| Gallery search / filter | yes | yes | yes | view right |
| Two-photo comparison, every view mode | yes | yes | yes | right to document |
| Save / reopen / delete comparisons | yes | yes | yes (own) | right to document |
| One phone: all of the above locally | yes | yes | yes | — |
| Two phones: QR broadcast (camera phone) | yes | yes | yes | right to document (`authorizeProject need:'document'`) |
| Viewer joins by QR (no account) | yes | yes | yes | signed viewer token, subscribe only |
| Host approves / withdraws remote control | yes | yes | yes | host token + right to document |
| Viewer marks 4 points, controls remotely, zoom, fullscreen | yes | yes | yes | granted by the host per session |
| Tripod mode, continuous broadcast, freeze / release | yes | yes | yes | — |
| Edit / delete own captures | yes | yes | yes | author |
| Edit / delete anybody's captures | per permission | per permission | no (documented limit 2) | `documents.share` or `project.manage` |
| Manage locations and cloud folders | per permission | per permission | no (documented limit 3) | `project.manage` |
| Open a file in the provider's own web UI | per permission | no (documented limit 4) | no (documented limit 4) | needs a provider login |

## Intentional, documented limitations (permission or essential need)

1. **Contractor raw storage browsing.** A contractor holds no read grant on raw project folders (reading them
   would bypass vendor scoping and visibility). Its organization photos come through the infrastructure gallery,
   which is scoped by grant, location and visibility. Uploads still land in the organization storage.
2. **Contractor editing others' captures.** Contractor grants carry no `documents.share` / `project.manage`
   equivalent. A contractor edits and deletes only what it captured itself.
3. **Contractor location management.** Locations are the organization's structure (`project.manage`, internal only).
4. **Provider deep links (OneDrive / Drive web UI).** Needs the viewer's own provider login. Employees and
   contractors have none and need none: the original is viewable inside the system, bytes always go through
   the system and never expose a provider token.

Everything else that previously differed was a blanket `employeeApp` / `external` restriction and was
replaced by the permission rule above:

| Before | Now |
|---|---|
| Video capture: internal non-employee only | any account that may document (new contractor chunk route `/api/contractor/infra/video-upload/:evidenceId`) |
| Storage picker: not wired for employees, hidden by `!employeeApp` | wired to the employee browse actions, gated by `documents.view` + the employee file gate |
| Provider link gate: `internal && canBrowseStorage` | `canOpenInCloud` (explicit permission flag) |

## Isolation guarantees (unchanged)

- Internal accounts act only inside their active organization; RLS applies on every query.
- A contractor acts only inside organizations/projects/vendors/locations covered by its own grants, checked on
  every request including every video chunk (a revoked grant stops the transfer).
- A contractor can finalize only its own pending upload (principal and vendor must match).
- The chunk relay holds service-role access only inside the organization/project of the evidence row and never
  returns provider tokens or URLs.
- No permission is granted automatically; no SQL or schema change was needed.

## Project goals (BUG-009 / BUG-015) — three-surface policy

Shared UI: `ProjectGoalsPanel` + `resolveProjectGoalsCapabilities` (`src/modules/project-goals/domain/permissions.ts`).
Routes: main `/projects/[id]/goals`, employee `/employee/projects/[id]/goals`, contractor `/contractor/projects/[id]/goals`.

| Capability | Main | Employee | Contractor | Gated by |
|---|---|---|---|---|
| VIEW goals | yes | yes | yes (shared subset only) | Internal: `project.view`. Contractor: project-covering `ext.project.view` for route discovery **plus** per-goal contractor visibility — never a full list via generic project view. |
| EDIT goals (create / status) | yes | yes | no (documented limit G1) | `projects.update` **or** `planning.write` (same as RLS 0201; view alone is insufficient — BUG-009 by design) |

### Intentional goals limitations

1. **G1 — Contractor edit.** Contractors never mutate goals; managers edit on internal surfaces only.
2. **G2 — Contractor visibility fail-closed.** Until a contractor-visibility mark exists on `project_goals` (schema/migration not in this change set), `listContractorVisibleProjectGoals` returns an empty list after grant check. Opening the route with `ext.project.view` does **not** leak the internal goals list.
3. **View vs edit asymmetry (BUG-009).** Authorized employees/office users with `project.view` can list goals; mutation UI and server actions require `projects.update` or `planning.write`. The panel shows an explicit view-only banner when applicable.
