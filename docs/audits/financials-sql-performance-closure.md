# Financials SQL / Index Performance Closure

Measured: 2026-08-30, Owner project `ee7cb842-bbd1-4188-b95e-9f98446c92aa`, org `8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec`.

## Executive summary

**FINANCIALS SQL PERFORMANCE (index path) = NOT THE BOTTLENECK**

PostgreSQL execution for both dominant queries is **single-digit milliseconds** under RLS. Isolated round-trip latency is **~150 ms/query** (Supabase eu-west-1). Full Financials was **~7.1 s** because **51 queries serialized on one connection** (~51 × 150 ms ≈ 7.6 s theoretical floor). Indexes and query-shape fixes could not close the gap to ≤5 s without **fewer round trips**.

**Resolution:** Financials read **round-trip collapse** (batched SQL bundles + AP fact cache) — not index migration.

---

## LABOR — current-month preview bundle CTE

### Query

`src/modules/workforce/data/monthly-labor-preview-bundle.repository.ts`

### EXPLAIN (ANALYZE, BUFFERS, VERBOSE) — RLS transaction

| Metric | Value |
|--------|-------|
| **Total execution time** | **4.826 ms** |
| **Planning time** | 1.641 ms |
| **Highest-cost node** | Nested Loop Left Join → Bitmap Heap Scan on `time_entries` (outer CTE) |
| **Scan types** | Index Scan (`rate_versions_org_idx`, `employees_org_idx`), Bitmap Index Scan (`time_entries_employee_date_idx`, `time_entries_project_idx`, `time_entries_org_status_idx`), Bitmap Heap Scan |
| **Sequential scans** | **None** on `time_entries` |
| **Rows est vs actual (CTE)** | 1 est / 20 actual (distinct employee_ids) |
| **Rows removed by filter** | RLS: `app.is_org_member`, `app.can_access_project`, `app.has_org_permission` on heap recheck |
| **Sort/hash spills** | None (quicksort in memory, 25–27 kB) |
| **Nested loops** | Yes — CTE driven by `rate_versions_org_idx` (3 monthly rows) → BitmapAnd per employee |

**Root slow node (PostgreSQL):** Nested Loop in CTE starting from `rate_versions_org_idx`, not a sequential scan.

**Indexes used:** `rate_versions_org_idx`, `time_entries_employee_date_idx`, `time_entries_project_idx`, `time_entries_org_status_idx`, `employees_org_idx`, `labor_cost_components_rate_version_idx`.

**Planner note:** CTE filters `(organization_id, project_id, work_date, kind, status, approval)` but planner composes **BitmapAnd** of `employee_date` + `project` indexes because no composite matches the predicate order. At Owner cardinality, PG execution remains ~5 ms — not the wall-clock bottleneck.

### Latency layers

| Layer | Before | After query-shape fix | Notes |
|-------|--------|----------------------|-------|
| PG execution (RLS EXPLAIN) | 4.826 ms | 4.629 ms | No meaningful change at 426 rows |
| Isolated round-trip (3 runs) | 152–158 ms | 154–158 ms | Network + pooler |
| Profile in full Financials | ~1554 ms | ~1554 ms | **Includes JS gap** until next DB dispatch (see below) |

**Query-shape fix applied:** CTE now filters `time_entries` first with `EXISTS (monthly rate_versions)` instead of joining `rate_versions` in the CTE. Planner still prefers `rate_versions` outer path at current cardinality.

**Sequential scan eliminated:** N/A — none present before.

---

## AP — GCM recognized bill range load

### Query

`sumRecognizedApGeneralRemaindersByYearMonth` → `ap_bills` header select  
Range: `2026-08-01` .. `2028-02-29`, status ∈ `{open, partially_matched, matched}`, currency ILS.

### EXPLAIN (ANALYZE, BUFFERS, VERBOSE) — RLS transaction

| Metric | Value |
|--------|-------|
| **Total execution time** | **0.029 ms** |
| **Planning time** | 0.385 ms |
| **Highest-cost node** | Index Scan on `ap_bills_subcontract_idx` |
| **Scan types** | Index Scan (not seq scan) |
| **Rows est vs actual** | 1 est / **0 actual** (org has **0 ap_bills**) |
| **Rows removed by filter** | `bill_date`, `status`, `currency`, `archived_at`, RLS |
| **Sort/hash spills** | None |
| **Downstream joins** | Allocations/credits not in this EXPLAIN (separate queries; 0 bills → no-op) |

**Root slow node (PostgreSQL):** Index Scan using **`ap_bills_subcontract_idx`** `(organization_id, subcontract_agreement_id)` — **`bill_date` filtered post-index**.

**Planner note:** Range predicate on `bill_date` not in index key; could degrade at scale, but Owner org had 0 bills and 0.03 ms execution — not the wall-clock bottleneck.

### Latency layers

| Layer | Before | After |
|-------|--------|-------|
| PG execution (RLS EXPLAIN) | 0.029 ms | 0.030 ms |
| Isolated full AP loader (3 queries) | 147–151 ms | 149–151 ms |
| Profile `ap_bills` line in Financials | ~1289 ms | ~1262 ms | Queue position + timer attribution |

**Sequential scan eliminated:** N/A — none present.

---

## Profile timer caveat

`profile-sql.ts` attributes elapsed time from **query N start → query N+1 start**. Any **JavaScript** between dispatches (e.g. labor accrual fold after bundle returns) is counted as SQL time. Isolated measurement confirms true SQL RTT ≈ **150 ms** for labor bundle; **1554 ms** in full request is **not** PostgreSQL execution time.

---

## Full Financials remeasure (pre round-trip collapse)

| Metric | Before | After query-shape only |
|--------|--------|------------------------|
| Cold total | 6627 ms | **7140 ms** (variance) |
| Second navigation | 6549 ms | **6934 ms** |
| getProjectFinancials | ~5100 ms | **5544 ms** |
| Queries | 51 | **51** |
| Writes | 0 | **0** |
| Canonical amounts | ✓ | **✓ unchanged** |

**Remaining exact bottleneck (pre collapse):** **51 serialized Supabase round trips × ~150 ms** on one RLS transaction connection. Dominant wall-time was **round-trip count**, not plan cost.

**Post round-trip collapse:** see Financials round-trip measure (~4.3 s cold, 19 primary queries). Fix = query consolidation, not indexes.

---

## Verification

- Canonical financial numbers: **YES unchanged**
- Financial read writes: **0**
- Broad Playwright / full regression: **not run**
