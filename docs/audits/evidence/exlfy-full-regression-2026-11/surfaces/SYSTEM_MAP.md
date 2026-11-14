# System map (read-only) — from mapping subagent

**Scale:** ~426 App Router pages — **248** main `/(app)`, **106** employee, **53** contractor (+ auth/onboarding/public).

**Canonical sources:** `navigation.ts`, `project-hub-order.ts`, `execution-route-catalog.ts`, `contractor-portal/domain/routes.ts`, `get-employee-shell.ts`, `infra-three-surface-parity-matrix.md`, `infra-mapping/domain/permissions.ts`.

## Intentional non-parity (not bugs)

- Main-only: org settings, imports, banking/SUMIT UI, assistant, automations admin, developer chrome.
- Employee: no provider cloud deep links; PIN login; no personal cloud; schedule via calendar/timeline not main `?tab=schedule`.
- Contractor: no raw project folder browse; financial `ext.*` grant-scoped; no org CRM/settings; internal drawings never via `ext.plan.view` alone.

## Three-surface infra (binding)

Same `InfraWorkspace` + `permissions.ts` resolver. Contractor: no storage browse / open-in-cloud / location admin. Document grant required for workspace/camera.
