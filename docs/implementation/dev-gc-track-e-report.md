# Track E — Subcontract core (FINAL report §0.6)

**Slot:** `0158_dg_subcontract_core.sql` · **Registry:** `subcontract` · **Date:** 2026-10-03

---

## 1. Files created / changed

### Module (owned)

| Area | Path |
|------|------|
| Public API | `src/modules/subcontracts/index.ts` |
| Domain | `domain/types.ts`, `domain/lifecycle.ts`, `domain/value.ts` |
| Data | `data/agreements.repository.ts`, `data/work-lines.repository.ts`, `data/changes.repository.ts`, `data/unpriced-work.repository.ts`, `data/rows.ts` |
| Application | `application/access.ts`, `agreements.ts`, `work-lines.ts`, `changes.ts`, `unpriced-work.ts`, `read-models.ts`, `external.ts` |
| Validation | `validation/schemas.ts` |
| UI | `ui/actions.ts`, `ui/forms.tsx`, `ui/lines-panel.tsx`, `ui/changes-panel.tsx`, `ui/agreement-nav.tsx`, `ui/status.tsx`, `ui/page-guard.ts`, `ui/form-state.ts`, `ui/action-form.tsx`, `ui/version-lines-editor.tsx` |

### Schema / migration (prepared, not applied)

- `drizzle/schema/dg-subcontract.ts` (exported from `drizzle/schema/index.ts`)
- `drizzle/migrations-wip/0158_dg_subcontract_core.sql`

### Shared track slots

- `src/shared/domain-events/events/subcontract.ts` → merged in `domain-events/registry.ts`
- `src/shared/entity-access/resolvers/subcontract.ts` → merged in `entity-access/index.ts`
- `src/shared/audit/dg/subcontract.ts` → merged in `shared/audit/actions.ts`
- `src/locales/{he-IL,en,ar,ru}/subcontracts.json` (+ `subcontracts` in `shared/i18n/config.ts`)

### Routes

| App | Route |
|-----|-------|
| Internal | `src/app/[locale]/(app)/projects/[projectId]/contractors/[agreementId]/lines/page.tsx` |
| Internal | `src/app/[locale]/(app)/projects/[projectId]/contractors/[agreementId]/changes/page.tsx` |
| Internal | `src/app/[locale]/(app)/projects/[projectId]/unpriced-work/page.tsx` |
| Portal | `src/app/[locale]/contractor/(portal)/projects/[projectId]/contracts/[agreementId]/page.tsx` |
| Portal | `src/app/[locale]/contractor/(portal)/projects/[projectId]/contracts/[agreementId]/changes/page.tsx` |

### Tests / fixtures

- `tests/unit/dg-subcontract/domain.test.ts`
- `tests/integration/dg-subcontract/subcontract-core.test.ts`
- `tests/setup/dg-fixtures-subcontract.ts` (Track E–owned external binder; does not edit shared `dg-fixtures.ts`)

### Finish pass (this session)

- `data/agreements.repository.ts` — financial header read from `subcontract_agreements` for PGlite with 0158 only (0168 secure view documented in comment).
- Portal contracts lines page — `WithClientMessages` for `subcontracts` namespace.
- Integration test — domain-event payload assertion no longer false-positives on UUID substrings.

---

## 2. Tables / functions / RLS (WIP `0158_dg_subcontract_core.sql`)

**Extended foundation**

- `subcontract_agreements` — lifecycle CHECK (`suspended`, `closed`) + additive DG SELECT/INSERT/UPDATE policies (`contractor.view` / `contract.manage` / financial caps).
- `subcontract_value_events` — project-capability SELECT + controlled INSERT on change approval.
- `subcontract_work_lines` / `subcontract_work_line_prices` — DG policies (operational vs financial separation).

**New tables**

- `subcontract_agreement_profiles` (operational 1:1)
- `subcontract_agreement_financial_terms` (financial 1:1)
- `subcontract_work_line_attributes` (operational 1:1 per line)
- `subcontract_changes`, `subcontract_change_versions`, `subcontract_change_version_lines`
- `subcontract_work_line_adjustments` (append-only)
- `subcontract_unpriced_work`

**Functions**

- `app.dg_vendor_display_name(org, vendor)` — display name for operational readers / contractor scope.

**Immutability**

- Append-only triggers on change versions, version lines, line adjustments (and decided change headers where specified in SQL).

**RLS**

- All new tables: FORCE RLS, internal `app.has_project_capability`, financial `contract.financial.view` / `change.financial.manage`, external `app.external_has_scope` where applicable, `service_role` ALL policies.

---

## 3. Use-cases, actions, routes, components

### Exported for other tracks (frozen)

- `approvedContractValue`, `revisedLineValue` — pure domain (`domain/value.ts`); used by claims math (Track F).
- `createDraftAgreement` — draft agreement + profile + optional financial terms (Track Q award flow).
- `createChangeFromInstruction` — draft change linked via `entity_links` (Track O site instructions).
- `listRevisedWorkLines`, `loadAgreementValuePosition` — financial read-models for claims.

### Internal capabilities

- Agreement lifecycle, work-line CRUD (baseline lock on activate), financial terms, changes (negotiation versions, approve → `subcontract_value_events`), unpriced work register/convert/reject/cancel.
- RSC pages: lines (workspace + lifecycle + line editor), changes (create + QS/finance actions), unpriced-work (filters + record/convert).

### External (portal)

- `getContractorAgreement`, `listContractorChanges`, `submitContractorChangeProposal`, `counterContractorChange` — scoped by grant; values only with `ext.contract.view_value`; proposals with `ext.change.request`.
- Portal RSC: contract lines + changes with proposal/counter forms.

### Server actions

- `src/modules/subcontracts/ui/actions.ts` — org and external paths, revalidate project/portal routes.

---

## 4. Events, resolvers, audit

**Domain events** (`SUBCONTRACT_DOMAIN_EVENTS`): agreement lifecycle, work line, change lifecycle, unpriced work. Payloads: ids + status/metadata only (no money).

**Entity resolvers:** `subcontract_agreement`, `subcontract_work_line`, `subcontract_change`, `unpriced_work`.

**Audit** (`SUBCONTRACT_AUDIT_ACTIONS`): agreement, line, change, unpriced work verbs (labels in settings activity catalog — 4-locale strings to be wired in settings/i18n pass if missing).

---

## 5. Tests + results

```powershell
$env:PF_WIP_FILES='0158_dg_subcontract_core.sql'
npx vitest run tests/unit/dg-subcontract tests/integration/dg-subcontract
```

**Result (2026-10-03):** 2 files, **21/21 passed** (13 unit + 8 integration).

Coverage highlights: baseline lock + original value event; operational vs financial separation (site manager); full change negotiation + approval value move; RLS on change status; contractor A/B isolation + value cap; contractor proposal; unpriced → change; instruction-origin change + close blocked with open changes; immutability triggers; domain-event payloads without money fields.

---

## 6. REQUESTS TO MAIN AGENT

1. **Navigation (Track S/U):** Wire project tabs / execution nav to `contractors/[agreementId]/lines`, `.../changes`, and `unpriced-work` per route table §2. Track E does not edit `layout.tsx` or tab order files.
2. **Contractor 360 shell (Track S):** Embed lines/changes panels or deep-link from `contractors/[agreementId]` tabs to these routes.
3. **Global FAB (Track U):** Entry to create draft agreement (calls `createDraftAgreement`) with project prefill.
4. **0168 coordination (Track B):** Before applying `0168_dg_financial_projection_rls.sql`, update `findAgreementFinancial` in `src/modules/subcontracts/data/agreements.repository.ts` to SELECT header money from `subcontract_agreement_money_secure` (comment already marks the switch point). Deploy app before column revoke.
5. **Activity labels:** Confirm `settings.activity.actions` includes DG subcontract audit keys from `SUBCONTRACT_AUDIT_ACTIONS` in all four locales (if not already in settings JSON).

---

## 7. Known gaps

*(none — Track E scope complete pending MAIN AGENT nav/0168 deploy coordination above)*
