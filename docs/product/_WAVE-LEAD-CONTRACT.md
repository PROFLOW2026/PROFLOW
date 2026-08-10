# Wave Lead Contract — Project Entry Baseline + Jobs

**Owner:** Lead agent  
**Status:** BINDING for Agents 1–4  
**Migrations:** Lead owns `0019`. Do not edit `0000`–`0018`. Do not invent `0020` without Lead approval.

---

## Architecture decision (LOCKED)

ONE underlying entity: `projects` row.

| Field | Values | Rule |
|-------|--------|------|
| `work_kind` | `project` \| `job` | Default `project`. Jobs reuse the same financial engine. |
| `pricing_mode` | `fixed` \| `open` \| NULL | Jobs: required `fixed` or `open`. Classic projects: NULL (= fixed revenue when contract exists). |

Do **not** create a second financial subsystem, customer DB, or parallel cost tables.

---

## Entry baseline formulas (LOCKED)

User enters (same tax mode as contract):

- `DISPLAY_ORIGINAL` — real-world original contract (context)
- `OPENING_REDUCTION` — optional; already economically behind before ProjectFlow (default 0)

```text
MANAGED_OPENING_NET = DISPLAY_ORIGINAL_NET − OPENING_REDUCTION_NET

PROJECTFLOW CURRENT CONTRACT (net)
  = MANAGED_OPENING_NET
  + approved change_order / adjustment events in managed period

PROFITABILITY REVENUE BASIS = PROJECTFLOW CURRENT CONTRACT (net)
```

### Storage mapping

| Concept | Storage |
|---------|---------|
| Display original (context only) | `contracts.display_original_*` |
| Opening reduction (audit) | `contracts.opening_reduction_*` |
| Managed opening (engine) | existing `contracts.original_*` + `contract_value_events.kind='original'` |
| Current contract | sum of value events (unchanged engine) |

### Forbidden

- No fake payment / billing / expense for the reduction amount
- Display original must **not** enter profitability, billing target, outstanding collection, or forecast margin
- Reduction `0` ⇒ behavior identical to today

### Lock

Existing `isOriginalContractAmountLocked` applies to managed opening + display/reduction once change_order/adjustment events exist. Corrections use explicit adjustment events — no silent rewrite.

---

## Open-price jobs (LOCKED)

- `work_kind=job` + `pricing_mode=open` ⇒ no revenue basis yet (no fake 0 revenue margin)
- Costs / commitments / ETC still accumulate
- UI / reports: communicate price not set (Hebrew: המחיר טרם נקבע)
- `contract_weight` allocation: **exclude** open-price jobs (no invented contract value); use another driver or manual

---

## File ownership (no overlap)

| Agent | Owns | Must not touch |
|-------|------|----------------|
| **1** Entry baseline | `contract-amount*`, contract tax upsert with reduction, project create/edit contract fields, commercial display of original vs managed, Scenario A/B tests, `docs/financial/PROJECT-ENTRY-BASELINE.md` | Jobs nav/list/workspace, allocation drivers, dashboard filters |
| **2** Jobs UX/domain | `createJob` / job list / job workspace shell, pricing mode UX, quick client path, conversion feasibility, Scenario C/D unit/UI tests, job locales | `0019` SQL, core `upsertPrimaryContractAmount` formula ownership (call Agent 1 APIs), org dashboard aggregation |
| **3** Financial parity | Allocation eligibility for jobs, open-price profit gating, dashboard All/Projects/Jobs, reports filters, Scenario E/F tests, `docs/financial/PROJECT-JOB-FINANCIAL-PARITY.md` | Project/job create forms, nav IA |
| **4** Nav / mobile / E2E | Shell nav (`פרויקטים` / `עבודות`), jobs-only / mixed visibility, mobile quick create path, Playwright business flows, Hebrew IA polish | Financial domain math, migration SQL |

**Shared (Lead only after wave):** `drizzle/migrations/0019_*`, `drizzle/schema/projects.ts` / `contracts.ts` kind columns (already landed by Lead). Agents extend application code only unless Lead re-opens schema.

---

## Agent return format

Each agent must return:

1. What shipped  
2. Formulas / rules touched  
3. Files changed  
4. Tests run + result  
5. BLOCKER/HIGH/MEDIUM/LOW self-findings  
6. Open questions for Lead  

NO COMMIT. NO PUSH.

---

## Lead decisions (post Agent 4)

1. **`createJob` → `noteModuleUsage('jobs')`:** Yes — first job creation auto-surfaces the Jobs module for projects-first orgs. Lead/integration wires this in `createJob`.
2. **Onboarding profession → `work_mix`:** Out of this wave. Manual Features / work_mix setting is enough for V1.
3. **Job quick-create visibility:** Show when Jobs nav is visible (`work_mix` ≠ projects-only demotion path, or `jobs` module enabled / noted). Do not always expose Job quick-create on pure projects-first orgs with Jobs hidden.

## Lead decisions (post Agent 2)

1. **Pickers (expenses/procurement):** Default to **all** work kinds (`project` + `job`). Same financial entity — hiding jobs from cost targeting would create invisible units. Optional filter chrome later; not required this wave.
2. **Audit actions:** Keep `project.*` with payload flags (`workKind`, `pricingMode`). No parallel `job.created` vocabulary this wave.
3. **After convertJobToProject:** Set `work_kind=project` and clear `pricing_mode` to `null` (classic project semantics). Fixed revenue remains on the contract/events; do not keep job `pricing_mode=fixed` on the project row.
4. **Job-list cost MEDIUM:** Integration must prefer shared financial compose (Agent 3) for list actual/profit when cheap enough; otherwise document list as expense-net approximation until wired — do not invent a second cost engine.

## Lead decisions (post Agent 1)

1. **Financials “more info” display original:** Yes — when opening reduction exists, add a muted context row for display original (and optionally reduction). KPI math unchanged (managed/current only). Lead/integration or light Agent 1 follow-up; not blocking Agents 2/4.
2. **CRM convert-won-opportunity + reduction:** Out of this wave. Convert keeps reduction `0` / omitted (today’s path). Track as follow-up if sales→project mid-work entry is needed.
3. **Backfill pre-wave contracts:** Keep `display_original_*` / `opening_reduction_*` NULL (= equals managed). No backfill migration.

## Lead decisions (post Agent 3)

1. **Open job → fixed price + `contract_weight`:** Setting a fixed price only affects *future* allocation drafts that recompute eligibility. Already `applied` / superseded runs stay frozen. No forced re-run UX in this wave; optional recompute remains the existing allocation draft flow.
2. **Home dashboard default filter:** Always `all`. Jobs-only chrome is navigation/IA (Agent 4), not a forced dashboard filter default.
3. **Home `?workKind=` chrome:** Agent 4 / Lead integration wires the filter control; Agent 3 API already accepts `workKindFilter`.
