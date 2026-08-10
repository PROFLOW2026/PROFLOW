# Master Wave — Reviewer 1: Financial / Data Integrity

**Reviewer:** 1 — Financial / Data Integrity  
**Date:** 2026-08-10  
**Scope:** Lead contract + skeleton + Agents 1/2/3/4/6 proposals vs redesigned  
`drizzle/migrations/0021_workforce_contacts_and_allocations.sql` (UNAPPLIED)  
**Forbidden observed:** no commit / push / `db:migrate` / migration edits  

```text
STATUS = COMPLETE
Verdict = DO NOT APPLY 0021 until listed BLOCKERs are closed (or explicitly deferred with app gates)
Migration SQL edits = none (report only)
```

---

## 1. Executive verdict

Redesigned 0021 correctly **fixes the contact composite `ON DELETE SET NULL` BLOCKER**, introduces the right concept tables (assignments, month costs, labor runs/lines, AP bill allocations), and keeps **Payment ≠ Actual** / **Assignment ≠ Actual** at the schema surface.

It does **not** yet encode enough of the Displacement / conservation / immutability contracts to make monthly labor or multi-project vendor Actual safe. Several invariants live only in agent prose; SQL either under-enforces them or blocks the correction path Agents 1/3 require.

**Apply risk if ignored:** silent labor double-count (time + monthly), silent vendor header+lines double-count, mutable “applied” Actual snapshots, and no durable historical salary correction rows.

---

## 2. What was audited

| Surface | Sources |
|---------|---------|
| Binding product rules | `_MASTER-WAVE-LEAD-CONTRACT.md`, `_MASTER-WAVE-LEAD-SKELETON.md` |
| Agent proposals | Agents 1, 2, 3, 4, 6 |
| SQL under review | `0021_workforce_contacts_and_allocations.sql` |
| Existing integrity baselines | `LABOR-COST-INTEGRITY.md` (Mode B vs C only), `0018_allocation_run_integrity.sql`, AP payment guards, `loadRecognizedVendorBillsForProject` (header `project_id` only) |

**Out of this review:** Agent 5 UX, Agent 7 perf, Hebrew report, Full Gate execution.

---

## 3. Findings by theme

### 3.1 Employee cost double-counting (time vs monthly)

| Severity | Finding |
|----------|---------|
| **BLOCKER** | Displacement is **not enforceable in SQL**. `employee_month_costs.recognition_source` defaults to `time_snapshot` and is independent of `status` / applied runs. Nothing prevents `status = 'applied'\|'closed'` while `recognition_source` stays `time_snapshot`, or the reverse. Financials that key off one field while loaders still `SUM(time_entries.cost_amount)` will double-count. |
| **BLOCKER** | No sync trigger on `labor_allocation_runs` apply that sets month `recognition_source = 'monthly_allocated'` (and ideally `status` toward applied/closed). Skeleton rule “applied/closed → MONTHLY_ALLOCATED lines ONLY” is documentation-only. |
| **HIGH** | `LABOR-COST-INTEGRITY.md` still only covers Mode B vs Mode C. Monthly displacement is a third recognition regime and is **not** documented or coded. Shipping UI for month apply before extending integrity + `aggregateProjectCosts` is a wave BLOCKER in practice. |
| **MEDIUM** | Creating `employee_month_costs` / compensation rows correctly does **not** create Actual by itself (good). Risk is only at recognition wiring — keep that gate explicit in domain before any apply path ships. |

**Required Lead direction (app + SQL):**

```text
employee-month Actual source =
  IF applied/closed month with applied labor run → Σ labor_allocation_run_lines only
  ELSE → Σ time_entries.cost_amount (Mode C)
NEVER both for the same (employee, calendar_month)
```

Encode at least: CHECK or trigger coupling `(status IN ('applied','closed')) ⇒ recognition_source = 'monthly_allocated'`, and apply path must flip both atomically with the run.

---

### 3.2 Displacement invariant correctness in SQL / triggers

| Severity | Finding |
|----------|---------|
| **BLOCKER** | Conservation trigger checks only  
`allocated_amount + unallocated_amount = known_amount`  
when run `status = 'applied'`. It does **not** verify `Σ labor_allocation_run_lines.amount = allocated_amount`. Header can conserve while lines under/over-state project Actual. |
| **HIGH** | No immutability guards analogous to `0018_allocation_run_integrity.sql`. Applied/superseded labor runs and their lines can be UPDATED/DELETED (direct or via month CASCADE). Expense engine already treats applied snapshots as immutable; labor must match or Actual becomes mutable history. |
| **HIGH** | Only one **applied** run per month (`labor_allocation_runs_one_applied_per_month_uq`). Missing **one active (`draft`\|`applied`) per month** (0018 pattern). Concurrent drafts / race-to-apply are allowed. |
| **HIGH** | No unique `(labor_allocation_run_id, project_id)` on lines → duplicate project lines on one run → double project Actual if loaders sum naïvely. |
| **HIGH** | Mid-month apply ambiguity (Agent 3 HIGH) is unresolved: post-apply time in the same month can still snapshot `cost_amount` with no DB rule excluding it from Actual. Lead must pick: forbid apply before month-end, or exclude all employee time in that `year_month` once applied (recommended). |
| **MEDIUM** | Conservation re-reads **live** `employee_month_costs.known_amount` (no `source_amount` snapshot on the run). Changing `known_amount` after apply desyncs conservation without rewriting the run. Prefer snapshot `source_amount` at apply (Agent 3) + immutability. |
| **MEDIUM** | `closed` exists on month but not on runs; no CHECK that `closed` requires an applied run + `locked_at`. |
| **MEDIUM** | `supersedes_run_id` has no self-FK; audit chain is soft. |

**No critical SQL typo found** in the conservation function body; the failure is **incomplete invariant coverage**, not a syntax/logic typo in the equality check. (`numeric` `<>` is acceptable for `numeric(18,6)`.)

---

### 3.3 Vendor bill allocation vs header `project_id` double-count

| Severity | Finding |
|----------|---------|
| **BLOCKER (integration)** | Schema adds `ap_bill_project_allocations` but **does not** encode rollup precedence. Current loader `loadRecognizedVendorBillsForProject` still attributes **100% of bill total via `ap_bills.project_id`**. If allocation UI ships first, header+lines double Actual is guaranteed. |
| **HIGH** | No conservation / cap trigger: `SUM(allocation.amount) ≤ recognizedEconomicAmount(bill)` (and currency match). Partial remainder is not stored; must be derived — fine only if org disclosure is mandatory in the same change set. |
| **HIGH** | `amount > 0` only — credit notes / negative allocations cannot be modeled (Agent 4 HIGH). Acceptable deferral only if credits are explicitly out of wave. |
| **MEDIUM** | Overhead lines allowed (`target_type = 'overhead'`); org unallocated formula must include overhead vs true remainder consistently (overhead ≠ silent dump onto a project — OK if disclosed). |
| **OK** | Target shape CHECK (`project` ⇒ `project_id` NOT NULL; overhead ⇒ NULL) is correct. Partial unique per `(bill, project)` for project targets is correct. |

**Binding rollup (must land with feature):**

```text
IF EXISTS allocations FOR bill THEN
  projectActual += Σ line.amount FOR project   -- never also header
ELSE
  projectActual += bill.total WHERE header.project_id = project
```

---

### 3.4 Vendor payment separation

| Severity | Finding |
|----------|---------|
| **OK** | 0021 does not touch `ap_payments` / applications; no payment→project cost bridge. Aligns with contract **PAYMENT ≠ Actual**. |
| **OK** | Existing domain guards (`assertVendorPaymentDoesNotAffectActual`, payables copy) remain the enforcement layer — keep them. |
| **MEDIUM** | Project AP payable disclosure still header-scoped today; multi-project bills need Lead rule (Agent 4 recommends keep cash at bill header). Not Actual corruption, but reporting skew if ignored. |

---

### 3.5 Unallocated visibility

| Severity | Finding |
|----------|---------|
| **HIGH** | Labor: `unallocated_amount` is first-class on the run (**good**), but only validated at apply. Draft worksheets can show inconsistent conservation; UI must not treat draft unallocated as recognized Actual (Agent 3: draft still TIME_SNAPSHOT). |
| **HIGH** | Vendor: no persisted remainder column. Skeleton requires **VISIBLE_UNALLOCATED**. Without org financial disclosure in the same release as allocations, partial splits silently understate org vendor cost (Agent 4). |
| **OK (design)** | Labor lines are project-only; residual on run header matches expense-run preference and prevents “null project line” ambiguity. |
| **MEDIUM** | Assignment fallback must never auto-dump 100% onto a home project when bases are empty — SQL cannot prevent bad app defaults; require domain test “empty bases → 100% unallocated”. |

---

### 3.6 Historical salary / compensation changes

| Severity | Finding |
|----------|---------|
| **HIGH** | `employee_month_costs` has `UNIQUE (organization_id, employee_id, year_month)` for **all** rows. Agent 3 status `superseded` and Agent 1 `adjusts_month_id` correction rows **cannot coexist** with a new active month fact. Supersede/adjust workflow is schema-blocked. Prefer partial unique on active statuses **or** adjustment self-FK + unique where `adjusts_month_id IS NULL`. |
| **HIGH** | `rate_versions.locked_at` exists but **no UPDATE guard** forbidding money-field mutation when locked. Historical CompensationVersion amounts remain writable at DB layer (Agent 1 HIGH). Mirror intent of E3 / app lock at minimum; DB trigger recommended before Full Gate. |
| **HIGH** | Month `locked_at` / `known_quality = 'actual'` have no immutability trigger; money can still UPDATE. |
| **MEDIUM** | `rate_versions.cost_quality` CHECK allows `actual` and `mixed`; Agent 1 V1 reserved versions as **estimated only** (actual on month facts). Ambiguity invites dual “actual” sources. |
| **MEDIUM** | No `rate_version_id` / `compensation_version_id` on `employee_month_costs` — weak audit of which CompensationVersion informed `known_amount`. |
| **MEDIUM** | `estimated_employer_cost` / month amount columns lack `>= 0` CHECKs (known_amount has one). |
| **OK** | Extending `rate_versions` (not a parallel day-ranged table) preserves Mode C FK integrity — correct Lead choice. |

---

### 3.7 Tenant integrity / RLS / composite FKs

| Severity | Finding |
|----------|---------|
| **OK** | New tables use composite `(id, organization_id)` FKs where needed; tenant UNIQUE anchors created for contacts, employees, projects, ap_bills, rate_versions. |
| **OK** | ENABLE + FORCE RLS + `app.is_org_member` policies on all five new tables; `service_role` ALL preserved. |
| **OK** | Assignment / month / run / bill-allocation org FKs CASCADE or RESTRICT appropriately for planning vs cost lines (project RESTRICT on cost lines is correct). |
| **MEDIUM** | Contact clear trigger updates `projects` by `primary_contact_id` only (no `organization_id` predicate). UUID PK makes cross-tenant collision impractical; still prefer Agent 6’s org-scoped clear for defense in depth. |
| **MEDIUM** | Drizzle schema (`workforce.ts` / `ap.ts`) does not yet mirror 0021 objects — expected pre-apply, but Full Gate will fail until Lead syncs schema + journal consumers. |
| **MEDIUM** | Journal tag matches redesigned filename (`0021_workforce_contacts_and_allocations`). Confirm no second `0021_*.sql` remains in tree before apply (git status previously showed an old contact/team draft). |

---

### 3.8 Contact `ON DELETE` safety

| Severity | Finding |
|----------|---------|
| **RESOLVED (was BLOCKER)** | Single-column `projects_primary_contact_id_fk` → `client_contacts(id)` `ON DELETE SET NULL`. Unsafe composite `ON DELETE SET NULL` is dropped if present. Matches Agent 6 Option A + Lead skeleton LOCKED decision. |
| **OK** | `projects_primary_contact_client_guard` enforces same-org + client match after composite FK removal. |
| **OK** | Belt-and-suspenders BEFORE DELETE clear of `primary_contact_id` only (does not touch `organization_id`). |
| **HIGH (test gap)** | Still need integration assertion: delete contact → pointer null, **`organization_id` unchanged**; delete client with contacts → projects survive with intact org (Agent 6 HIGH). |
| **MEDIUM** | Client-change clear remains app + reject-on-mismatch (acceptable). |

---

### 3.9 Concurrency / deletion / reversal

| Severity | Finding |
|----------|---------|
| **HIGH** | `employee_month_costs` ON DELETE CASCADE → labor runs/lines. Deleting a month (or employee) **erases applied Actual basis** with no 0018-style “block direct delete of applied”. Reversal should be supersede, not delete. |
| **HIGH** | Applied labor run can transition freely (no “applied → superseded only”). Re-apply by mutating the same row breaks audit. |
| **MEDIUM** | Assignment overlap trigger is correct for non-cancelled same employee+project spans; cancelled excluded. Concurrent multi-project allowed. No Actual path — OK. |
| **MEDIUM** | Void vendor bill: allocations remain; loaders must ignore void (existing recognition statuses). No SQL help — app must keep status filter when summing lines. |
| **MEDIUM** | Project delete RESTRICT while allocation lines exist may block ops cleanup; preferable to silent Actual orphaning. Document admin path (reassign/supersede first). |

---

## 4. Severity rollup

### BLOCKER

1. **Labor Displacement not coupled in schema/app contract** — `recognition_source` / `status` / applied run can diverge; Mode C time Actual can stack with monthly lines.  
2. **Labor conservation incomplete** — run header can “conserve” without line-sum integrity.  
3. **Vendor header + allocation lines** — no rollup precedence in current financial loaders; shipping allocations without loader change double-counts Actual.  
4. ~~Contact composite `ON DELETE SET NULL`~~ — **FIXED** in redesigned 0021 (do not reintroduce).

### HIGH

1. No labor-run/line immutability (0018 parity missing).  
2. No active-run uniqueness (`draft|applied`); duplicate project lines possible.  
3. Month UNIQUE blocks superseded/adjustment history.  
4. Compensation / month money immutability not enforced despite `locked_at`.  
5. Vendor allocation sum/cap + visible unallocated disclosure not enforced/specified in SQL release set.  
6. Mid-month apply vs later time entries undefined.  
7. Contact DELETE integrity tests missing.  
8. `LABOR-COST-INTEGRITY.md` not extended for monthly regime.

### MEDIUM

1. No `source_amount` snapshot on labor runs; live `known_amount` drift.  
2. Rate version `cost_quality` allows `actual`/`mixed` vs Agent 1 V1.  
3. Missing compensation version FK on month costs; weak non-negative CHECKs on some money cols.  
4. Vendor credits / retention / payable disclosure still Lead decisions.  
5. Contact clear trigger org filter; Drizzle/schema sync; dual-0021 file hygiene.  
6. Assignment `planned_allocation_percent` must never feed Actual (app discipline).  

### OK / strengths

- Concept separation reflected in table layout.  
- Assignment table has no money columns.  
- Payment tables untouched.  
- Contact FK safe pattern.  
- RLS FORCE on new tenant tables.  
- Composite org FKs on cost/assignment children.  
- Labor unallocated column exists (visibility surface present).  
- Optionality preserved (empty advanced tables ⇒ today’s Mode C / single-project AP).

---

## 5. SQL typo / critical defect check

| Item | Result |
|------|--------|
| Contact FK composite SET NULL | **Absent** (good) |
| Conservation equality typo | None |
| Overlap `daterange` bounds `'[]'` | Consistent with rate_versions style |
| RLS loop table list | Complete for new tables |
| Critical typo requiring Reviewer edit | **None** — Lead should patch incomplete invariants; Reviewer did not edit SQL |

---

## 6. Must-fix before apply / Full Gate (Lead checklist)

1. Couple month `status` + `recognition_source` + exactly one applied run; document Displacement in `LABOR-COST-INTEGRITY.md`.  
2. Add line-sum conservation + 0018-like immutability + `(run, project)` uniqueness + active-run uniqueness for labor.  
3. Replace full month UNIQUE with active/adjustment-friendly uniqueness.  
4. Implement vendor rollup precedence + org Unallocated Vendor Costs **before** allocation UI.  
5. Lock closed compensation / actual month money (trigger or proven app + tests).  
6. Add contact delete org-integrity tests.  
7. Decide mid-month apply rule; encode in domain tests.  
8. Sync Drizzle schema to 0021; ensure a single 0021 migration file.

**Deferrable with explicit “out of wave” notes (not silent):** vendor credits, AP retention, payable proration, polymorphic expense `allocation_runs`.

---

## 7. Agent proposal alignment (short)

| Agent | Alignment with 0021 | Integrity note |
|-------|---------------------|----------------|
| 1 Compensation | Extend `rate_versions` + month facts — mostly landed as `employee_month_costs` | Lock/adjust path incomplete |
| 2 Assignments | Temporal table + overlap — landed | No Actual risk in SQL |
| 3 Monthly | Runs/lines/unallocated/conservation — partial | Displacement + immutability gaps are BLOCKER/HIGH |
| 4 Vendor alloc | Child table — landed | Loader precedence BLOCKER until wired |
| 6 Contact FK | Option A — landed | Tests still required |

---

## 8. Delivery

```text
STATUS = COMPLETE
Proposal / files = docs/product/_MASTER-WAVE-REVIEWER1-FINANCIAL.md
Schema asks = none new; Lead must harden 0021 per §6 (Reviewer did not edit SQL)
Tests run = none (static audit)
BLOCKER = Displacement decoupling; labor header-vs-lines conservation; vendor header+lines rollup
HIGH / MEDIUM = see §4
Commit / push / db:migrate = NOT done
```
