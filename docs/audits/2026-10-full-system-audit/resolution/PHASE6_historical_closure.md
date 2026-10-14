# Phase 6 — Historical & unfinished work closure

| Field | Value |
|-------|--------|
| **Phase** | RESOLUTION 6 (historical / plan registry) |
| **Source audit** | [AGENT_16_historical_unfinished.md](../subagents/AGENT_16_historical_unfinished.md) |
| **Plan corpus** | 16 × `.cursor/plans/*.plan.md` |
| **Tree baseline** | Current workspace (post–Oct-2026 audit wave; AGENT_16 cited `35e2ff0f`) |
| **Mode** | Audit / classification only — **no code changes** |

## Disposition legend

| Status | Meaning |
|--------|---------|
| **IMPLEMENTED_WITH_EVIDENCE** | Shipped in `src/`, migrations, and/or targeted tests; plan YAML may still say `pending`. |
| **OWNER_DEFER** | Explicit Owner deferral, external dependency, or **prepared SQL not authorized for Production/shared DB apply**. |
| **STILL_OPEN** | Material gap remains in product, verification, or release gates. |

**Priority:** P0 (release / security / schema-dependent prod) · P1 (product or compliance gap) · P2 (verification / UX polish / doc hygiene) · INFO (intentional defer).

---

## Executive summary

| Metric | Count |
|--------|------:|
| Plans with **zero** open YAML todos | 4 |
| Plans with **only** stale open todos (work largely shipped) | 8 |
| Plans with **genuine** remaining scope | 4 |
| Open YAML todo lines classified (pending + in_progress) | **106** |
| → **IMPLEMENTED_WITH_EVIDENCE** | 62 |
| → **OWNER_DEFER** | 12 |
| → **STILL_OPEN** | 32 |

**Headline:** Plan registry drift (**H16-001**) dominates: most “open” todos are **IMPLEMENTED_WITH_EVIDENCE**. Genuinely open work clusters on **Mode B connected-project sync breadth**, **SUMIT live milestones**, **full go-live verification (H16-009)**, **calendar dedupe**, **My Work saved views**, and **i18n quality gates beyond key parity**.

**Plans with no open items (YAML complete):** `complete_implementation_master.plan.md`, `employee_contractor_all_roles_completion_master.plan.md`, `gc_execution_layer_ux.plan.md`, `planner_plus_multi_industry_master.plan.md`.

---

## 1. Open plan todos — by plan

### 1.1 `developer_gc_subcontractor_management.plan.md` (1 in_progress, 13 pending)

| Todo ID | Priority | Disposition | Evidence / notes |
|---------|----------|-------------|------------------|
| `w1-project-capabilities` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `assertProjectCapability`, `src/modules/project-team/**`; migration `0154_project_team_capabilities.sql`; widespread DG module usage. YAML stuck `in_progress`. |
| `w1b-financial-projection` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `0168_dg_financial_projection_rls.sql`; secure money views; subcontract-claims capability gates. |
| `w2-external-identity` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `0156_dg_external_identity.sql`; `src/modules/contractor-access/**`. |
| `w3-project-profile-locations` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `0157_dg_project_profile.sql`; project profile / locations modules. |
| `w4-subcontract-core` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `0158_dg_subcontract_core.sql`. |
| `w5-claims` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `0159_dg_claims.sql`; `src/modules/subcontract-claims/**`. |
| `w6-collab-tasks-events` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `0160_dg_collaboration_tasks.sql`, `0161_dg_coordination_events.sql`; `createLinkedTask` in collaboration module. |
| `w7-documents-plans` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `0162_dg_documents_plans.sql`. |
| `w8-quality-field` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `0163`–`0166` RFI/submittals/inspections/defects/compliance migrations + modules. |
| `w9-procurement-closeout` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `0167_dg_procurement_closeout.sql`. |
| `w10-surfaces` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | Contractor portal routes, execution/cost-control surfaces; plan body “HALT” narrative marks tracks DONE. |
| `w11-notifications-cc` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `0169_dg_notifications_command_center.sql`; DG Command Center sources registered. |
| `w12-i18n-security-tests` | P1 | **STILL_OPEN** | DG i18n parity unit tests exist; **no** single Playwright tender→claim journey; matrix spread across integration tests (AGENT_04). |
| `w13-migration-consolidation` | P2 | **STILL_OPEN** | Migrations **0154–0170** live in journal as wave files; “single consolidated migration + Final Gate report” not closed in plan YAML. |

---

### 1.2 `contractor_portal_product_completion.plan.md` (14 pending)

| Todo ID | Priority | Disposition | Evidence / notes |
|---------|----------|-------------|------------------|
| `wave0-portal-tabs` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `CONTRACTOR_MOBILE_TABS` (5 tabs); hub routes e.g. `src/app/.../contractor/(portal)/work/page.tsx`. |
| `wave0-portal-link-grant` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `linkExisting` + username flow in `manage-contractor-access.ts`. |
| `wave1-connection-schema` | P0 | **IMPLEMENTED_WITH_EVIDENCE** | `drizzle/migrations/0179_connected_projects.sql` (**PREPARED ONLY** header). |
| `wave1-connection-schema` (Production apply) | P0 | **OWNER_DEFER** | Plan + migration: **Production SQL NOT authorized** until Owner explicit apply. |
| `wave1-connection-code-issue` | P1 | **IMPLEMENTED_WITH_EVIDENCE** | `create-invitation.ts`; developer connection UI panels. |
| `wave1-connection-redeem` | P1 | **IMPLEMENTED_WITH_EVIDENCE** | `accept-code.ts`, `provision-contractor-project.ts`, `preview-code.ts`. |
| `wave1-sync-outbox` | P1 | **IMPLEMENTED_WITH_EVIDENCE** (partial) | `sync-outbox.repository.ts`, `retry-claim-cash-projection-outbox.ts`, daily ops hook — **allowlisted** claim cash projection events only (**H16-007**). |
| `wave1-claims-line-items` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | Claim lines / certify / reassess in `subcontract-claims` (shared guest + registered engine). |
| `wave1-cash-flow-guest` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `contractor-portal/.../providers/cash-flow.ts`; FINANCE tab grouping in `mobile-tabs.ts`. |
| `wave2-sync-domains` | P1 | **STILL_OPEN** | No broad contract/changes/tasks/RFI sync handlers; only cash-projection outbox path. |
| `wave2-cash-flow-connected` | P1 | **STILL_OPEN** | Connected-org forecast rows depend on **0179 apply** + fuller sync; projection code exists but schema-dependent. |
| `wave2-developer-ux` | P2 | **IMPLEMENTED_WITH_EVIDENCE** (partial) | `developer-connection-panel.tsx`, `developer-connection-section.tsx`, workflow nav. |
| `wave2-contractor-ux` | P2 | **IMPLEMENTED_WITH_EVIDENCE** (partial) | `connect-developer-form.tsx`, banners, provisioning retry — full “connection health” matrix not proven. |
| `wave3-guest-conversion` | P1 | **STILL_OPEN** | No guest→PF org registration + engagement link flow in `connected-projects`. |
| `wave3-finite-tests` | P1 | **STILL_OPEN** | **5** unit files under `tests/unit/connected-projects/`; **0** integration suite; plan target 16+15 not met. |

---

### 1.3 `universal_work_management_fe4f363f.plan.md` (12 pending)

Plan body still says “planning only”; UWM is shipped (**H16-010**).

| Todo ID | Priority | Disposition | Evidence / notes |
|---------|----------|-------------|------------------|
| `wave0-foundation` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | Migrations `0100_uwm_tasks_core.sql` … `0115_*`; `src/modules/tasks/**`. |
| `agentA-task-core` through `agentH-employee-permissions` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | Tasks module: board/list/calendar/timeline, comments, templates, permissions, employee paths. |
| `agentI-operations-adoption` | P2 | **STILL_OPEN** | Operations ↔ tasks adoption partial; not a dedicated closure artifact in plan. |
| `wave3-polish` | P2 | **STILL_OPEN** | Stale “Agent A stub” TODO comments remain in board shells (**H16-003**). |
| `wave4-qa-release` | P0 | **STILL_OPEN** | No fresh full CI-equivalent + Playwright matrix superseding Oct-9 **NOT READY** (**H16-009**). |

---

### 1.4 `quick_capture_smart_inbox.plan.md` (9 pending)

| Todo ID | Priority | Disposition | Evidence / notes |
|---------|----------|-------------|------------------|
| `schema-preflight` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `0131_quick_capture_inbox.sql`. |
| `capture-upload` through `notify-inbox` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | Full `src/modules/quick-capture/**` (submit, process, OCR poll, inbox, review). |
| `relocate-helper` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | Capture → documents / financial routing in application layer. |
| `i18n-4locales` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `src/locales/{he-IL,en,ar,ru}/quickCapture.json` (and related nav/dashboard keys). |
| `targeted-tests` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | **11** files under `tests/unit/quick-capture/` (**H16-011**). |

---

### 1.5 `tasks_uwm_scale_pagination.plan.md` (6 pending)

Annex; authority = Planner+ master (completed).

| Todo ID | Priority | Disposition | Evidence / notes |
|---------|----------|-------------|------------------|
| `lazy-my-work-tab` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `/work/page.tsx` lazy active view; `getMyWorkPage` + `loadMoreMyWorkAction`. |
| `assigned-to-me-join` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `my-work.repository.ts` `innerJoin(taskAssignees)` + limit+1. |
| `following-view-join` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `innerJoin(taskFollowers)` in same file. |
| `workspace-resolve-once` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | Workspace IDs passed in `MyWorkQueryOptions` from application layer. |
| `migration-0177-prepared` | P0 | **IMPLEMENTED_WITH_EVIDENCE** | `0177_tasks_uwm_scale_indexes.sql` on disk. |
| `migration-0177-prepared` (Production apply) | P0 | **OWNER_DEFER** | Plan: prepare only; separate Owner approval to apply. |
| `assignee-filter-sql` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | Assignee/label filters in SQL `WHERE` in `tasks.repository.ts`. |

---

### 1.6 `work_hub_planner_plus_wave1.plan.md` (7 pending)

| Todo ID | Priority | Disposition | Evidence / notes |
|---------|----------|-------------|------------------|
| `lazy-my-work` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | Same as scale annex. |
| `work-shell-filters` | P2 | **IMPLEMENTED_WITH_EVIDENCE** (partial) | `work/layout.tsx`, `WorkHubNav`, `WORK_TASK_QUERY_KEYS`; filters on board/calendar/timeline, not full My Work URL filter bar. |
| `saved-views-work` | P2 | **IMPLEMENTED_WITH_EVIDENCE** (partial) | `WorkLensChrome` + `SavedListViewsBar` on board/calendar/timeline; **not** on `/work` My Work hub (**H16-012**). |
| `client-filter-tasks` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `clientId` filter in `tasks.repository.ts`. |
| `access-parity` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `accessibleProjectIds` in `queryMyWorkPage` base conditions. |
| `my-work-tz-completed` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | Org `today` passed; `completed` view 30d window; `upcoming` 14d in repository. |
| `mobile-tab-labels` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `ViewTabBar` responsive labels in `my-work-view.tsx`. |

---

### 1.7 `work_hub_saved_views_filters.plan.md` (8 pending)

| Todo ID | Priority | Disposition | Evidence / notes |
|---------|----------|-------------|------------------|
| `sync-saved-list-key-tasks` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `'tasks'` in `SAVED_LIST_KEYS` (`tenancy/domain/saved-list-views.ts`). |
| `work-filter-contract` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `work-task-filter-keys.ts`. |
| `url-filters-repository` | P2 | **IMPLEMENTED_WITH_EVIDENCE** (partial) | URL params + `listAccessibleTasksPage` on work lenses; My Work tab lacks same filter chrome. |
| `saved-views-bar-work` | P2 | **IMPLEMENTED_WITH_EVIDENCE** (partial) | Board/calendar/timeline only. |
| `work-hub-nav-context` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `work-hub-nav.tsx` preserves query across tabs. |
| `client-filter-ui` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `work-task-filters-bar.tsx` client picker pattern. |
| `load-more-filters` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `loadMoreWorkLensTasksAction` passes filter snapshot (`work/board/_global-board-view.tsx`). |
| `i18n-acceptance` | P2 | **STILL_OPEN** | Manual §O acceptance not recorded; strings largely present in `tasks.json`. |

---

### 1.8 `task_integration_planning_calendar.plan.md` (6 pending)

| Todo ID | Priority | Disposition | Evidence / notes |
|---------|----------|-------------|------------------|
| `drizzle-task-id` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `drizzle/schema/planning.ts` `taskId`; migration `0110` family. |
| `planning-ui-link` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `planning-write-panel.tsx` link/unlink actions; schedule panel wiring. |
| `dedupe-today` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `dedupeCommandCenterItems` + `get-actionable-inbox.ts`; unit tests `tests/unit/command-center/dedupe-command-center-items.test.ts`. |
| `dedupe-calendar` | P1 | **STILL_OPEN** | No calendar federation suppress when planning row has `task_id` (plan § current state still valid). |
| `execution-links` | P2 | **IMPLEMENTED_WITH_EVIDENCE** (partial) | `TaskRelatedWorkSection`, `list-task-related-work.ts`; `createLinkedTask` on RFIs/submittals/etc. — not all execution types expose “create linked task” from task detail. |
| `tests-acceptance` | P2 | **STILL_OPEN** | Dedupe tested; PM-005/PM-011 doc refresh + full acceptance bundle not closed. |

---

### 1.9 `multi_industry_profiles_nav.plan.md` (8 pending)

| Todo ID | Priority | Disposition | Evidence / notes |
|---------|----------|-------------|------------------|
| `profile-audit-doc` | P2 | **STILL_OPEN** | DEVELOPER_GC vs GC mode doc in implementation notes not marked done. |
| `consulting-uwm-modules` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | Profiles incl. `GENERAL_CONTRACTOR`, `ARCHITECT`, consultants in `business-profiles.ts`. |
| `persona-nav-portfolio` | P2 | **STILL_OPEN** | Persona nav tuning for consulting/architecture not fully verified vs plan spec. |
| `fab-task-quick-create` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `buildQuickCreateActions` task entry; `/work` FAB `MyWorkQuickCreate`. |
| `gc-execution-defaults` | P2 | **STILL_OPEN** | GC create guidance / smart defaults — partial via `management-mode` / execution hubs. |
| `profile-task-template-seeds` | P2 | **STILL_OPEN** | `seedBusinessProfileSetup` seeds structure; per-profile **task template** seed hook not clearly closed. |
| `consultant-scale-ux` | P1 | **STILL_OPEN** | Saved views on board/calendar/timeline but **not** My Work hub; portfolio pagination reuse open. |
| `tests-acceptance` | P2 | **STILL_OPEN** | No dedicated multi-industry acceptance test bundle cited in plan. |

---

### 1.10 `planner_plus_release.plan.md` (7 pending)

Superseded as **authority** by `planner_plus_multi_industry_master.plan.md` (master todos **completed**); annex release checklist still open.

| Todo ID | Priority | Disposition | Evidence / notes |
|---------|----------|-------------|------------------|
| `wp-a-0174-review` | P2 | **STILL_OPEN** | Regression-only pass not logged on current SHA. |
| `wp-a-sec004-routes` | P1 | **IMPLEMENTED_WITH_EVIDENCE** (partial) | `requireDeveloperGcExecutionPage` + `sec-004-execution-route-pages.test.ts`; deep-link browser proof **STILL_OPEN**. |
| `wp-b-my-work-rbac` | P1 | **STILL_OPEN** | RBAC invariants documented/enforced in integration test per plan — not closed. |
| `wp-c-contractor-regression` | P1 | **STILL_OPEN** | Re-run contractor integration slice before release — not evidenced on current SHA. |
| `wp-d-mobile-rtl` | P2 | **STILL_OPEN** | Manual RTL / My Work mobile smoke not recorded. |
| `wp-e-workload-reassign` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `workload-expandable-rows.tsx` → `reassignWorkloadTaskAction` → `addAssignee`/`removeAssignee`. |
| `release-preflight` | P0 | **STILL_OPEN** | One green CI-equivalent preflight + deploy verification (**H16-009**). |

---

### 1.11 `planner_plus_release.plan.md` — annex note

Treat remaining annex todos as **release verification debt**, not missing core Planner+ features (master plan marks WP-A–F **completed**).

---

### 1.12 `ar_ru_full_i18n.plan.md` (10 pending)

Structural key parity **EN ↔ AR ↔ RU** reported **0 missing keys** (88 namespaces) — **H16-008**.

| Todo ID | Priority | Disposition | Evidence / notes |
|---------|----------|-------------|------------------|
| `phase0-glossary` | P2 | **STILL_OPEN** | Glossaries / generation script not tracked as done in repo metadata. |
| `phase1-infra` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `LOCALES` includes `ar`, `ru` in `src/shared/i18n/config.ts`. |
| `phase2-ar-catalogs` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `src/locales/ar/*.json` (100+ files). |
| `phase2-ru-catalogs` | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `src/locales/ru/*.json`. |
| `phase3-owner-ui` | P1 | **STILL_OPEN** | Overflow/RTL route validation at scale not closed in plan. |
| `phase4-employee-ui` | P1 | **STILL_OPEN** | Employee AR/RU flow verification open. |
| `phase5-errors-reports` | P2 | **IMPLEMENTED_WITH_EVIDENCE** (partial) | Catalogs exist; extended test matrix open. |
| `phase6-fonts-pdf` | P1 | **STILL_OPEN** | Arabic/Russian PDF + print font hardening not plan-complete. |
| `phase7-tests-ci` | P1 | **STILL_OPEN** | 4-locale CI gates beyond parity scan. |
| `phase8-release-report` | P0 | **STILL_OPEN** | Owner-approved push + §31 final report. |

---

### 1.13 `sumit_integration_phase_0.plan.md` (5 pending)

| Todo ID | Priority | Disposition | Evidence / notes |
|---------|----------|-------------|------------------|
| `owner-test-org` | P0 | **OWNER_DEFER** | Owner must provision SUMIT test org + keys (never in git). |
| `milestone-b` | P0 | **STILL_OPEN** | Live test tax invoice + reconciliation; Milestone A + mocks shipped (**H16-005**). |
| `milestone-c-receipt` | P1 | **OWNER_DEFER** | Gated after Milestone B per plan. |
| `milestone-d-credit` | P1 | **OWNER_DEFER** | Gated after Milestone B. |
| `phase6-production` | P0 | **OWNER_DEFER** | Production phase explicitly out of cycle / external. |

---

## 2. AGENT_16 finding register — closure

| ID | Sev | Title | Phase 6 disposition |
|----|-----|-------|---------------------|
| **H16-001** | HIGH | Plan YAML stale vs shipped code | **STILL_OPEN** P2 — hygiene; 62 todos reclassified IMPLEMENTED above. |
| **H16-002** | MED | `CURRENT-IMPLEMENTATION-STATUS.md` obsolete (Aug 2026) | **STILL_OPEN** P2 — archive or pointer doc. |
| **H16-003** | LOW | Stale Agent A stub TODOs in board UI | **STILL_OPEN** P2 — comment cleanup only. |
| **H16-004** | INFO | Customer portal DEFER | **OWNER_DEFER** — `docs/product/portal-status.md`. |
| **H16-005** | MED | SUMIT Milestone B + production | **STILL_OPEN** P0 / **OWNER_DEFER** for keys — see §1.13. |
| **H16-006** | HIGH | `0179` prepared; Production apply not authorized | **IMPLEMENTED_WITH_EVIDENCE** (prep) + **OWNER_DEFER** (apply). |
| **H16-007** | MED | Connected-project sync scope partial | **STILL_OPEN** P1 — `wave2-sync-domains`. |
| **H16-008** | MED | AR/RU plan pending vs key parity | **IMPLEMENTED_WITH_EVIDENCE** (parity) + **STILL_OPEN** (fonts/PDF/CI). |
| **H16-009** | HIGH | Oct-9 NOT READY not cleared on current SHA | **STILL_OPEN** P0 — full preflight + targeted Playwright. |
| **H16-010** | HIGH | UWM plan “planning only” vs implemented | **IMPLEMENTED_WITH_EVIDENCE** — YAML reconciliation only. |
| **H16-011** | MED | Quick capture plan pending vs shipped | **IMPLEMENTED_WITH_EVIDENCE**. |
| **H16-012** | LOW | Saved views not on `/work` My Work | **STILL_OPEN** P2. |
| **H16-013** | LOW | E2E heavily skip-gated | **STILL_OPEN** P2 — env/harness dependent. |
| **H16-014** | INFO | OCR/banking stub-first | **OWNER_DEFER** / config — `OCR_INGESTION_ENABLED`, stub providers. |
| **H16-015** | MED | DG plan W2–W13 pending vs 0154–0170 | **IMPLEMENTED_WITH_EVIDENCE** for W1–W11; **STILL_OPEN** W12–W13. |

---

## 3. Non-plan historical items (AGENT_16 §4–§8)

| Item | Priority | Disposition | Notes |
|------|----------|-------------|-------|
| Customer portal (UI-001/002) | INFO | **OWNER_DEFER** | Master + `portal-status.md`. |
| Google/Outlook calendar (PM-012) | INFO | **OWNER_DEFER** | `calendar-four-lenses.md`; placeholder only. |
| OPS-B-002 month-close displacement | P1 | **IMPLEMENTED_WITH_EVIDENCE** | `tests/integration/audit-verification/ops-b-002-month-close-displacement.test.ts` — prod DB not re-verified. |
| OPS-B-003 RLS five tables | P0 | **IMPLEMENTED_WITH_EVIDENCE** | `0173_force_rls_five_tables.sql`; migrations test expects zero violations when applied. |
| UI-MOB-001 `/reports` overflow | P2 | **IMPLEMENTED_WITH_EVIDENCE** | `tests/unit/shell/reports-mobile-layout.test.ts`; Playwright matrix not re-run. |
| Oct-9 84-finding disposition | P2 | **STILL_OPEN** | Assumed closed in local build; independent re-proof = **H16-009**. |
| `docs/implementation/**` wave docs | INFO | **OWNER_DEFER** | Historical; use Oct audits + migration journal tail (**0179**). |

---

## 4. Recommended next actions (documentation / process only)

1. **Reconcile YAML** on 12 plans with stale `pending`/`in_progress` (mark **completed** or **superseded** with link to master plan).
2. **Track explicitly (P0/P1):** `0179` + `0177` Production apply (separate Owner SQL approval), SUMIT Milestone B, **H16-009** preflight, Mode B `wave2-sync-domains` + integration tests.
3. **Track P2:** My Work saved views (**H16-012**), calendar dedupe todo, stale TODO comments, archive `CURRENT-IMPLEMENTATION-STATUS.md`.
4. **Do not treat** customer portal or PM-012 calendar as drift — remain **OWNER_DEFER**.

---

## 5. Evidence index (representative)

| Topic | Path |
|-------|------|
| Plans | `.cursor/plans/*.plan.md` |
| AGENT_16 report | `docs/audits/2026-10-full-system-audit/subagents/AGENT_16_historical_unfinished.md` |
| Migration tail | `drizzle/migrations/0179_connected_projects.sql`, `0177_tasks_uwm_scale_indexes.sql`, `drizzle/migrations/meta/_journal.json` |
| UWM / My Work | `src/modules/tasks/**`, `src/app/[locale]/(app)/work/page.tsx` |
| Quick capture | `src/modules/quick-capture/**`, `tests/unit/quick-capture/**` |
| Connected projects | `src/modules/connected-projects/**`, `tests/unit/connected-projects/**` |
| Contractor 5-tab | `src/modules/contractor-portal/domain/mobile-tabs.ts` |
| Portal defer | `docs/product/portal-status.md` |
| SUMIT plan | `.cursor/plans/sumit_integration_phase_0.plan.md` |
| i18n config | `src/shared/i18n/config.ts`, `src/locales/ar/`, `src/locales/ru/` |

---

*End of Phase 6 historical closure.*
