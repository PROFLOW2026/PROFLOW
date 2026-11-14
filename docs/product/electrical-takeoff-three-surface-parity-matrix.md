# Electrical takeoff — three-surface parity matrix

Same UI and `TakeoffClientApi` on main app, employee app, and contractor portal. Capabilities from `domain/permissions.ts` only.

| Action | Main | Employee | Contractor | Gate |
|--------|------|----------|------------|------|
| Open takeoff workspace | yes | yes | yes | `takeoff.view` / `ext.takeoff.view` + project scope |
| Upload plans (chunked) | yes | yes | yes | `takeoff.manage` / `ext.takeoff.manage` |
| Run analysis | yes | yes | yes | `takeoff.manage` |
| Edit detections / BOQ | yes | yes | yes | `takeoff.manage`; blocked when `approved` |
| Approve | yes | yes | yes | `takeoff.approve` |
| Manage symbol library | yes | yes | yes | `takeoff.library.manage` |
| Export xlsx/pdf | yes | yes | yes | `takeoff.view` |

No capability reduction by `employeeApp` / `external` alone.