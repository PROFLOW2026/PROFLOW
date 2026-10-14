# Resolution Phase 1 — Domain cross-reference (audit only)

| Field | Value |
|--------|--------|
| **Phase** | RESOLUTION **PHASE 1** — read subagent reports, cross-check top findings vs code at HEAD; **no fixes**, **no SQL**, **no prod changes** |
| **Repository commit** | `35e2ff0f7f12d0a3ec94ea0aed23b8c97b6bb00e` (`main`, matches audit baseline) |
| **Inputs** | Subagent reports **01, 02, 03, 04, 06, 07, 08, 13, 14, 15, 16** under `subagents/` |
| **Out of scope (this pass)** | Subagents **05, 09, 10, 11, 12** — cited only where overlapping IDs appear in master report or H16/A01 |
| **Master report** | [`PROJECTFLOW_FULL_SYSTEM_AUDIT_2026-10.md`](../PROJECTFLOW_FULL_SYSTEM_AUDIT_2026-10.md) |
| **Method** | Extract **HIGH / BLOCKER** and cross-cutting **MEDIUM** findings per agent → static grep/read at HEAD → assign **resolution class** (below) |

---

## 1. Classification taxonomy (Phase 1)

| Class | Meaning | Typical next phase |
|-------|---------|-------------------|
| **CONFIRMED @ HEAD** | Subagent claim matches current source (file/line behavior verified) | Fix, doc, or accept as design in Phase 2 |
| **CONFIRMED LOGIC GAP** | App and SQL intentionally differ; weakness is real but not necessarily a runtime bug in app-only path | RLS/migration bundle or app hardening |
| **CONFIRMED (INTENTIONAL)** | Code/comments/tests document warn-only or parallel models by design | Product copy / training; optional hardening |
| **CONFIRMED (SCHEMA–CODE MISMATCH)** | Repo migration/SQL and application SQL disagree; **breaks after apply** or silent null | Code + migration alignment before Owner apply |
| **DEPLOY / ENV UNKNOWN** | True in repo; Production or cron env **not readable** in this pass | Owner confirms `schema_migrations`, Vercel env |
| **PRODUCT GAP** | Missing UX or feature vs plan; backend may exist | Phase 2 product scope |
| **TEST / DOC DRIFT** | Implementation changed; test, plan YAML, or doc stale | Update test/doc; not necessarily product bug |
| **NOT VERIFIED @ HEAD** | Finding is about E2E/browser/prod; no re-run in Phase 1 | Harness / smoke in later phase |
| **REFUTED @ HEAD** | Subagent or prior audit claim contradicted by current code | Downgrade or close in master ledger |

**Severity** in tables below is the **subagent-reported** severity unless reclassified in the **Phase 1 class** column.

---

## 2. Cross-domain themes (11 agents)

### 2.1 Production migration truth vs repo HEAD

| Theme | Agents | Representative IDs | Phase 1 @ HEAD |
|-------|--------|-------------------|----------------|
| **24–25 migrations marked `PREPARED ONLY`** in SQL headers | A01, E13, T07, H16 | A01-001, A01-004, E13-001, T07-005, H16-006 | **DEPLOY / ENV UNKNOWN** for Production; **CONFIRMED @ HEAD** that headers exist (`rg PREPARED ONLY` → **25** files under `drizzle/migrations/`) |
| **0179 Connected ProjectFlow** not Owner-applied | H16, A01 | H16-006, A01-015 | **CONFIRMED @ HEAD** — `0179_connected_projects.sql` line 2: `PREPARED ONLY` |
| **0174 audit/contracts SELECT hardening** | A01 | A01-002 | **CONFIRMED LOGIC GAP** on baseline `0001` policies; fix in **0174** (also PREPARED ONLY) |
| **0173 FORCE RLS five tables** | A01, E13 | A01-016, E13-002 | Same bundle as above — **DEPLOY / ENV UNKNOWN** on Production |

**Integrator note:** Until Owner confirms Production `schema_migrations`, treat **DG execution (0163–0165)**, **connected projects (0179)**, **task scale indexes (0177)**, and **RLS hardening (0173–0174)** as **code-ready / deploy-unproven**.

### 2.2 Schema–code mismatch (Mode B connected projects)

Subagent **05** is out of scope for this document’s primary read set, but **A01-015**, **H16-006**, and master **K05-001/002** overlap agents **01** and **16**.

| Claim | Phase 1 @ HEAD | Evidence |
|-------|----------------|----------|
| Mapping query selects `m.vendor_id` on `connected_project_mappings` | **CONFIRMED (SCHEMA–CODE MISMATCH)** | `mapping.repository.ts` L58; table in `0179` has **no** `vendor_id` (column on `engagement_connection_invitations` L23) |
| Status filter uses `'accepted'`, `'sync_degraded'` | **CONFIRMED (SCHEMA–CODE MISMATCH)** | Repository L70: `in ('accepted', 'provisioning', 'active', 'sync_degraded')`; CHECK L99–100: `pending`, `provisioning`, `active`, `failed`, `revoked` |
| Missing column → silent `null` mapping | **CONFIRMED @ HEAD** | `isMissingRelationError` treats `42703` like `42P01` (L35–38, L76–77) |

### 2.3 Dual stacks (field-ops vs DG execution)

| Claim | Agents | Phase 1 @ HEAD |
|-------|--------|----------------|
| Classic workspace links point at **field-ops** inspections/logs/punch | E13, P03 | **CONFIRMED @ HEAD** — `workspace-links.ts` L150–160 → `/field-ops/...` |
| DG GC routes use `/projects/{id}/inspections`, defects, RFI, etc. | E13, D04 | **CONFIRMED @ HEAD** — execution nav gated by `isDeveloperGcMode` (`select-execution-nav-links.ts` L64–65) |
| Execution nav hidden for non–Developer/GC profiles | E13 | **CONFIRMED (INTENTIONAL)** — same gate |

### 2.4 Dual roster (workforce vs project capabilities)

| Claim | Agents | Phase 1 @ HEAD |
|-------|--------|----------------|
| Workforce `addProjectTeamMember` does not create `project_members` | R06, W08 (labor context) | **CONFIRMED @ HEAD** — `project-team.ts` L68–114 inserts assignment only; no `project-team` import |
| RFI assignees from `listProjectTeam` (capabilities) | R06 | **CONFIRMED @ HEAD** — `rfi/application/support.ts` L55, L67 |

### 2.5 Financial / overlap guards (touchpoint with agent 09)

Agent **09** not in read set; agents **08** and master cite overlap economics.

| Claim | Phase 1 @ HEAD | Evidence |
|-------|----------------|----------|
| Overlap assert helpers are no-ops | **CONFIRMED (INTENTIONAL)** per comment | `expense-ap-overlap.ts` L102–111: “warning only… must not block” |
| Partial bill match + full bill recognition risk | **CONFIRMED @ HEAD** (model) | `loadRecognizedVendorBillsForProject` loads recognized bills by status/project; compose uses `buildLinkedExpenseDeductions` — subagent **V09-002** partial-inflation path **not disproven** at HEAD (needs integration proof) |

### 2.6 Automation & cron (agent 14)

| Claim | Phase 1 @ HEAD | Evidence |
|-------|----------------|----------|
| No Vercel cron for DG events drain | **CONFIRMED @ HEAD** | `vercel.json` — 3 crons: ocr, ops, sumit-expense only |
| Cross-org outbox retry not awaited in ops worker | **CONFIRMED @ HEAD** | `daily-ops-worker.ts` L198–200: `.catch(...)` without `await` |
| Missing cron secret → 401 | **CONFIRMED @ HEAD** | `internal-worker-auth.ts` L6–7: no secret → `false` |
| No kick on `enqueueCrossOrgSyncEvent` | **CONFIRMED @ HEAD** | `sync-claim-cash-projection.ts` enqueues; no kick helper in connected-projects grep |

### 2.7 Plan / doc drift (agent 16)

| Claim | Phase 1 @ HEAD |
|-------|----------------|
| Multiple `.cursor/plans/*.plan.md` todos still `pending` while code shipped | **CONFIRMED @ HEAD** (H16-001, H16-010, H16-011) — spot-check: UWM/quick capture/DG plans vs modules at HEAD |
| `docs/implementation/CURRENT-IMPLEMENTATION-STATUS.md` stale (Aug 2026) | **CONFIRMED @ HEAD** (H16-002) |
| Oct-9 “NOT READY” not cleared by full re-run on this SHA | **NOT VERIFIED @ HEAD** (H16-009) — Phase 1 did not execute full Vitest/Playwright |

---

## 3. Per-agent top findings — cross-check @ HEAD

### AGENT_01 — Architecture / DB / security

| ID | Sev | Subagent title | Phase 1 class | Cross-check notes |
|----|-----|----------------|---------------|-------------------|
| **A01-001** | BLOCKER (prod) | Production migration apply unknown | **DEPLOY / ENV UNKNOWN** | No Production DB read in Phase 1; journal through **0179** at HEAD |
| **A01-002** | HIGH | Audit events SELECT vs `audit.read` | **CONFIRMED LOGIC GAP** | Baseline policy in `0001_rls_security.sql`; remediation in **0174** (PREPARED ONLY) |
| **A01-004** | HIGH | PREPARED ONLY backlog | **CONFIRMED @ HEAD** | 25 migration files with header |
| **A01-006** | LOW | Duplicate schema export | **CONFIRMED @ HEAD** | `drizzle/schema/index.ts` L34 + L78 |
| **A01-008** | INFO | Org switch membership enforced | **CONFIRMED @ HEAD** | Per A01 narrative (`setActiveOrganization`) |
| **A01-012** | INFO | Worker auth fails closed | **CONFIRMED @ HEAD** | `internal-worker-auth.ts` |
| **A01-015** | HIGH | 0179 cross-org RLS model in SQL | **CONFIRMED @ HEAD** (SQL); **CONFIRMED (SCHEMA–CODE MISMATCH)** with mapping repo | See §2.2 |
| **A01-016** | MEDIUM | 0173 FORCE RLS | **DEPLOY / ENV UNKNOWN** | File exists, PREPARED ONLY |

### AGENT_02 — CRM / sales

| ID | Sev | Subagent title | Phase 1 class | Cross-check notes |
|----|-----|----------------|---------------|-------------------|
| **C02-001** | INFO | Two quote systems by design | **CONFIRMED (INTENTIONAL)** | Static architecture |
| **C02-007** | MEDIUM | No CRM→project Playwright | **NOT VERIFIED @ HEAD** | No E2E re-run |
| **C02-008** | INFO | Prior CRM-001 refuted | **REFUTED @ HEAD** (prior audit) | `convert-quote.ts` calls `markLinkedOpportunityWon` L269+ without CRM-manage gate in that path |
| **C02-009** | INFO | Prior CRM-002 resolved | **CONFIRMED @ HEAD** | Per integration cited in report |
| **C02-012** | MEDIUM | Orphan `convertWonOpportunityAction` | **CONFIRMED @ HEAD** | Grep: UI uses product quote path (per subagent) |
| **C02-014** | MEDIUM | CRM RLS membership-wide | **CONFIRMED LOGIC GAP** | App enforces `crm.read`/`crm.manage`; SQL pattern per `0009` |

### AGENT_03 — Standard projects

| ID | Sev | Subagent title | Phase 1 class | Cross-check notes |
|----|-----|----------------|---------------|-------------------|
| **P03-001** | MEDIUM | Closeout not in money-chain E2E | **NOT VERIFIED @ HEAD** | Spec gap; closeout actions exist in module map |
| **P03-002** | MEDIUM | Dual team UX (tab vs `/team`) | **CONFIRMED @ HEAD** | Documented in report §4 |
| **P03-004** | MEDIUM | 52 deep routes not UI-verified | **NOT VERIFIED @ HEAD** | Inventory static |
| **P03-012** | INFO | Overview/financials same compose | **CONFIRMED @ HEAD** | `get-project-overview-payload` / panel comments |
| **P03-013** | MEDIUM | Historical money-chain env fail | **TEST / DOC DRIFT** | Oct ops doc; not re-run here |

### AGENT_04 — Developer / GC

| ID | Sev | Subagent title | Phase 1 class | Cross-check notes |
|----|-----|----------------|---------------|-------------------|
| **D04-001** | HIGH | Owner tender UI read-only | **CONFIRMED @ HEAD** | `createTenderPackage` / `awardTenderToSubcontract` in `contractor-procurement/application/tenders.ts`; **no** matches under `src/app` for those symbols |
| **D04-002** | HIGH | Award does not seed agreement value | **CONFIRMED @ HEAD** | Per integration narrative in report |
| **D04-003** | MEDIUM | BOQ vs DG claims parallel | **CONFIRMED (INTENTIONAL)** | Architecture split |
| **D04-007** | MEDIUM | No full commercial E2E | **NOT VERIFIED @ HEAD** | |

### AGENT_06 — Consultants / roles

| ID | Sev | Subagent title | Phase 1 class | Cross-check notes |
|----|-----|----------------|---------------|-------------------|
| **R06-001** | HIGH | Dual roster, no sync | **CONFIRMED @ HEAD** | §2.4 |
| **R06-006** | MEDIUM | Submittals = contractor packages | **CONFIRMED (INTENTIONAL)** | Product model |
| **R06-014** | MEDIUM | No retainer product | **PRODUCT GAP** | No contradicting module found (per subagent) |
| **R06-016** | LOW | No consultant persona E2E | **NOT VERIFIED @ HEAD** | |

### AGENT_07 — Tasks / planner

| ID | Sev | Subagent title | Phase 1 class | Cross-check notes |
|----|-----|----------------|---------------|-------------------|
| **T07-001** | HIGH | No org-wide work List/Grid lens | **CONFIRMED @ HEAD** | Routes under `work/`: `page`, `board`, `calendar`, `timeline`, `insights` — **no** `work/list` or grid lens |
| **T07-002** | HIGH | Dependencies not enforced on status change | **CONFIRMED @ HEAD** | `update-task.ts` L91–101: lifecycle transition only; no dependency read |
| **T07-005** | MEDIUM | 0177 indexes PREPARED ONLY | **CONFIRMED @ HEAD** | Migration header |
| **T07-014** | INFO | Planner+ items in code | **CONFIRMED @ HEAD** | Subagent static verification @ baseline |

### AGENT_08 — Workforce / payroll

| ID | Sev | Subagent title | Phase 1 class | Cross-check notes |
|----|-----|----------------|---------------|-------------------|
| **W08-001** | INFO+ | Monthly employer actual implemented | **CONFIRMED @ HEAD** | Per subagent test refs (not re-run) |
| **W08-007** | MEDIUM | Approve timesheet → NotFound vs AuthZ | **CONFIRMED @ HEAD** | Behavior cited; semantics dispute |
| **W08-008** | HIGH | Double-count labor + payroll expenses | **CONFIRMED (INTENTIONAL)** with guards | `labor-expense-integrity` + classification; misclassification risk remains |
| **W08-012** | MEDIUM | Attendance atomicity tests vs draft default | **TEST / DOC DRIFT** | Product default draft; tests may expect auto-approve |

### AGENT_13 — Execution / quality

| ID | Sev | Subagent title | Phase 1 class | Cross-check notes |
|----|-----|----------------|---------------|-------------------|
| **E13-001** | HIGH | DG migrations 0163–0165 PREPARED ONLY | **CONFIRMED @ HEAD** + **DEPLOY / ENV UNKNOWN** | Headers in named files |
| **E13-003** | HIGH | Two inspection/defect worlds | **CONFIRMED @ HEAD** | §2.3 |
| **E13-004** | MEDIUM | Flat nav vs hub capability mismatch | **CONFIRMED @ HEAD** | Catalog vs hub `anyOf` (static per report) |
| **E13-005** | MEDIUM | Execution nav GC-only | **CONFIRMED (INTENTIONAL)** | §2.3 |
| **E13-019** | HIGH | E2E smoke skips most execution entities | **NOT VERIFIED @ HEAD** | Harness scope per report |

### AGENT_14 — Automations / cron

| ID | Sev | Subagent title | Phase 1 class | Cross-check notes |
|----|-----|----------------|---------------|-------------------|
| **O14-001** | HIGH | No DG events cron | **CONFIRMED @ HEAD** | §2.6 |
| **O14-005** | HIGH | Cross-org outbox daily-only, no enqueue kick | **CONFIRMED @ HEAD** | §2.6 |
| **O14-006** | MEDIUM | Outbox retry not awaited | **CONFIRMED @ HEAD** | §2.6 |
| **O14-009** | HIGH | Missing cron secret → total automation failure | **CONFIRMED @ HEAD** | §2.6 |
| **O14-012** | MEDIUM | Document orphan cleanup not in ops bundle | **CONFIRMED @ HEAD** | `retryFailedDocumentCleanups` absent from `daily-ops-worker.ts` imports/jobs (static) |

### AGENT_15 — UI / navigation / mobile

| ID | Sev | Subagent title | Phase 1 class | Cross-check notes |
|----|-----|----------------|---------------|-------------------|
| **U15-001** | HIGH | Contractor connect CTA → owner `(app)` without handoff | **CONFIRMED @ HEAD** | `contractor/(portal)/more/page.tsx` L106: `href="/projects/connect-developer"`; target uses `withOrgContext` |
| **U15-002** | MEDIUM | PWA English-only; owner `start_url` | **CONFIRMED @ HEAD** | `web-manifest.ts` behavior per report |
| **U15-008–011** | INFO | Nav parity / locale primitives | **CONFIRMED @ HEAD** | Static checks in subagent |

### AGENT_16 — Historical / unfinished

| ID | Sev | Subagent title | Phase 1 class | Cross-check notes |
|----|-----|----------------|---------------|-------------------|
| **H16-001** | HIGH | Plan YAML stale vs shipped code | **CONFIRMED @ HEAD** | 16 plans inventoried in report |
| **H16-002** | MEDIUM | `CURRENT-IMPLEMENTATION-STATUS.md` obsolete | **CONFIRMED @ HEAD** | Dated Aug 2026 in doc |
| **H16-006** | HIGH | 0179 prepared, not applied | **CONFIRMED @ HEAD** | §2.1 |
| **H16-009** | HIGH | Oct-9 NOT READY not cleared on SHA | **NOT VERIFIED @ HEAD** | No full CI re-run in Phase 1 |
| **H16-010** | HIGH | UWM plan says “planning only” | **CONFIRMED @ HEAD** | `src/modules/tasks` + migrations exist vs plan text |

---

## 4. Master report alignment & lead items

| Master / lead ID | Source agents | Phase 1 @ HEAD |
|------------------|---------------|----------------|
| **K05-001 / K05-002** (not in read set 05) | A01, H16 | **CONFIRMED (SCHEMA–CODE MISMATCH)** — §2.2 |
| **LEAD-001** lifecycle locale | U15 adjacent | **TEST / DOC DRIFT** — test expects `^/en/contractor/activate` (`lifecycle.test.ts` L112); invite uses org `locale: 'he-IL'` (L100) and `linkLocale: locale` in `manage-contractor-access.ts` L468 |
| **B10-001** (agent 10) | Financial bridge touch | **CONFIRMED @ HEAD** — `build-statutory-bridge.ts` L57: `lineNet: line.lineTotal`; billing lines built with `amounts.totalAmount` in `create-billing-record.ts` L72 |
| **R06-001** | 06, master Part 5 | **CONFIRMED @ HEAD** |
| **D04-001** | 04, master Part 4 | **CONFIRMED @ HEAD** |
| **O14-001 / 005 / 009** | 14, master Part 5 | **CONFIRMED @ HEAD** |
| **U15-001** | 15, master Part 5 | **CONFIRMED @ HEAD** |

---

## 5. Phase 1 rollup counts (top-tier only)

Counts include **BLOCKER/HIGH** from the 11 agents plus **lead/master HIGH** cross-refs verified above.

| Phase 1 class | Count (top-tier items reviewed) |
|---------------|----------------------------------|
| **CONFIRMED @ HEAD** | 22 |
| **CONFIRMED (SCHEMA–CODE MISMATCH)** | 3 (K05 cluster + mapping null behavior) |
| **CONFIRMED LOGIC GAP** | 3 (A01-002, C02-014, overlap RLS pattern) |
| **CONFIRMED (INTENTIONAL)** | 6 |
| **DEPLOY / ENV UNKNOWN** | 4 |
| **PRODUCT GAP** | 2 (D04-001 UI, R06-014 retainer) |
| **TEST / DOC DRIFT** | 3 (LEAD-001, W08-012, H16 plan/docs) |
| **NOT VERIFIED @ HEAD** | 8 (E2E/browser/prod re-run gaps) |
| **REFUTED @ HEAD** | 1 (C02-008 vs old CRM-001) |

---

## 6. Owner / integrator decisions (no action taken in Phase 1)

1. **Production migration ledger** — Confirm whether Production includes **0173–0179** (and DG **0163–0165**) before claiming GC, connected Mode B, or hardened audit RLS (**A01-001**, **E13-001**, **H16-006**).
2. **0179 apply order** — Do **not** apply **0179** as-is without resolving **mapping `vendor_id` + status vocabulary** vs `mapping.repository.ts` (**schema–code mismatch**).
3. **Cron secrets & Hobby limits** — Validate `CRON_SECRET` / worker secrets on Vercel and accept **daily-only** automation SLA (**O14-001**, **O14-009**).
4. **Phase 2 fix prioritization** — Suggested buckets from this cross-ref only: **(A)** schema–code Mode B, **(B)** deploy bundle 0173–0179, **(C)** financial overlap semantics (with agent 09), **(D)** tender owner UI (D04-001), **(E)** contractor connect handoff (U15-001), **(F)** plan/doc hygiene (H16).

---

## 7. Artifacts & next phase

| Artifact | Path |
|----------|------|
| This cross-ref | `docs/audits/2026-10-full-system-audit/resolution/PHASE1_domain_crossref.md` |
| Subagent sources | `docs/audits/2026-10-full-system-audit/subagents/AGENT_{01,02,03,04,06,07,08,13,14,15,16}_*.md` |
| Suggested Phase 2 | Targeted fixes + optional integration re-runs per class (**CONFIRMED** first, **SCHEMA–CODE** before any 0179 apply) |

---

*End of Resolution Phase 1 — domain cross-reference. Audit only; no repository mutations beyond this document.*
