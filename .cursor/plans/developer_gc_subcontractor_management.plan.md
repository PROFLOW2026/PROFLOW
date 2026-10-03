---
name: Developer / GC / Subcontractor Management
overview: Second operating model for ProjectFlow - a developer or general contractor runs a construction project with external execution contractors (portal, claims, certifications, coordination, quality, closeout). One MAIN AGENT owns architecture; migrations are consolidated and applied only after the single Owner Final Gate. Built beside the existing Client -> Quote -> Project -> Billing -> Payment flow without altering it.
todos:
  - id: w0-contracts
    content: "W0 Freeze shared contracts (actor identity, project capabilities, external grant scope, location refs, subcontract/work-line identity, document link semantics, domain event names, audit actor) in docs/implementation/dev-gc-shared-contracts.md"
    status: completed
  - id: w1-project-capabilities
    content: "W1 Project-scoped capability model: domain catalog + templates + resolver, project_members tables, assertProjectCapability, RLS function, member management use-cases, unit + PGlite integration tests"
    status: in_progress
  - id: w1b-financial-projection
    content: "W1b Close existing financial leaks: subcontract/vendor reads (VENDORS_READ exposes money), boq_subcontractor_* RLS, safe operational projections"
    status: pending
  - id: w2-external-identity
    content: "W2 External identity: username+password principals without org membership, scoped external grants (org/project/vendor/subcontract), external session + DAL guard, audit actor_type"
    status: pending
  - id: w3-project-profile-locations
    content: "W3 Project delivery profile, optional construction characteristics, project_locations hierarchy, rule-based recommendations/templates"
    status: pending
  - id: w4-subcontract-core
    content: "W4 Subcontract agreement extensions, work lines, work-package links, subcontract change requests/orders, unpriced instructions"
    status: pending
  - id: w5-claims
    content: "W5 Progress claims: header/lines/submission revisions/append-only assessments, retention, advances, deductions, payment-eligibility holds, AP integration (draft bill only)"
    status: pending
  - id: w6-collab-tasks-events
    content: "W6 Contextual threads, activity feed, external task assignment/verification, coordination events + readiness matrix, schedule integration"
    status: pending
  - id: w7-documents-plans
    content: "W7 Contractor document visibility (document_links), plan revisions + distribution/acknowledgement, contractor uploads to external storage, media evidence"
    status: pending
  - id: w8-quality-field
    content: "W8 RFI, submittals, inspections, defects/punch list, daily site log, meetings/minutes, site instructions, materials/deliveries, safety, compliance"
    status: pending
  - id: w9-procurement-closeout
    content: "W9 Contractor procurement/award, handover/closeout, warranty, performance history"
    status: pending
  - id: w10-surfaces
    content: "W10 Contractor portal (mobile-first), internal project workspace (owner + employee surfaces), project dashboard, contractor 360, cost control, global create, search"
    status: pending
  - id: w11-notifications-cc
    content: "W11 Notifications for internal+external principals, domain events, Command Center items"
    status: pending
  - id: w12-i18n-security-tests
    content: "W12 i18n HE/EN/AR/RU, security review, authorization matrix tests, workflow E2E, regression"
    status: pending
  - id: w13-migration-consolidation
    content: "W13 Consolidate final migration set (centralized), journal, PGlite verification, Final Gate report"
    status: pending
isProject: true
---

# Developer / GC / Subcontractor Management - master plan

Source of truth for scope: the Owner's "FINAL MASTER BUILD SPECIFICATION".
Shared contracts: `docs/implementation/dev-gc-shared-contracts.md`.

## Execution rules (from the spec)

- One Owner gate only: after everything is implemented and locally verified, before applying new migrations / push / deploy.
- No SQL is applied to Production or any shared DB before that gate. Migration files are written and verified against local PGlite only.
- Migrations are owned centrally by the MAIN AGENT; waves append to the single prepared migration set.
- Reuse existing entities (vendors, subcontract_agreements, ap_*, retention_releases, documents, tasks, notifications, audit_events, external_principals/grants). New tables only when the existing one is semantically wrong.
- Certification != AP Actual != Payment. Physical progress != financial progress. Claim amounts are NET.

## Takeover (2026-10-03) - multi-agent execution

Baseline at takeover: HEAD `e4ebe6b`; foundation tests 50/50 pass; tsc pass. 0156-0170 + dg-*.ts (except foundation) were placeholders.
Track briefs / route table / slot ownership: `docs/implementation/dev-gc-track-briefs.md`.
Frozen cross-track stubs added: `src/modules/collaboration/{index.ts,ui.tsx}`, `src/modules/evidence/{index.ts,ui.tsx}`;
external caps `ext.payment.view`, `ext.handover.submit` added.

HALT 2026-10-03 20:16: tracks B-followup, C, E, F, G, H, IJ, MN, O, P, T stopped together ("Other Models usage limit"). Code is on disk; do not rewrite. Promoted (not applied): 0156 C, 0158 E, 0159 F, 0160 G, 0161 H, 0162 IJ (14/14), 0163 KL. Portal route flags flipped for pages that exist (23 portal unit tests). B money columns closed (0168 promoted, 8/8): header amount via secure view only. 0165 O promoted (23/23). 0166 P promoted (18/18). 0169 T promoted. Cron */5 on /api/internal/dg-events-worker (needs a Vercel plan that allows sub-daily crons; daily ops-worker remains the fallback). Portal notifications already call listExternalNotifications. 0167 Q promoted. Portal route test updated now that every contractor page is live (23/23). 0157 D promoted (43/43), structure page done. S nav 009254d5 DONE (execution group; skipped contractors list, execution dashboard, cost-control because pages were missing). Surfaces 0df35eda DONE: contractors, execution, cost-control. Cost control budget columns DONE (917972d7, 12 unit tests): trade rollup shows original/approved budget only with budgets.read and a real matching line; forecast remaining/final stay unavailable. Commitment, certification, AP, and payment stay separate. MN quality PASSED: isolation + repair cycle, then the full file 23/24 with one assertion looking at Drizzle's wrapper instead of the trigger text. That case re-ran green (illegal transition refused, 6719ms). Combined 24/24. 0164 PROMOTED, NOT applied. Audit labels DONE (db2772db): 173 keys × he/en/ar/ru, 4/4 label tests. Employee DG routes DONE (0cea9c5b): thin pages under /employee/projects/{id}/... reuse owner screens with the same capability gates; execution nav uses that root. 3 unit tests. Search/FAB DONE (5bc5e772, 4 unit tests). Contractor search money reads subcontract_agreement_money_secure (integrator fix; base original_amount is revoked by 0168). Claim hits carry no amounts. Command Center ports DONE (2dacd29e): all 9 DG sources registered, acknowledgements merged from instructions, plans/documents, and coordination. Registry test 1/1. Typecheck PASS (tsc --noEmit, 2026-10-03). i18n parity DONE (030bf2ef): 19 DG namespaces already match he/en/ar/ru; dg-locale-parity 2/2. Authorization matrix DONE (93bd5e0d): operational PM and site manager get no contract/claim/retention amounts; project capabilities are not org permissions. A/B isolation, cross-project membership, and external-not-a-member were already tested. Portal dashboard DONE (89ccce31, 27 unit tests): plan revisions, documents, submittals, claims, certifications, retention, payments. Milestones stay hidden (no contractor milestone query; no invented rows). NET amounts only with contract-value or payment view. Production build PASS (next build, exit 0, 2026-10-03) after keeping server-only modules out of client bundles.
Wave 1 agents (background): A 7d216a41, B ed6f9da2, C 814d8921, D f3973819 (module+SQL+tests written; stopped on model limit before the structure route and report; resumed to finish), E a41899bc, F f2100599 (retry; 66ea3c64 crashed resource_exhausted with no output), G d64b736b,
H 533efd33, IJ 5d6b2dcc, KL 684a8c62, MN 72aca5f7, O cfe81f42, P 7ee78ceb, Q QUEUED (2c583368 and d71c1e92 both resource_exhausted, no files). Relaunch only after several wave-1 agents finish. T 97255fe2, R e2b4f1e8.
Wave 2 (after wave 1 lands): S (workspace/360/cost control/nav), U (search/FAB), V (i18n review), W (security matrix), X (E2E/regression).
Wave 1 results: A DONE. B app leaks closed (7 PGlite tests); 0168 WIP not promoted until agreement money columns move behind a secure view (B resumed). BOQ valuation reader fix assigned to B.
R DONE (portal shell, dashboard, notifications; 23 unit tests). Hidden until owners export summaries and portal pages exist: milestones, plans, plan acks, submittals, claims, certification, retention, payments, documents. Queue: G export listContractorPortalTasks from collaboration/index; IJ/KL/F/H portal summary exports; then R sets implemented flags + registers providers. Optional: C adds project_number + org timezone to external_portal_directory.
A CLOSED: team page (owner + employee), requireProjectCapabilityPage, listMyProjectMemberships, events emitted (55 tests). Wave-2 inputs from A: S nav entry `team` (label projectTeam.page.title, distinct from workforce ?tab=team) + employee hub link; employee wrappers for all DG routes (contracts 2.1).
MAIN AGENT: integrate requests, copy verified WIP SQL into reserved slots, ledger, Final Gate.

## Wave notes

Each wave: schema -> domain -> authorization -> repositories -> actions -> UI -> i18n -> tests. A table with no use-case/UI is not "done".
