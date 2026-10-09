# Annex A — 81 findings execution ledger (2026-10-09)

| Field | Value |
|--------|--------|
| **Commit** | `89e0b9a90c43cffbec24e726675bf8448587833e` |
| **Scope** | AUDIT ONLY — no product fixes, no production SQL |
| **Source register** | [PROJECTFLOW-FULL-SYSTEM-AUDIT-2026-10-09.md](./PROJECTFLOW-FULL-SYSTEM-AUDIT-2026-10-09.md) Annex A |
| **Prior reconcile** | [PROJECTFLOW-FINAL-COMPLETE-VERIFICATION-2026-10-09.md](./PROJECTFLOW-FINAL-COMPLETE-VERIFICATION-2026-10-09.md) §23 / Annex X |
| **Execution harness** | `tests/unit/audit/verification-81-findings-execution-2026-10-09.test.ts` (**27/27 pass**), targeted unit slices, `grep`/static, `npm run db:check-journal` |

## §23 execution set (29 IDs)

Per final report metrics (`81 − 32 CONFIRMED − 15 DESIGN − 5 TEST INFRA = 29`), this wave ran the **smallest executable proof** for each ID below. Fifteen other Annex X rows marked `NOT VERIFIED` were already closed as **INTENTIONAL DESIGN**, **TEST INFRA**, or **static CONFIRMED** in the final report and were not re-run here.

| ID | Proof method | Result |
|----|----------------|--------|
| WF-002 | Static source in audit vitest | **CONFIRMED** — overwrite path voids submitted/approved rows |
| WF-004 | Unit math in audit vitest | **CONFIRMED** — low WDM denominator front-loads pool |
| WF-006 | Static source in audit vitest | **CONFIRMED** — auto `approveTimeEntry` on submitted |
| WF-007 | Static module presence in audit vitest | **CONFIRMED** — dual timesheet + entry paths |
| WF-009 | Static source in audit vitest | **CONFIRMED** — `unallocated` / `nonProjectOrUnallocated` exposed |
| FIN-004 | Static source in audit vitest | **CONFIRMED** — no SUMIT/statutory hook on adjustment |
| FIN2-002 | Static source in audit vitest | **CONFIRMED** — statement uses `netInvoiced` under “invoiced” label |
| FIN2-003 | `map-line-actuals.test.ts` `-t "leaves discipline"` | **CONFIRMED** — discipline lines stay `unmapped` |
| FIN2-008 | Static SQL join in audit vitest | **CONFIRMED (timing risk)** — GCM uses open/frozen months |
| FIN2-009 | Static `@deprecated` in audit vitest | **CONFIRMED** — legacy expenses-only org sum flagged |
| CRM-001 | Static source in audit vitest | **CONFIRMED** — win sync skipped without `CRM_MANAGE` |
| CRM-002 | Static source in audit vitest | **CONFIRMED** — falls back to latest CRM version |
| UI-004 | Static redirect in audit vitest | **CONFIRMED** — `/inbox` → `/today` |
| SEC-003 | Static doc comment in audit vitest | **CONFIRMED** — `role_assignments.project_id` ignored in app union |
| SEC-004 | Static page shell in audit vitest | **CONFIRMED (static)** — execution route lacks profile gate; **BLOCKER** for browser/URL proof |
| SEC-006 | Static migration in audit vitest | **CONFIRMED** — default `project_access_mode` → `'all'` |
| SEC-010 | `npm run db:check-journal` + grep `PREPARED ONLY` | **BLOCKER** — local journal parity OK; **Production apply state unknown** |
| PM-002 | Static apply + template comment in audit vitest | **CONFIRMED** — closeout keys stored, no closeout reader wired |
| PM-004 | Unit `convertWithSubcontracts` in audit vitest | **CONFIRMED** — port returns `null` |
| PM-008 | Static schema default in audit vitest | **CONFIRMED** — `progress_source` default `manual` |
| RPT-001 | Unit catalog enum in audit vitest | **CONFIRMED** — no `labor`*`period`* pack kind |
| RPT-005 | Static aggregate key in audit vitest | **CONFIRMED** — `vendorActual` rollup key present |
| OPS-002 | Static route in audit vitest | **CONFIRMED** — async `waitUntil` worker pattern |
| OPS-004 | Static kick source in audit vitest | **CONFIRMED** — `.catch(() => undefined)` swallows errors |
| DOC-001 | Static evidence UI in audit vitest | **CONFIRMED** — download pattern, no inline preview |
| DOC-006 | Static Google Drive provider in audit vitest | **CONFIRMED (static)** — error paths in provider; no live OAuth run |
| DOC-008 | Static apply template in audit vitest | **CONFIRMED** — no skip toast in apply path |
| DOC-011 | Static employee doc access in audit vitest | **CONFIRMED** — null category allowed in project scope |
| DOC-012 | Static invoicing + billing in audit vitest | **CONFIRMED** — statutory save module exists; billing adjust does not archive to project folders |

**Evidence pointers:** audit vitest → `tests/unit/audit/verification-81-findings-execution-2026-10-09.test.ts`; FIN2-003 → `tests/unit/budgets/map-line-actuals.test.ts`; SEC-010 → `drizzle/scripts/check-migration-journal.mjs` stdout `journal parity ok { files: 171, last: '0172_…' }` + 20× `PREPARED ONLY` headers under `drizzle/migrations/`.

---

## Full register — one row per finding ID

Columns: **ID | Severity | Final disposition | Evidence pointer**

| ID | Sev | Final disposition | Evidence pointer |
|----|-----|-------------------|------------------|
| WF-001 | CRITICAL | **INTENTIONAL DESIGN** | `tests/unit/financials/labor-expense-integrity.test.ts` (6/6); final report §Owner rule |
| WF-002 | HIGH | **CONFIRMED** (overwrite voids approved/submitted) | Audit vitest WF-002; `attendance-project-sync.ts` L114–177 — no integration approved+overwrite |
| WF-003 | HIGH | **PARTIAL CONFIRMED** + **OPS-B-002** | `closed-period-source-corrections.test.ts` fail; employer-cost 6/6 pass — final forensics |
| WF-004 | HIGH | **CONFIRMED** (WDM front-load math) | Audit vitest WF-004; `monthly-accrual.ts` |
| WF-005 | MEDIUM | **CONFIRMED** (doc drift) | `labor-expense-integrity.test.ts` + doc vs code — final report |
| WF-006 | MEDIUM | **CONFIRMED** (auto-approve on sync) | Audit vitest WF-006 |
| WF-007 | MEDIUM | **CONFIRMED** (dual approval models) | Audit vitest WF-007; `timesheet-lifecycle.ts` |
| WF-008 | LOW | **INTENTIONAL DESIGN** | Final report §23 — online-only product |
| WF-009 | MEDIUM | **CONFIRMED** (unallocated pool fields) | Audit vitest WF-009 |
| WF-010 | LOW | **INTENTIONAL DESIGN** | Final report §23 |
| FIN-001 | MEDIUM | **CONFIRMED** | `sumit-credit-cancel-and-payment-plan.test.ts` / payment plan 14/14 — audit session |
| FIN-002 | HIGH | **CONFIRMED** | Static `void-billing-record.ts` — final report |
| FIN-003 | HIGH | **CONFIRMED** | Static `invoicing-integration/ui/actions.ts` scope — final report |
| FIN-004 | MEDIUM | **CONFIRMED** (not wired to SUMIT) | Audit vitest FIN-004 |
| FIN-005 | HIGH | **CONFIRMED** | Static `create-billing-record.ts` + bridge — final report |
| FIN2-001 | HIGH | **INTENTIONAL DESIGN** | `expense-ap-overlap.test.ts` 4/4 warn-only — final report |
| FIN2-002 | LOW | **CONFIRMED** | Audit vitest FIN2-002; `present-financials.ts` |
| FIN2-003 | HIGH | **CONFIRMED** | `map-line-actuals.test.ts` discipline unmapped case |
| FIN2-004 | MEDIUM | **PARTIAL** | `/overhead` redirect — final report |
| FIN2-005 | MEDIUM | **INTENTIONAL DESIGN** | Final report §23 cash forecast disclosure |
| FIN2-006 | MEDIUM | **CONFIRMED** (duplicate forecast labels) | Static `src/locales/he-IL/financial.json` L336 vs L492 `forecastProfit` |
| FIN2-007 | HIGH | **INTENTIONAL DESIGN** (= WF-001) | Same as WF-001 |
| FIN2-008 | MEDIUM | **CONFIRMED (timing risk)** | Audit vitest FIN2-008 |
| FIN2-009 | LOW | **CONFIRMED** | Audit vitest FIN2-009 |
| FIN2-010 | MEDIUM | **CONFIRMED (model)** | `po-receiving` integration — final report |
| CRM-001 | MEDIUM | **CONFIRMED** | Audit vitest CRM-001; `convert-quote.ts` L340–341 |
| CRM-002 | MEDIUM | **CONFIRMED** | Audit vitest CRM-002 |
| CRM-003 | LOW | **CONFIRMED (static)** | Final report static `opportunities.ts` — list hygiene |
| UI-001 | HIGH | **NOT IMPLEMENTED** | `portal/page.tsx` `notFound()` — final report |
| UI-002 | MEDIUM | **NOT IMPLEMENTED** | `settings/portal` — final report |
| UI-003 | LOW | **PARTIAL** | `mobile-nav.test.tsx` 2/2 — final report |
| UI-004 | LOW | **CONFIRMED** | Audit vitest UI-004 |
| UI-005 | TRIVIAL | **CONFIRMED (static)** | `_task-api-stub` naming — final report grep |
| SEC-001 | HIGH | **CONFIRMED** | Static `0001_rls_security.sql` — final report |
| SEC-002 | HIGH | **CONFIRMED** | Static vs 0073 pattern — final report |
| SEC-003 | MEDIUM | **CONFIRMED** | Audit vitest SEC-003; `roles.repository.ts` L134–140 |
| SEC-004 | MEDIUM | **CONFIRMED (static)**; URL **BLOCKER** | Audit vitest SEC-004 — no E2E URL proof |
| SEC-005 | MEDIUM | **INTENTIONAL DESIGN** | Final report §23 product/nav story |
| SEC-006 | LOW | **CONFIRMED** | Audit vitest SEC-006; `0050_wave3_operations.sql` |
| SEC-007 | LOW | **INTENTIONAL DESIGN** | Final report §23 null `project_id` visibility |
| SEC-008 | INFO | **INTENTIONAL DESIGN** | Role templates H2 — final report |
| SEC-009 | INFO | **CONFIRMED** | 0168 + tests — final report |
| SEC-010 | INFO | **BLOCKER** (Production) | `db:check-journal` local OK; PREPARED headers; **no Owner DB read** |
| PM-001 | HIGH | **CONFIRMED** | Template apply 1/10 — final report |
| PM-002 | MEDIUM | **CONFIRMED** | Audit vitest PM-002 |
| PM-003 | HIGH | **CONFIRMED** | dg-field + field-ops tests — final report |
| PM-004 | MEDIUM | **CONFIRMED** | Audit vitest PM-004; `conversion-port.ts` |
| PM-005 | MEDIUM | **CONFIRMED** | Agent 02 tests — final report |
| PM-006 | MEDIUM | **CONFIRMED** | Scheduling 2/2 no bridge — final report |
| PM-007 | LOW | **CONFIRMED (static)** | Planning domain honest flag — final report |
| PM-008 | MEDIUM | **CONFIRMED** | Audit vitest PM-008 |
| PM-009 | MEDIUM | **CONFIRMED** | Owner task UI gap — final report |
| PM-010 | LOW | **CONFIRMED (static)** | `assertPlanningEligible` — final report |
| PM-011 | MEDIUM | **CONFIRMED (static)** | Calendar fragmentation — final report |
| PM-012 | LOW | **NOT IMPLEMENTED** | `EXTERNAL_CALENDAR` — final report |
| PM-013 | MEDIUM | **PARTIAL** | dg-events consumer 9/9 — final report |
| PM-014 | LOW | **PARTIAL CONFIRMED** | `project-tasks-ux` — final report |
| PM-015 | INFO | **INTENTIONAL DESIGN** | `work_kind` schema — final report |
| DOC-001 | MEDIUM | **CONFIRMED** | Audit vitest DOC-001 |
| DOC-002 | MEDIUM | **CONFIRMED** | Contractor evidence path A — final report |
| DOC-003 | LOW | **INTENTIONAL DESIGN** | Dual upload models — final report |
| DOC-004 | MEDIUM | **CONFIRMED** | field-ops + evidence pass — final report |
| DOC-005 | LOW | **CONFIRMED (static)** | Audit action i18n gaps — final report |
| DOC-006 | MEDIUM | **CONFIRMED (static)** | Audit vitest DOC-006 |
| DOC-007 | LOW | **INTENTIONAL DESIGN** | Draft hidden from contractor — final report §23 |
| DOC-008 | MEDIUM | **CONFIRMED** | Audit vitest DOC-008 |
| DOC-009 | LOW | **INTENTIONAL DESIGN** | Revoked share → NotFound — final report §23 |
| DOC-010 | INFO | **INTENTIONAL DESIGN** | Storage policy — final report |
| DOC-011 | MEDIUM | **CONFIRMED** | Audit vitest DOC-011 |
| DOC-012 | LOW | **CONFIRMED** | Audit vitest DOC-012 |
| RPT-001 | MEDIUM | **CONFIRMED** | Audit vitest RPT-001 |
| RPT-002 | MEDIUM | **TEST INFRA** | Unit 8/8; Playwright setup fail — final report |
| RPT-003 | LOW | **CONFIRMED (static)** | E2E design ≥ contract — final report |
| RPT-004 | LOW | **CONFIRMED (static)** | Reports period vs rollup labels — final report |
| RPT-005 | MEDIUM | **CONFIRMED** | Audit vitest RPT-005 |
| RPT-006 | LOW | **CONFIRMED (static)** | Analytics gate UX — final report |
| OPS-001 | MEDIUM | **CONFIRMED** | hobby crons 1/1 + consumer 9/9 — final report |
| OPS-002 | MEDIUM | **CONFIRMED** | Audit vitest OPS-002 |
| OPS-003 | LOW | **INTENTIONAL DESIGN** | Vercel hobby cron limits — final report |
| OPS-004 | LOW | **CONFIRMED** | Audit vitest OPS-004 |
| OPS-005 | LOW | **PARTIAL** / **TEST INFRA** | consumer 9/9; harness gap — final report |

---

## Disposition summary (81)

| Disposition | Count |
|-------------|------:|
| CONFIRMED (incl. static / model / timing) | 54 |
| INTENTIONAL DESIGN | 15 |
| PARTIAL / PARTIAL CONFIRMED | 5 |
| NOT IMPLEMENTED | 3 |
| BLOCKER (Production and/or browser-only gap) | 2 |
| TEST INFRA | 2 |
| **Total** | **81** |

*(WF-003 is PARTIAL + OPS-B-002 linkage; OPS-B-002 is a separate product defect outside the 81 register.)*

---

## Commands executed (this wave)

```text
npx vitest run --project unit tests/unit/audit/verification-81-findings-execution-2026-10-09.test.ts  → 27/27 pass
npx vitest run --project unit tests/unit/budgets/map-line-actuals.test.ts -t "leaves discipline"     → 1/1 pass
npm run db:check-journal                                                                              → journal parity ok (171 files)
```

*End of execution ledger — 2026-10-09.*
