# PHASE 1 — Lead financial finding triage (no code changes)

**Baseline:** `35e2ff0f7f12d0a3ec94ea0aed23b8c97b6bb00e`  

> **Superseded for classifications:** use **[PHASE1_financial_crossref.md](PHASE1_financial_crossref.md)** ([Financial cross-ref](0f45876d-50cb-449a-a538-82c4d132311f)). This lead note remains for early numeric notes; **V09-002** upgraded from SUSPECT → **PROVEN_BUG** there (+4,000 ILS scenario).

**Method:** Re-read source + targeted vitest (2026-10-11).

Classification: **PROVEN_BUG** · **SUSPECT** · **INTENTIONAL** · **STALE_TEST** · **MISSING_FEATURE** · **PROD_UNKNOWN**

| ID | Classification | Summary | Evidence |
|----|----------------|---------|----------|
| **K05-001** | **PROVEN_BUG** (when 0179 applied) | `findConnectedProjectMappingForContractorProject` selects `m.vendor_id`; 0179 `connected_project_mappings` has no such column → `42703` caught → `null` | `mapping.repository.ts:58`; `0179_connected_projects.sql` §2 |
| **K05-002** | **PROVEN_BUG** (when 0179 applied) | SQL filter uses `'accepted'`, `'sync_degraded'`; 0179 CHECK allows only `pending`, `provisioning`, `active`, `failed`, `revoked` | Same repository WHERE clause vs migration CHECK |
| **B10-001** | **PROVEN_BUG** (exclusive VAT path) | Single-line billing stores **gross** in `lineTotal`; bridge maps `lineTotal` → `lineNet`; SUMIT line = 57230 while header subtotal = 48500 | `create-billing-record.ts` `buildLines`; `build-statutory-bridge.ts:57`; **EXEC** `fin-005-gross-line-sumit-mapping.test.ts` (3/3 PASS documents bug) |
| **B10-002** | **PROVEN_GAP** / design | No list-by-ExternalReference recovery when create ambiguous without DocumentID | AGENT_10 static trace — needs code read in execution wave |
| **B10-003** | **PROVEN_GAP** | Recovery worker only `refresh` with existing `externalId` | AGENT_10 |
| **V09-001** | **INTENTIONAL** | `assertNoUnlinkedExpenseApOverlap` is explicit no-op; comment + FIN2-001 **warn-only** policy | `expense-ap-overlap.ts:102–111`; overlap **finding** via `findSimilar*` for UI |
| **V09-002** | **SUSPECT** → needs integration | Unit compose **expects** full bill + expense remainder when bill > match (`expense-ap-dedup.test.ts` L99–122). Loader may still over-count vs business expectation | Prove with PGlite integration + `loadRecognizedVendorBillsForProject` before changing math |
| **V09-003** | **SUSPECT** | Header project + allocation lines — finalize may not block | AGENT_09; verify with integration |
| **V09-004** | **SUSPECT** | Budget cost-code path may diverge from compose | AGENT_09; verify with integration |
| **F11-001–004** | **PROVEN_INCONSISTENCY** (not arithmetic error) | `estimatedFinalCost` aliases **direct** forecast; some surfaces mode-aware, warnings/rollup/KPI drilldown not | `cost-aggregation.ts`; AGENT_11 |
| **F11-005** | **OWNER_DEFER / MISSING_FEATURE** | Overhead hub redirect only | `/overhead` redirect |
| **F11-006+** | See AGENT_11 | Mix MEDIUM/LOW/INFO | Subagent report |

## Numeric scenario — B10-001 (verified)

| Field | Amount (ILS) |
|-------|-------------|
| Net subtotal (header) | 48,500 |
| VAT 18% | 8,730 |
| Gross total | 57,230 |
| Single line `lineTotal` stored | **57,230** (gross) |
| Bridge `lineNet` sent to SUMIT | **57,230** |
| **Expected net line (exclusive)** | **48,500** |
| **Delta (overstatement on line)** | **8,730** |

## Numeric scenario — V09-002 (unit contract)

| Expense | Match | Bill NET in compose input | Expense after dedupe | Vendor actual | **Total actual** |
|---------|-------|---------------------------|----------------------|---------------|------------------|
| 10,000 | 6,000 | 6,000 | 4,000 | 6,000 | **10,000** ✓ per test |
| 6,000 | 6,000 | 10,000 | 0 | 10,000 | **10,000** ✓ per test (possible business double-count) |

**Action:** Do **not** change dedupe until Owner confirms economic rule for “bill larger than matched expense slice.”

## Reclassify audit severity

- Remove **V09-001** from “fix overlap no-op” remediation unless Owner revokes FIN2-001 warn-only.
- Keep **B10-001** in P1 with EXEC test as regression anchor after fix (map net line or split VAT on bridge).
