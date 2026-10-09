# Integration verification — targeted run (2026-10-09)

**Repository:** `c:\Users\ERAN YOSEF\Desktop\final projects\FINAL-WEB\projectflow`  
**Mode:** AUDIT ONLY — no product code changes, no production SQL  
**Runner:** Vitest v4.1.10, `--project integration` (plus supplementary `--project unit` where noted)  
**Primary command:**

```text
npx vitest run --project integration \
  tests/integration/contractor-access/session-security.test.ts \
  tests/integration/database/migrations.test.ts \
  tests/integration/dg-foundation/foundation.test.ts \
  tests/integration/documents/versioning.test.ts \
  tests/integration/month-close/closed-period-source-corrections.test.ts \
  tests/integration/tenancy/founding.test.ts
```

**Primary exit code:** `1`  
**Primary duration:** ~106.7s  
**Primary totals:** 6 files · 33 tests · **25 passed · 8 failed**

---

## Summary table (mandatory six files)

| # | File | Pass | Fail | File exit | Classification (failures) |
|---|------|------|------|-----------|---------------------------|
| 1 | `tests/integration/contractor-access/session-security.test.ts` | 6 | 1 | fail | **OUTDATED TEST** (1) — grant-scoped subcontract agreement visibility |
| 2 | `tests/integration/database/migrations.test.ts` | 4 | 1 | fail | **CONFIRMED PRODUCT DEFECT** (1) — RLS not enabled/forced on 5 org tables |
| 3 | `tests/integration/dg-foundation/foundation.test.ts` | 6 | 2 | fail | **TEST INFRA** (1) + **OUTDATED TEST** (1) |
| 4 | `tests/integration/documents/versioning.test.ts` | 2 | 1 | fail | **OUTDATED TEST** (1) — download URL shape |
| 5 | `tests/integration/month-close/closed-period-source-corrections.test.ts` | 3 | 2 | fail | **CONFIRMED PRODUCT DEFECT** (2) — month-close close path vs `employee_month_costs_displacement_coupling` |
| 6 | `tests/integration/tenancy/founding.test.ts` | 4 | 1 | fail | **OUTDATED TEST** (1) — role count after provisioning |

---

## Failure detail (mandatory six)

### 1. `session-security.test.ts` — external principal / org tables

- **Test:** `external principal has no memberships, cannot resolve an org context and reads no general org tables`
- **Assertion:** `expect(await ctx.db.select({ id: subcontractAgreements.id }).from(subcontractAgreements)).toHaveLength(0)` — expected **0**, received **1**
- **Location:** line ~120
- **Root cause:** Contractor context is loaded with an active external grant tied to a subcontract agreement; RLS (or grant-scoped access) allows **one** agreement row. The test still treats `subcontract_agreements` as a fully blocked “general org table.”
- **Classification:** **OUTDATED TEST** (or align test name/expectation with grant-scoped contractor visibility — not a session-loader defect for org resolution, which still rejects `resolveOrgContext`).

### 2. `migrations.test.ts` — tenant RLS sweep

- **Test:** `enables and forces row level security on every tenant-owned table`
- **Assertion:** `expect(rows.map((row) => row.tablename)).toEqual([])` — expected **[]**, received **5 table names**
- **Tables missing RLS enable/force:** `subcontract_claim_sequences`, `estimate_text_blocks`, `rfi_submittal_sequences`, `attendance_correction_requests`, `quote_default_text_blocks`
- **Root cause:** New migrations added `organization_id` tables without matching the migration-test invariant (RLS + FORCE RLS).
- **Classification:** **CONFIRMED PRODUCT DEFECT** (schema/migration gap).

### 3. `foundation.test.ts` — narrowing grant

- **Test:** `narrowing a grant to an agreement hides the vendor other agreements`
- **Failure:** Insert into `external_access_grants` rejected — check constraint `external_access_grants_contractor_agreement_project` (SQLSTATE `23514`)
- **Root cause:** `tests/setup/dg-fixtures.ts` sets `subcontractAgreementId` when `narrowToAgreement: true` but leaves `projectId: null` unless `narrowToProject` is set; DB now requires project coupling when agreement is set.
- **Classification:** **TEST INFRA** (fixture does not satisfy current constraint; product constraint may be **INTENTIONAL DESIGN**).

### 4. `foundation.test.ts` — domain events count

- **Test:** `records domain events immutably with a consistent actor`
- **Assertion:** `expect(rows).toHaveLength(2)` — expected **2**, received **4**
- **Root cause:** Service-role `select` from `domain_events` includes events emitted during scenario/fixture setup, not only the two explicit `emitDomainEvent` calls in the test body.
- **Classification:** **OUTDATED TEST** (assertion scope too broad).

### 5. `versioning.test.ts` — download URL

- **Test:** `creates version 1 on first upload and keeps it when a newer version is uploaded`
- **Assertion:** `expect(currentDownload.url).toContain(encodeURIComponent(\`test-ext-${first.id}-contract-signed.pdf\`))`
- **Received:** `http://localhost:3000/api/org-storage/download/<uuid>?disposition=attachment`
- **Root cause:** Document download URLs now route through org-storage proxy API instead of embedding storage key/filename in the URL string tests assert.
- **Side log:** `[org-storage/provision] vendor folder failed` — `DATABASE_URL is not configured` (non-fatal for other cases in this file; 2/3 tests still pass).
- **Classification:** **OUTDATED TEST**.

### 6. `founding.test.ts` — role provisioning count

- **Test:** `provisions roles and an owner grant in the same transaction`
- **Assertion:** `expect(provisioned).toHaveLength(4)` — expected **4**, received **5**
- **Root cause:** Organization founding now seeds **five** system roles (one additional role since the test was written); owner grant and permission count assertions still pass.
- **Classification:** **OUTDATED TEST**.

### 7–8. `closed-period-source-corrections.test.ts` — time-entry / month close

- **Tests:**
  - `voids a time entry in an open month and posts a month-close cost delta when closed`
  - `refuses a closed-month time correction without a project`
- **Failure:** `closeMonthClosePeriod` → `closeEmployeeMonthCost` UPDATE fails check constraint `employee_month_costs_displacement_coupling` (SQLSTATE `23514`) while setting `status = 'closed'`.
- **Stack:** `manage-periods.ts` → `employee-month-costs.repository.ts:143`
- **Root cause:** Month-close path attempts to close `employee_month_costs` rows that violate displacement coupling rules (likely `recognition_source` / displacement fields not satisfied for “applied → closed” transition in this fixture path).
- **Classification:** **CONFIRMED PRODUCT DEFECT** (month-close + employee month cost invariant interaction), unless product intentionally added constraint without updating close workflow — then split: constraint = **INTENTIONAL DESIGN**, close path = **CONFIRMED PRODUCT DEFECT**.

---

## Supplementary targeted checks (grep + run)

No integration files contain literal IDs `WF-002`, `PM-001`, `FIN-005`, `SEC-001`, or `SEC-002`. Closest executable tests were located by behavior keywords.

| Audit ID | Topic | File(s) run | Result | Exit | Notes |
|----------|--------|-------------|--------|------|--------|
| **WF-002** | Approved attendance overwrite voids approved state | `tests/integration/workforce/attendance-project-atomicity.test.ts` | **PASS** 8/8 | 0 | Covers overwrite **atomicity** (A–E scenarios), **not** “overwrite after approval voids approved time entry” — **gap remains** (matches prior ops verify: scenario **F** not reproduced). |
| **PM-001** | Structure template apply | `tests/unit/projects/templates.test.ts` | **PASS** 4/4 | 0 | Proves catalog + `cloneProjectTemplateForApply('simple_finish')`; does **not** prove DB apply for 9/10 other template keys (metadata-only gap unchanged). |
| **FIN-005** | Billing `lineTotal` (gross) → SUMIT `lineNet` | `tests/unit/invoicing-integration/build-statutory-bridge.test.ts` (2), `sumit-create-payload.test.ts` (3) | **PASS** 5/5 | 0 | Tests use pre-built `lineNet` / bridge lines; **no assertion** that default billing `lineTotal` gross maps correctly to SUMIT net — **FIN-005 reproduction still BLOCKED** at test level. |
| **SEC-001** | Member without permission: raw `audit_events` SELECT | `tests/integration/tenancy/rls-hardening.test.ts` (insert policy) | **PASS** 5/5 | 0 | Exercises **INSERT** policy / founding audit, not under-privileged **SELECT** on all audit rows. |
| **SEC-001** | App-layer audit isolation | `tests/integration/settings/tenant-isolation.test.ts` | **PASS** 3/3 | 0 | `listAuditEvents` cross-tenant rejection — **app gate**, not production PostgREST RLS parity. |
| **SEC-002** | Under-privileged `contracts` SELECT | *(none in `tests/integration`)* | **NOT RUN** | — | No dedicated integration test found; `0051-rls-parity-matrix.json` documents intended predicate change only. |

**Supplementary commands (exit codes):**

```text
npx vitest run --project integration \
  tests/integration/workforce/attendance-project-atomicity.test.ts \
  tests/integration/tenancy/rls-hardening.test.ts
→ exit 0 (13/13 pass)

npx vitest run --project unit \
  tests/unit/projects/templates.test.ts \
  tests/unit/invoicing-integration/sumit-capabilities.test.ts
→ exit 0 (7/7 pass)

npx vitest run --project unit \
  tests/unit/invoicing-integration/build-statutory-bridge.test.ts \
  tests/unit/invoicing-integration/sumit-create-payload.test.ts
→ exit 0 (5/5 pass)

npx vitest run --project integration tests/integration/settings/tenant-isolation.test.ts
→ exit 0 (3/3 pass)
```

---

## Classification rollup (8 primary failures)

| Classification | Count | Tests |
|----------------|-------|--------|
| **CONFIRMED PRODUCT DEFECT** | 3 | migrations RLS sweep; month-close ×2 |
| **OUTDATED TEST** | 4 | session-security subcontract row; domain event count; document download URL; founding role count |
| **TEST INFRA** | 1 | dg-foundation grant fixture vs `external_access_grants_contractor_agreement_project` |
| **INTENTIONAL DESIGN** | 0 | — (none asserted as passing failures) |

---

## Exit codes (this audit)

| Run | Exit code |
|-----|-----------|
| Primary six-file integration batch | **1** |
| WF-002 / SEC-adjacent integration supplementary | **0** |
| PM-001 / SUMIT capabilities unit supplementary | **0** |
| FIN-005-adjacent SUMIT bridge/payload unit | **0** |
| Settings tenant-isolation (SEC-001 app layer) | **0** |

---

*Generated: 2026-10-09 (local run, PGlite integration harness).*
