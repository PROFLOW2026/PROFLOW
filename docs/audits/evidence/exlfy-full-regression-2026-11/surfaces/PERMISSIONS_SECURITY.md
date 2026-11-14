# Permissions / security addenda (read-only)

## PASS — internal drawings vs contractors

RLS (`0162`) + `contractorMayViewDrawing` + app filters + integration tests: `contractor_visibility = internal` never visible with `ext.plan.view` alone. Older audit FAIL writeups are **stale**.

## FINDING — nested `runInOrgContext` ignores target org (multi-org badges)

When already inside an org tx frame, `runInOrgContext` reuses nested snapshot and ignores passed `organizationId`. `loadOrganizationSwitcherOpenTaskCounts` therefore likely attributes open-task counts to the **active** org for every membership chip.

- File: `src/shared/auth/session.ts` (~167–183)
- Caller: `organization-switcher-open-tasks.ts`
- Severity: **P2** integrity (wrong badges), not confirmed cross-tenant row leak
- Confidence: **High** (static)

## FINDING — live-share host authz weaker than product copy

`startLiveShare` passes `need: 'document'` but internal `authorizeProject` only enforces `PROJECT_VIEW` (need ignored for internals). Users with project view but without document capability can start broadcast.

- Files: `live-share.ts`, `infra-mapping/application/access.ts`
- Severity: **P1** permission hole
- Confidence: **High**

## Residual

- Authz cache 45s lag on revocation (`cached-authz.ts`)
- Contractor plans: service-role load then filter — safe if every exit keeps filter
- Sheet-mark BOQ link create: no server assert that BOQ node belongs to project (MED)
