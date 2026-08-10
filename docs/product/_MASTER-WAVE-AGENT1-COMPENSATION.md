# Master Wave — Agent 1: Employee Master + Compensation History

**Agent:** 1 — Compensation  
**Status:** COMPLETE (proposal only; no migration SQL authored)  
**Date:** 2026-08-10  
**Contract:** `_MASTER-WAVE-LEAD-CONTRACT.md`  
**Scope:** BUSINESS COST (employer cost) — not payroll net, not Israeli statutory payroll.

---

## 1. Verdict

**Extend `rate_versions` (+ keep `labor_cost_components`) as the compensation history spine.**  
Do **not** invent a parallel day-ranged compensation table that would fork truth from Mode C time costing.

**Add one optional month-grain table** for estimated/actual employer cost facts per calendar month. That table is the immutability surface for “historical months”; Agent 3 consumes it for monthly true-cost and **must not** double-count Mode C time Actual (see Labor Cost Integrity).

Simple mode stays intact: no employees / no rates / no month facts ⇒ no advanced cost behavior required.

---

## 2. Audit of existing model

### 2.1 What already exists (reuse)

| Artifact | Role today |
|----------|------------|
| `employees` | Employee master (identity/contact/status; optional `user_id`) |
| `rate_versions` | Effective-dated unit cost card: `base_rate`, `rate_unit` (hourly/daily/monthly), `burden_percent`, `valid_from`/`valid_to`, `corrects_rate_version_id` |
| `labor_cost_components` | Optional amount/% components hanging off a rate version |
| `time_entries` | Snapshots `rate_version_id` + `cost_amount` / `cost_currency` at entry |
| `0005` overlap trigger | Non-overlapping `daterange` per employee |
| Domain `calculateLaborCost` | base × units + burden% on base + components (docs 06 / E1) |
| Mode B vs C integrity | `LABOR-COST-INTEGRITY.md` — time True Cost wins over `labor` expense category when workforce data exists |

### 2.2 Gaps vs required compensation concepts

| Required concept | Today | Gap |
|------------------|-------|-----|
| Employment basis monthly/hourly/daily | `rate_unit` on version only | No employee-level default; naming is “rate” not “employment basis” |
| effective_from/to | `valid_from` / `valid_to` | Rename in product language only; keep columns |
| gross/base | `base_rate` | Semantically employer-facing base — document as gross/base business cost, **not** net salary |
| estimated employer cost | Derived at read/calc time | No first-class stored estimate amount |
| actual employer cost when available | Missing | Needs month-grain fact (not day-open version) |
| optional components | `labor_cost_components` | Keep; optional |
| source | Missing | Need enum |
| estimated vs actual | Missing | Need quality/status |
| historical months immutable | Partial | Overlap protected; money fields still UPDATE-able; `corrects_rate_version_id` unused by app create path |
| corrections via new versions/adjustments | Intended (E3) + column exists | App closes open version by mutating `valid_to` only; no correction workflow wiring |

### 2.3 Explicit non-goals (FORBIDDEN)

- Israeli payroll / net salary / statutory deduction engines  
- Magic default loaders (including any ×1.25 or similar) — burden stays **user-entered or absent**  
- Inventing Actual from compensation alone (ASSIGNMENT ≠ Actual; PAYMENT ≠ Actual; compensation terms ≠ Actual)  
- Replacing Mode C time snapshot path

---

## 3. Concept separation (locked)

```text
EMPLOYEE MASTER          → who (employees)
COMPENSATION HISTORY     → what terms were in force (rate_versions + components)
MONTHLY EMPLOYER COST    → calendar-month estimated/actual business cost facts (new optional table)
TIME ENTRY               → hours + cost snapshot from rate version (Mode C Actual path)
PROJECT ASSIGNMENT       → Agent 2 (≠ cost)
COST ALLOCATION          → Agent 4 / existing allocation (≠ this proposal)
```

Product language: **CompensationVersion** = existing `rate_versions` row. Physical table name stays for FK stability with `time_entries`.

---

## 4. Recommendation: extend vs new tables

### 4.1 Decision

| Approach | Choice | Why |
|----------|--------|-----|
| New parallel `compensation_versions` day-ranged table | **Reject** | Dual source of truth with `time_entries.rate_version_id`; drift risk |
| Extend `rate_versions` | **Accept** | Already effective-dated, overlap-safe, correction FK, component child, Mode C wired |
| Keep `labor_cost_components` | **Accept** | Optional detailed employer-cost parts |
| New `employee_employer_cost_months` | **Accept (optional advanced)** | Month immutability + actual employer cost when known; Agent 3 integration surface |
| Heavy employee payroll columns | **Reject** | Out of scope |

### 4.2 How the two layers work together

1. **CompensationVersion (`rate_versions`)** — continuous day ranges: employment/costing basis, gross/base per unit, optional burden %, optional components, optional stored **estimated** loaded unit/period cost, source, quality=`estimated` (or `mixed` only if Lead allows hybrid UX). Drives Mode C when time is logged.
2. **EmployerCostMonth (`employee_employer_cost_months`)** — one row per employee × calendar month (when advanced mode used): estimated and/or actual **employer** cost for that month. Closed/actual rows are immutable; corrections = new adjustment row, not silent rewrite.
3. **Time entries** continue to snapshot from the CompensationVersion in force on `work_date`. Month facts do **not** rewrite snapshots.

Agent 3 owns whether/how month facts participate in org/project Actual. Agent 1 invariant: **creating or storing compensation / month facts must not itself create Actual.**

---

## 5. Column lists (schema asks for Lead)

### 5.1 `employees` — optional master fields (0021 candidate)

Additive only; all nullable / default-safe for simple mode.

| Column | Type | Notes |
|--------|------|-------|
| `employment_basis` | `rate_unit` enum null | Optional default basis (hourly/daily/monthly). Does not replace version history. |
| `hire_date` | date null | Optional; UX/reporting only |
| `end_date` | date null | Optional; inactive/end of engagement hint |

**Stays out of 0021 unless Lead wants polish:** documents, statutory IDs, bank details, net salary.

### 5.2 `rate_versions` — extend (CompensationVersion)

Keep existing columns; add:

| Column | Type | Required? | Meaning |
|--------|------|-----------|---------|
| `estimated_employer_cost` | money null | Optional | Stored estimated **employer** cost for one unit of `rate_unit` (hourly/daily/monthly). If null, estimate = compute from `base_rate` + `burden_percent` + components (current behavior). |
| `source` | enum not null default `manual` | Defaulted | `manual` \| `import` \| `adjustment` \| `system_derived` |
| `cost_quality` | enum not null default `estimated` | Defaulted | On versions: **`estimated` only** in V1 (actual lives on month facts). Reserve `actual` on versions = **out of V1** to avoid ambiguity. |
| `locked_at` | timestamptz null | Optional | Set when version is closed (`valid_to` not null) or explicitly locked; domain forbids money-field UPDATE when set |

**Semantic mapping of existing columns (no rename required):**

| Existing column | Compensation meaning |
|-----------------|----------------------|
| `rate_unit` | Employment / costing basis |
| `base_rate` | Gross/base **business** cost for one unit (not net pay) |
| `burden_percent` | User-supplied estimated employer load % on base (nullable; **no default magic**) |
| `valid_from` / `valid_to` | effective_from / effective_to |
| `corrects_rate_version_id` | Points at superseded mistaken version when this row is a correction |
| `currency` | Employer-cost currency |

### 5.3 `labor_cost_components` — keep as-is (optional)

No required 0021 change. Optional later:

| Column | Notes |
|--------|-------|
| `source` | Optional mirror of parent source |
| `include_in_estimated_employer_cost` | Only if Lead wants selective rollup; default include-all is fine |

### 5.4 NEW optional `employee_employer_cost_months`

Month-grain employer cost facts. **Does not create Actual by existing.**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `organization_id` | uuid not null | Tenant |
| `employee_id` | uuid not null | |
| `month` | date not null | First day of calendar month (`YYYY-MM-01`) |
| `currency` | char(3) not null | |
| `gross_base` | money null | Optional month gross/base employer-facing amount |
| `estimated_employer_cost` | money null | Estimated total employer cost for the month |
| `actual_employer_cost` | money null | When known (bank/payroll export/manual actual) — **employer cost, not net** |
| `cost_quality` | enum not null | `estimated` \| `actual` |
| `source` | enum not null | same source enum |
| `rate_version_id` | uuid null | Which CompensationVersion informed the estimate (optional) |
| `adjusts_month_id` | uuid null | Self-FK: correction/adjustment of a prior month row |
| `notes` | text null | |
| `locked_at` | timestamptz null | Required when `cost_quality = actual` (or status closed) |
| `created_at` / `updated_at` | timestamps | `updated_at` may move only while unlocked |

**Constraints (asks):**

- UNIQUE (`organization_id`, `employee_id`, `month`) **where `adjusts_month_id` is null** (one primary fact per month); adjustments are extra rows linked via `adjusts_month_id`
- CHECK: if `cost_quality = actual` then `actual_employer_cost` is not null and `locked_at` is not null  
- CHECK: money fields ≥ 0  
- Composite org tenancy FKs consistent with Lead patterns  
- RLS like other workforce tables  

### 5.5 Enums to add (Lead)

```text
compensation_source: manual | import | adjustment | system_derived
employer_cost_quality: estimated | actual
```

Reuse existing `rate_unit` for employment basis (do not invent a second enum).

---

## 6. Invariants

1. **Optional module:** Zero rows in rates/components/months ⇒ product still works (Mode A/B).  
2. **No silent rewrite:** Closed CompensationVersions (`valid_to` set and/or `locked_at` set) cannot change `base_rate`, `rate_unit`, `currency`, `burden_percent`, `estimated_employer_cost`, or components in place.  
3. **Corrections:** New CompensationVersion with `corrects_rate_version_id` set, and/or new month row with `adjusts_month_id` — never mutate locked money meaning. Closing an open version by setting `valid_to` (existing app behavior) remains allowed as range hygiene, not a money rewrite.  
4. **Overlap:** Keep `0005` `rate_versions_no_overlap` trigger.  
5. **Time snapshot integrity:** Existing time entries keep their `rate_version_id` / `cost_amount`; rate changes do not recalculate history by default (E3).  
6. **Estimated vs actual:** Version layer = estimated parameters. Actual employer cost lives on month facts when available.  
7. **No payroll net:** Columns store employer/business cost only. UI/docs must not label as “net salary.”  
8. **No magic burden:** `burden_percent` null means no burden; never auto-fill ×1.25 or country defaults in V1.  
9. **No Actual invention:** Inserting compensation or month facts ≠ project/org Actual. Mode C Actual remains time-entry path; Mode B remains labor expense path; Agent 3 must not add a third labor Actual without an exclusion rule.  
10. **Month immutability:** When `cost_quality = actual` (locked), forbid UPDATE of money fields; corrections append adjustment rows.  
11. **Currency:** Month fact currency should match org base or be explicit; do not silently FX in V1.  
12. **Components currency:** Existing check constraint remains.

---

## 7. What Lead should put in `0021` vs later

### 7.1 Recommended in redesigned `0021` (if wave ships compensation)

1. Enums: `compensation_source`, `employer_cost_quality`  
2. `ALTER employees` add nullable `employment_basis`, optional `hire_date` / `end_date`  
3. `ALTER rate_versions` add `estimated_employer_cost`, `source` (default `manual`), `cost_quality` (default `estimated`), `locked_at`  
4. Backfill: existing rate rows → `source = manual`, `cost_quality = estimated`, `estimated_employer_cost = NULL` (compute-on-read preserves current meaning)  
5. CREATE `employee_employer_cost_months` + indexes + RLS + uniqueness as above  
6. **Do not** change `time_entries` cost columns or Mode C formula in 0021  
7. **Do not** seed default burden percents  

### 7.2 Explicitly optional / deferrable

| Item | Defer if |
|------|----------|
| `hire_date` / `end_date` | Want minimal 0021 |
| `locked_at` on rate_versions | Enforce lock only in application first |
| `employee_employer_cost_months` | Agent 3 proposes a different month-fact shape — Lead merges once |
| Component-level source flags | YAGNI |
| App correction UX wiring `corrects_rate_version_id` | Can land after schema |
| DB trigger forbidding UPDATE of locked money | Prefer after domain tests; app guard first |

### 7.3 Must not land in Agent 1 hands

- Any `drizzle/migrations/*.sql` edits (Lead-only)  
- Actual aggregation formula changes  
- Payroll connectors  

---

## 8. Migration of existing `rate_versions` meaning

| Before (product meaning) | After |
|--------------------------|--------|
| Unit cost card for Mode C | Same + formally **CompensationVersion** |
| `base_rate` | Gross/base employer-facing unit cost |
| `rate_unit` | Employment/costing basis |
| `burden_percent` | Estimated load % only |
| Loaded cost | Still computed for time; optional cache in `estimated_employer_cost` later |
| Historical integrity | Strengthened with lock + month facts; existing snapshots unchanged |

**Compatibility:** All current rows remain valid Mode C inputs. Null new columns = today’s behavior. No data rewrite of `base_rate` / snapshots.

**Read path for estimate (unchanged when column null):**

```text
estimated_unit_employer_cost =
  base_rate
  + base_rate × (burden_percent/100)   // if burden present
  + Σ components                       // amount or % of base
```

For monthly basis, one unit = one month of that version’s base (not a payroll month engine). Mode C hour conversion continues to use domain constants (`STANDARD_HOURS_PER_DAY` / `STANDARD_HOURS_PER_MONTH`) **only** to allocate logged hours against unit rates — not as statutory payroll assumptions and not as a burden multiplier.

---

## 9. Employee master vs compensation (UX/domain)

- Creating an employee **without** rate/compensation remains valid (simple / Mode A–B friendly).  
- Creating employee **with** optional initial rate (current create-employee flow) creates the first CompensationVersion — advanced Mode C opt-in.  
- `employment_basis` on employee is a convenience default for “add next rate,” not historical truth.  
- Rate history UI already lists versions; extend labels to “Compensation / employer cost” language carefully (he-IL + en).  

---

## 10. Coordination notes for other agents

| Agent | Note |
|-------|------|
| 2 Assignments | Must not read compensation as assignment; assignment ≠ Actual |
| 3 Monthly true-cost | Own Actual inclusion rules; prefer consuming `employee_employer_cost_months` + existing Mode C exclusion doc; **no double labor Actual** |
| 4 Vendor allocation | Unrelated; do not mix employee compensation into vendor payment Actual |
| 5 Mobile UX | Advanced compensation fields optional / progressive disclosure |
| 7 Perf | Month facts should be keyed `(org, employee, month)`; avoid N+1 on employee list |

---

## 11. Tests (not run this agent — schema not applied)

Suggested Lead/Agent follow-ups after 0021 exists:

- Overlap trigger still rejects overlapping CompensationVersions  
- Locked version money UPDATE rejected  
- Month actual row immutability + adjustment row allowed  
- Time entry snapshot unchanged when new version added  
- Null `estimated_employer_cost` ⇒ calculateLaborCost parity with today  
- No default burden inserted on migrate  

**Tests run this delivery:** none (proposal + domain types only).

---

## 12. Schema asks (summary for Lead)

1. Confirm **extend `rate_versions`** (not new day-ranged compensation table).  
2. Add enums `compensation_source`, `employer_cost_quality`.  
3. ALTER `rate_versions`: `estimated_employer_cost`, `source`, `cost_quality`, `locked_at`.  
4. ALTER `employees`: optional `employment_basis` (+ optional hire/end dates).  
5. CREATE optional `employee_employer_cost_months` (columns in §5.4) — merge with Agent 3 naming if they propose an equivalent.  
6. Keep `labor_cost_components` and `0005` trigger.  
7. Backfill defaults only (`manual` / `estimated`); do not invent amounts or burden.  
8. Wire app later: set `corrects_rate_version_id` on correction creates; lock closed versions.

---

## 13. Findings

### BLOCKER

- None for this proposal delivery.  
- **Lead integration risk (treat as wave BLOCKER if ignored):** Agent 3 must not create a second labor Actual from month employer-cost facts on projects that already recognize Mode C time Actual — extend `LABOR-COST-INTEGRITY.md` when month facts are recognized.

### HIGH

1. **Immutability gap:** DB allows UPDATE of historical `base_rate` / burden; `corrects_rate_version_id` unused in `createRateVersion`. 0021 + app should lock closed versions and use correction linkage (E3).  
2. **Actual double-count surface:** Month `actual_employer_cost` is valuable for business cost reporting but dangerous if naïvely summed into project Actual alongside time snapshots.  

### MEDIUM

1. Employment basis only on versions today — optional employee default improves UX.  
2. No `source` / estimated-vs-actual vocabulary — blocks clean import/adjustment audit.  
3. `STANDARD_HOURS_PER_MONTH = 160` is a Mode C conversion assumption; document clearly so it is never mistaken for payroll or a burden multiplier.  
4. Component rows cascade-delete with version — acceptable; corrections should clone components onto the correcting version.

---

## 14. Delivery checklist

| Item | Result |
|------|--------|
| Audit existing model | Done |
| Design compensation history (employer cost) | Done |
| Proposal path | `docs/product/_MASTER-WAVE-AGENT1-COMPENSATION.md` |
| Optional domain TS | `src/modules/workforce/domain/compensation.ts` |
| Migration SQL | **Not authored** (Lead / 0021) |
| Commit / push / db:migrate | **Not done** |
