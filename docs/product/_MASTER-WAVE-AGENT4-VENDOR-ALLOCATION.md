# Master Wave — Agent 4: Vendor Bill Multi-Project Allocation

**Agent:** 4 — Subcontractor / Vendor Allocation  
**Status:** COMPLETE (proposal only — no schema applied, no migration edits)  
**Contract:** `docs/product/_MASTER-WAVE-LEAD-CONTRACT.md`  
**Date:** 2026-08-10  

**Forbidden (honored):** commit / push / `db:migrate` / edit migrations / make Vendor Payment create Actual / invent a second Actual engine.

---

## 1. Verdict

Reuse the **existing AP recognition engine** (`vendor-cost-recognition` + `withRecognizedVendorBills`) and the **expense allocation line pattern** (`expense_allocations` resolve → persist resolved `amount` + optional `%` / basis). Add a child table `ap_bill_project_allocations` so one Vendor Bill can land on many projects (and optionally overhead), with **partial / unallocated remainder always visible**.

```text
VENDOR ≠ VENDOR BILL ≠ VENDOR PAYMENT ≠ PROJECT COST ALLOCATION

Bill recognition may create Actual (existing AP rules).
PAYMENT ≠ Actual. Assignment ≠ Actual.
```

Simple mode stays intact: a bill with `ap_bills.project_id` and **zero allocation rows** continues to attribute **100%** of recognized bill total to that project (today’s behavior).

---

## 2. Current state (as-built)

| Artifact | Behavior |
|----------|----------|
| `ap_bills.project_id` | Single nullable FK; financials filter `WHERE project_id = :projectId` |
| Recognition | Statuses `open` / `partially_matched` / `matched` → Actual; `draft` / `void` → excluded |
| Amount recognized | Full `ap_bills.total_amount` (same currency as project base) |
| Expense dedupe | Accepted `ap_po_matches` → expense ids excluded from expense Actual; **bill wins** |
| Payments | `ap_payments` + `ap_payment_applications`; cash / outstanding only; **never Actual** |
| Expense multi-project | `expense_allocations` + optional `allocation_runs` (weights, active days, residue on last line) |

**Gap:** one bill cannot split Actual across projects; null `project_id` bills are invisible to project Actual and are not disclosed as org “unallocated vendor” (unlike finalized overhead expenses).

---

## 3. Product rules (binding for this proposal)

1. **One Actual engine** — continue folding vendor Actual only via `composeVendorCostRecognition` / `withRecognizedVendorBills`. Allocations **slice** the already-recognized bill amount; they do not invent a parallel recognition path.
2. **PAYMENT ≠ Actual** — allocation never reads payment applications; outstanding remains bill-level cash.
3. **Fully allocated invariant** — when the bill is marked fully allocated (or allocation set claims complete):  
   `SUM(allocation.amount) = recognizedEconomicAmount(bill)`  
   (currency match; deterministic residue on last line — same as expenses).
4. **Partial allowed** — `SUM(lines) ≤ recognizedEconomicAmount`; remainder is **Unallocated Vendor Cost** and must surface in UI + org disclosure.
5. **Void** — void bill excludes recognition → allocation rows contribute **0** to project/org Actual (rows may remain for audit).
6. **Optional advanced** — orgs that never open allocation UI keep single-`project_id` bills.

### Recognized economic amount

For V1 (matches current recognition):

```text
recognizedEconomicAmount(bill) =
  isRecognizedVendorBillStatus(bill.status) ? bill.total_amount : 0
```

No FX conversion (same exclusion rules as `loadRecognizedVendorBillsForProject`).  
**Credits / retention** — see §8 (gaps; Lead decides before 0021).

---

## 4. Schema proposal for Lead (`0021` or later AP allocation slice)

Agents must **not** edit migrations. Lead owns final SQL / Drizzle.

### 4.1 Table: `ap_bill_project_allocations`

Mirror `expense_allocations` closely; do **not** reuse that table (different parent lifecycle + recognition).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | FK → organizations CASCADE; composite org FKs preferred |
| `ap_bill_id` | uuid NOT NULL | FK → ap_bills CASCADE |
| `target_type` | text/enum NOT NULL | `'project'` \| `'overhead'` (reuse `allocation_target` enum or AP-local check) |
| `project_id` | uuid NULL | required iff `target_type = 'project'`; NULL for overhead |
| `work_package_id` | uuid NULL | optional; must belong to `project_id` when set |
| `cost_category_id` | uuid NULL | optional labeling |
| `method` | text/enum NOT NULL | see §5 |
| `amount` | money NOT NULL | **always** store resolved amount |
| `currency` | currency NOT NULL | must equal `ap_bills.currency` |
| `percent` | percent NULL | required for `manual_percent`; optional denorm for days/% drivers |
| `basis_days` | numeric(12,4) NULL | active/exposure days when `method = active_days` |
| `basis_value` | numeric(18,6) NULL | optional generic weight (future drivers) |
| `notes` | text NULL | |
| `sort_order` | int NOT NULL DEFAULT 0 | residue lands on highest sort / last id-stable line |
| `created_at` / `updated_at` | timestamptz | |

**Indexes**

- `(ap_bill_id)`, `(project_id)`, `(organization_id)`
- Unique: `(ap_bill_id, project_id)` where `target_type = 'project'` AND `project_id IS NOT NULL`  
  (one line per project per bill — split further via work packages only if Lead allows WP as part of uniqueness later)
- Optional unique partial: at most one overhead line per bill, **or** allow multiple overhead lines that sum (prefer **multiple allowed**, like expenses)

**Checks**

- project target ⇒ `project_id IS NOT NULL`; overhead ⇒ `project_id IS NULL`
- `amount > 0` for V1 project/overhead cost shares (credits handled at bill header — §8)
- `method` in known set
- `manual_percent` ⇒ `percent IS NOT NULL`
- `active_days` ⇒ `basis_days IS NOT NULL AND basis_days > 0`
- currency equal to parent bill (app + ideally trigger)

**Composite FKs (Lead pattern from 0020)**

- `(ap_bill_id, organization_id)` → `ap_bills (id, organization_id)`
- `(project_id, organization_id)` → `projects (id, organization_id)` when project set

### 4.2 Optional bill header columns (asks — not mandatory)

| Column | Purpose |
|--------|---------|
| `allocation_status` | `'none'` \| `'partial'` \| `'full'` — **derived preferred**; persist only if Lead wants query convenience |
| `retention_held_amount` | Deferred AP retention (see §8) — **ask**, do not invent Actual rules |
| `bill_kind` | `'invoice'` \| `'credit'` — if credits enter AP (see §8) |

**Do not add** payment-side project allocation tables.

### 4.3 Interaction with `ap_bills.project_id`

| Mode | `project_id` | Allocation rows | Project Actual attribution |
|------|--------------|-----------------|----------------------------|
| **Simple (default)** | set | none | 100% of recognized bill → that project |
| **Simple null** | null | none | 0 on projects; full amount → **Unallocated Vendor Costs** (new disclosure) |
| **Advanced full/partial** | null **or** primary hint | ≥1 | Only `SUM(lines where project_id = P)`; never also add header `project_id` |
| **Compat backfill** | set | optional Lead one-time: materialize single 100% line | After backfill, rollup uses lines only |

**Anti-double-count rule (domain):**

```text
IF EXISTS allocations for bill THEN
  projectActual(P) += sum(allocation.amount for project P on recognized bills)
  DO NOT also add bill.total via header project_id
ELSE
  projectActual(header.project_id) += bill.total   -- current path
```

Recommend Lead keep `project_id` as:

1. **Create UX default / PO inherit** (already in `createApBill`), and  
2. **Display “home project”**,  

not as a second recognition key once lines exist.

**Suggested app constraint:** if any allocation row targets a project, either clear header `project_id` on save **or** require header `project_id` ∈ allocation project set (display only). Prefer **clear-or-ignore** in rollup code to avoid silent double count.

### 4.4 Dedupe with expense links

Keep existing invariant: **bill wins**.

```text
For each recognized bill:
  linked finalized expenses (accepted ap_po_matches) → exclude full expense Actual
  vendor Actual comes from bill recognition sliced by allocations (or header project)
```

**Multi-project nuance:** expense may itself have `expense_allocations` across projects. Dedupe today excludes the **entire expense id** from expense aggregation, then adds **full bill** on the bill’s project. Under multi-project bills:

- Continue excluding the **entire linked expense** from expense Actual (do not invent partial expense-vs-bill netting by project in V1).
- Distribute **only the bill** via `ap_bill_project_allocations`.
- Document limitation: if a linked expense was split 60/40 across A/B but the bill allocates 50/50, project A/B Actual follows the **bill** split after full expense exclusion — possible local mismatch vs pre-link expense view. Acceptable V1; optional later: match-level `matched_amount` project hints (**schema ask**).

**Do not** create expense rows from bill allocation.  
**Do not** write into `expense_allocations` from AP.

---

## 5. Allocation methods

Align naming with expense where possible; keep AP set small for V1.

| Method | Input | Resolve |
|--------|-------|---------|
| `manual_amount` | fixed `amount` | use entered amount |
| `manual_percent` | `percent` of `recognizedEconomicAmount` | `percentOfMoney`; residue on last line when set claims full |
| `active_days` | `basis_days` per project (user or calendar overlap helper) | weight ∝ days; same residue rule as `allocateByProjectWeights` |
| `equal_split` | N projects | weight 1 each (or active days if period supplied) |

**Out of scope for V1 vendor bills (reuse later):** `contract_weight`, `labor_hours_weight`, `direct_cost_weight`, periodic `allocation_runs` slices. Architecture: store `method` + `basis_*` so Lead can extend without a second engine.

**Domain helpers (proposed package location):**  
`src/modules/ap/domain/bill-project-allocation.ts` — resolve/validate sum; **call into money helpers**, optionally share pure residue helpers with expenses **without** merging tables.

---

## 6. Financial integration (existing AP)

### 6.1 Recognition (unchanged formula)

```text
netRecognizedVendorActual = sum(recognized bill amounts)   // payments ignored
```

Change **distribution**, not recognition:

- `loadRecognizedVendorBillsForProject` today: filter header `project_id`.
- **After:**  
  - Bills with **no** allocation rows → keep header filter.  
  - Bills with rows → sum allocation amounts for that `project_id` (recognized statuses only).  
  - Batch org loaders (`loadRecognizedVendorBillsForProjects`) same rule.

### 6.2 Org disclosure (new, mirrors expenses)

```text
Unallocated Vendor Costs =
  Σ recognizedEconomicAmount(bill) − Σ allocation.amount(bill)
  for recognized, base-currency bills
  + recognized bills with null project_id and zero lines
```

Surface alongside **Unallocated Business Costs** (expenses). Org reconciliation extension (Lead/Agent 3 ownership to wire):

```text
PROJECT VENDOR ACTUAL (from allocations + simple header)
+ UNALLOCATED VENDOR COSTS
= ORGANIZATION RECOGNIZED VENDOR BILL TOTAL
```

### 6.3 Open AP / payables

- Outstanding stays **bill-level** (`total − applications`).
- Project AP payable disclosure today filters `bill.projectId`.  
  **Ask Lead:** for multi-project bills, either  
  - (A) keep payable on header/`null` only (cash not project cost), or  
  - (B) prorate open payable by allocation % for **disclosure only** (still not Actual).  
  Recommend **(A)** for V1 — cash ≠ cost allocation.

### 6.4 Commitment / PO

- PO consume/release rules unchanged (`consumeAmountForPostedPoBill`, match accept).
- Multi-project bill linked to one PO: commitment still on PO’s project; Actual may split across projects.  
  **MEDIUM:** document that commitment project and Actual split can diverge — acceptable when one PO funds multi-project subcontract; optional future PO-line project tags.

---

## 7. Lifecycle / UX (schema-agnostic)

| Event | Allocation behavior |
|-------|---------------------|
| Create draft bill | Lines optional; no Actual |
| Post → `open` | Recognition begins; existing lines apply; partial remainder visible |
| Edit allocations on open bill | Allowed with audit log; re-validate `SUM ≤ recognized`; replace set preferred over silent row edits |
| Full allocate | `SUM = recognized`; status derived `full` |
| Void bill | Actual → 0; keep rows for history |
| Record payment | No allocation change; Actual unchanged |
| Void payment | Cash only |
| Accept expense match | Dedupe expense; bill allocations unchanged |

**Simple mode:** hide advanced allocation; single project field writes `ap_bills.project_id` only.

---

## 8. Audit: partials / credits / void / retention / split

| Topic | Current | Proposal | Severity if ignored |
|-------|---------|----------|---------------------|
| **Partial allocation** | N/A | Explicit remainder; UI + org unallocated vendor | HIGH product gap if hidden |
| **Partial payment** | Supported; ≠ Actual | Unchanged; never drives allocation | — |
| **Partial PO match** | `partially_matched` still fully recognizes bill total | Unchanged; allocation of **full bill**, not matched subset | Document clearly |
| **Split across projects** | Impossible | `ap_bill_project_allocations` | Core task |
| **Void bill** | Excluded from Actual | Allocations ignored when status void | Must wire in loaders |
| **Void payment** | Cash only | No allocation impact | — |
| **Credits** | No AP bill credit kind; totals assumed positive | **Lead ask:** `bill_kind=credit` + negative recognition **or** separate credit bill linking `credits_bill_id`, allocated with negative amounts / reversing lines | **HIGH** if subcontractors issue credit notes in-wave |
| **Retention / holdback** | AR billing has `retention_release`; AP has none | **Lead ask:** optional `retention_held_amount` on bill; Actual = `total − retention_held` **or** recognize full and hold cash only — **do not** invent new Actual engine; pick one rule | **MEDIUM** (common in subcontracting; can defer with disclosure) |
| **Expense link dedupe + split** | Full expense exclude + full bill on one project | Full expense exclude + bill split via allocations | **MEDIUM** local skew (§4.4) |
| **Header + lines double count** | N/A | Rollup must ignore header when lines exist | **BLOCKER** if implemented wrong |
| **Payment as Actual** | Forbidden | Remains forbidden | Contract |

---

## 9. Suggested domain API (no migration required to sketch)

```ts
// Pure — proposed
resolveBillAllocationLines(recognizedAmount, lines) → ResolvedLine[]
validateBillAllocationSum(recognizedAmount, lines, { mode: 'partial' | 'full' })
billAllocationRemainder(recognizedAmount, lines) → MoneyValue
effectiveVendorActualForProject(bill, projectId) → MoneyValue
  // lines ? sum(lines→project) : (bill.projectId === projectId ? total : 0)
assertVendorPaymentDoesNotAffectActual() // existing
```

Loaders (`committed-costs.repository`) become the integration seam — **extend**, do not fork recognition.

---

## 10. Tests (proposed; not run this agent)

- Unit: resolve % / amount / active_days; residue; partial remainder; void → 0; payment unchanged Actual.
- Unit: header-only vs lines-only anti-double-count.
- Unit: expense link dedupe + multi-project bill (full expense excluded once).
- Integration: create bill → allocate A/B → project financials A/B + org unallocated.
- Regression: simple `project_id` bill without lines unchanged.

**Tests run this delivery:** none (docs-only agent).

---

## 11. Files

| Path | Action |
|------|--------|
| `docs/product/_MASTER-WAVE-AGENT4-VENDOR-ALLOCATION.md` | **Written** (this file) |
| `drizzle/schema/ap.ts` / migrations | **Lead only** — not edited |
| `src/modules/ap/domain/vendor-cost-recognition.ts` | Unchanged formula; callers change inputs |
| `src/modules/financials/data/committed-costs.repository.ts` | Future: allocation-aware load |
| `src/modules/ap/domain/bill-project-allocation.ts` | Future domain (optional stub later) |

---

## 12. Schema asks for Lead (tables / columns only)

1. **Add** `ap_bill_project_allocations` as in §4.1 (required for feature).
2. **Keep** `ap_bills.project_id` for simple mode; document rollup precedence (§4.3).
3. **Decide:** persist `allocation_status` on `ap_bills` vs derive only.
4. **Decide credits:** `bill_kind` / negative totals / `credits_ap_bill_id` — required if credit notes in scope.
5. **Decide retention:** `retention_held_amount` (and whether Actual uses net-of-retention).
6. **Decide payable disclosure:** header-only vs prorated by allocation (recommend header-only).
7. **Optional:** `ap_po_matches.allocation_hint_project_id` — defer.
8. **Do not** add project FKs on `ap_payments` / applications for cost.
9. **Do not** create a second recognition table or payment→Actual bridge.
10. **Org KPI:** unallocated vendor cost field next to expense unallocated (financials wiring after schema).

---

## 13. STATUS + findings

```text
STATUS = COMPLETE

Proposal / files
  docs/product/_MASTER-WAVE-AGENT4-VENDOR-ALLOCATION.md

Schema asks for Lead
  ap_bill_project_allocations (+ optional ap_bills.allocation_status,
  bill_kind, retention_held_amount) — see §12

Tests run
  none (proposal-only)

BLOCKER
  • Rollup MUST NOT count both ap_bills.project_id and allocation lines
    for the same bill (double Actual). Encode precedence in loaders
    before shipping UI.

HIGH
  • Partial/unallocated remainder must be first-class (UI + org disclosure);
    otherwise multi-project splits silently understate org vendor cost.
  • AP vendor credit notes are unspecified; without a Lead rule, credit
    allocations cannot be modeled safely (positive-only checks would block).
  • Linked expense dedupe remains whole-expense; document skew when expense
    split ≠ bill split (or schedule match-level follow-up).

MEDIUM
  • Subcontract retention/holdback not in AP; common commercially — decide
    defer vs header column before promising true subcontract costing.
  • PO commitment project may diverge from multi-project Actual split.
  • Project AP payable currently header-scoped; clarify disclosure rules
    for multi-project bills (recommend keep cash at bill header).
  • active_days calendar helper may share expense eligibility code — keep
    tables separate; share pure day-count only.
```

---

## 14. Explicit non-goals

- Vendor Payment creating or modifying Actual  
- Merging Vendor Bill into Expense  
- Replacing `vendor-cost-recognition` with a new engine  
- Editing `0000`–`0020` or unapplied `0021` SQL in this agent  
- Forcing advanced allocation fields in simple/mobile capture (Agent 5)  
