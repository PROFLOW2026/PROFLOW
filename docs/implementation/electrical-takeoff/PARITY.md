# Three-surface parity — electrical takeoff

One resolver: `src/modules/electrical-takeoff/domain/permissions.ts`.

| Capability | Owner/Office (org permission) | Employee | Contractor (grant) |
|------------|------------------------------|----------|-------------------|
| View analyses | `takeoff.view` + `project.view` | same permission | `ext.takeoff.view` + grant scope |
| Run / edit | `takeoff.manage` | same | `ext.takeoff.manage` |
| Approve | `takeoff.approve` | same | `ext.takeoff.approve` |
| Symbol library | `takeoff.library.manage` | same | `ext.takeoff.library.manage` |

**Intentional limitation:** Contractors have no raw org-folder browse; uploads go through chunked API into org storage (same as infra/evidence pattern).

**Round 3 check:** Org paths use `documents` + `externalProviderFileStore` (`takeoff-org-file-store.ts`); permissions seeded via `PERMISSION_CATALOG` + `role-templates.ts` (manager takeoff.*); contractor mirrors under `/api/contractor/takeoff/*` with `ext.takeoff.*` grants.

Product matrix: `docs/product/electrical-takeoff-three-surface-parity-matrix.md`.