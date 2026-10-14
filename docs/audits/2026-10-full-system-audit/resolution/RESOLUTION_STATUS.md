# Resolution program status

**Last updated:** 2026-10-11  
**Baseline commit:** `35e2ff0f7f12d0a3ec94ea0aed23b8c97b6bb00e`  
**Owner execution plan:** [`.cursor/plans/audit_findings_resolution_e2e_verification.plan.md`](../../../.cursor/plans/audit_findings_resolution_e2e_verification.plan.md) — **לא מאושר לביצוע**  
**Unified understanding (Hebrew):** [`PROJECTFLOW_FINAL_UNIFIED_FINDINGS.md`](../PROJECTFLOW_FINAL_UNIFIED_FINDINGS.md) — includes 4 validation waves @ HEAD (2026-10-11)

---

## Phase completion

| Phase | Artifact | Status |
|-------|----------|--------|
| 1 Domain cross-ref | [PHASE1_domain_crossref.md](PHASE1_domain_crossref.md) | **Done** ([Domain cross-ref](9d3a0c32-dca3-41a0-bce2-6f2dad5c91db)) |
| 1 Financial triage (lead) | [PHASE1_lead_financial_triage.md](PHASE1_lead_financial_triage.md) | **Done** |
| 1 Financial cross-ref | [PHASE1_financial_crossref.md](PHASE1_financial_crossref.md) | **Done** ([Financial cross-ref](0f45876d-50cb-449a-a538-82c4d132311f)) — **authoritative** for 22 financial IDs |
| 2 Production migration gate | [PHASE2_production_migration_verification.md](PHASE2_production_migration_verification.md) | **Prepared** — awaits **Owner-approved read-only SQL** |
| 4 E2E test matrix | [PHASE4_e2e_test_matrix.md](PHASE4_e2e_test_matrix.md) | **Done (prep)** ([E2E matrix prep](0972ba47-1b9a-4baf-ad97-6b9b5d2382a2)) — PGlite **77/79**; Playwright **not run** |
| 6 Historical closure | [PHASE6_historical_closure.md](PHASE6_historical_closure.md) | **Done** ([Historical closure](9325f442-d0c0-4220-82fc-3bc49e46ebf0)) |
| 7 Execution plan | `.cursor/plans/audit_findings_resolution_e2e_verification.plan.md` | **Awaiting Owner approval** |

---

## Disposition snapshot (financial + Mode B)

Source: [PHASE1_financial_crossref.md](PHASE1_financial_crossref.md) (76 unit + 2 integration tests green).

| ID | Disposition | Next wave |
|----|-------------|-----------|
| K05-001, K05-002 | **PROVEN_BUG** | wave1 |
| B10-001 | **PROVEN_BUG** (+8,730 ILS line net on FIN-005 fixture) | wave2 |
| B10-002 | **MISSING_FEATURE** (list-scan recovery) | wave2 — scope Owner |
| B10-003 | **PROVEN_BUG** (refresh requires `externalId`) | wave2 |
| V09-001 | **INTENTIONAL** (warn-only) | no block |
| V09-002 | **PROVEN_BUG** (+4,000 ILS Actual on 10k/10k/6k compose scenario) | wave2 |
| V09-003, V09-004 | **PROVEN_BUG** | wave2 |
| F11-001–004 | **PROVEN_BUG** (basis drift) | wave2 |
| F11-005 | **MISSING_FEATURE** | out of audit closure unless Owner expands |
| F11-008, F11-013 | **STALE_TEST** / doc | wave5 hygiene |
| A01-001 / 0179 apply | **PROD_UNKNOWN** | gate-owner-prod-read |

---

## Historical plans (PHASE6 summary)

- **62** YAML todos → mark **IMPLEMENTED_WITH_EVIDENCE** (hygiene, wave5-historical-close).
- **12** → **OWNER_DEFER** (do not schedule as bugs).
- **32** → **STILL_OPEN** — prioritize only items in Owner-approved execution plan §E.

**H16-009:** Oct-9 NOT READY not cleared on this SHA → tied to **wave5-h16-009-verification** + **wave6-regression-preflight**.

---

## Phase 4 prep snapshot (PGlite only)

Source: [PHASE4_e2e_test_matrix.md](PHASE4_e2e_test_matrix.md). Ledger JSON updated with `phase4PrepBatch`.

| Ledger | After prep |
|--------|------------|
| **PASS** | SCENARIO_10 only |
| **FAIL** | SCENARIO_05 (K05 / no integration chain) |
| **PARTIAL** | All other scenarios (incl. 06/08/13/14 upgraded from NOT VERIFIED where batch ran) |
| **Integration blockers** | SCENARIO_11 — `lifecycle` locale + `session-security` subcontract agreement row |

Wave 4 execution order: matrix §8 (contractor-access → PO/billing → claim projection harness → connected integration → Playwright).

---

## Blockers before code waves

1. Owner approves **execution plan** (`.cursor/plans/audit_findings_resolution_e2e_verification.plan.md`).
2. Owner approves **PHASE2** read-only Production migration read (or supplies filled §4 template).

No push, deploy, or Production SQL until separate Owner gates.
