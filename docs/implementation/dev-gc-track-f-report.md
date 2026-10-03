# Track F — Contractor claims (completion report)

Per `docs/implementation/dev-gc-track-briefs.md` §0.6. WIP SQL **not** applied to any shared database.

## 1. Files created/changed

**New (Track F owned)**

- `src/modules/subcontract-claims/index.ts`, `register-ports.ts`
- `src/modules/subcontract-claims/application/external.ts`, `command-center.ts`
- `src/modules/subcontract-claims/ui/*` (actions, lists, detail, portal, deductions, assessments history)
- `src/app/[locale]/(app)/projects/[projectId]/claims/page.tsx`, `claims/[claimId]/page.tsx`, `deductions/page.tsx`
- `src/app/[locale]/contractor/(portal)/projects/[projectId]/claims/page.tsx`, `claims/[claimId]/page.tsx`, `payments/page.tsx`
- `tests/unit/subcontract-claims/assessments.test.ts`
- `tests/integration/dg-claims/claims.test.ts`
- `src/locales/{he-IL,en,ar,ru}/subcontractClaims.json` (filled)

**Unchanged (prior agent — not rewritten)**

- `src/modules/subcontract-claims/application|data|domain|validation/**` (21 files)
- `drizzle/migrations-wip/0159_dg_claims.sql`, `drizzle/schema/dg-claims.ts`

**Pre-existing slots (already registered before this pass)**

- `src/shared/domain-events/events/claims.ts`
- `src/shared/entity-access/resolvers/claims.ts`
- `src/shared/audit/dg/claims.ts`

## 2. WIP SQL (`0159_dg_claims.sql`) — summary

Tables: `subcontract_claim_sequences`, `subcontract_claims`, `subcontract_claim_revisions`, `subcontract_claim_lines`, `subcontract_claim_line_submissions`, `subcontract_claim_assessments` (append-only trigger), `subcontract_claim_payable_bases`, `subcontract_deductions`, `subcontract_deduction_disputes`, `subcontract_payment_holds`.

Functions/triggers: `app.subcontract_claim_assign_number`, `app.subcontract_claims_append_only`, assessment/submission immutability, claim header transition guards, SECURITY DEFINER financial read ports, RLS (internal `app.has_project_capability`, external `app.external_has_scope`).

## 3. Use-cases, actions, routes, UI

| Surface | Routes | Module entrypoints |
|--------|--------|-------------------|
| Internal | `/projects/[projectId]/claims`, `.../claims/[claimId]`, `.../deductions` | `listProjectClaims`, `getClaimDetail`, review/certify/reassess, deductions/holds/payments use-cases |
| Portal | `/contractor/projects/[projectId]/claims`, `.../claims/[claimId]`, `.../payments` | `listContractorProjectClaims`, `getContractorClaimDetail`, submit/correct/cancel, `listContractorProjectPayments` |

Server actions: `src/modules/subcontract-claims/ui/actions.ts`. UI: responsive list/detail, **append-only assessment timeline** (`AssessmentHistory`).

## 4. Events, resolvers, audit

- Events: `src/shared/domain-events/events/claims.ts` (payloads ids/status only).
- Resolvers: `claim`, `claim_line`, `deduction` in `src/shared/entity-access/resolvers/claims.ts`.
- Audit: `src/shared/audit/dg/claims.ts` merged in `src/shared/audit/actions.ts`.
- Command Center ports registered in `register-ports.ts`: `dg_claim_awaiting_review`, `dg_payment_eligibility_blocked`.

## 5. Tests + results

```powershell
$env:PF_WIP_FILES='0158_dg_subcontract_core.sql,0159_dg_claims.sql'
npx vitest run tests/unit/subcontract-claims tests/integration/dg-claims
```

- **Unit (2/2 pass):** effective certified after certify 60 → reassess 70; non-certifying decisions ignored.
- **Integration (2/2 pass):** end-to-end claim submit → certify 60 → reassess 70 (three preserved assessment facts, effective 70); DB UPDATE on assessments blocked (append-only); contractor B cannot read contractor A claim.

## 6. REQUESTS TO MAIN AGENT

- Wire **project nav / FAB / Employee hub** to new routes (`claims`, `deductions`; portal claims/payments) — Track S/U.
- Add **activity/settings** copy for `subcontractClaims` audit action labels in `settings.activity.actions` (4 locales) if not generated from audit registry.
- Optional: **contractor portal** nav link to claims/payments on project dashboard (Track R).
- `quantity_surveyor` template: confirm whether **`claim.certify`** should be included (tests use Owner for certify).

## 7. Known gaps

*(empty — Track F scope for this wave complete pending MAIN AGENT nav wiring only, listed above as requests not product gaps.)*
