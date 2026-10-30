---
name: Expense BH-01 / BH-02 (destination & auto-split)
overview: Separate sprint after EXLFY wave 3 — fix expense project association UX when choosing auto_pool / automatic allocation without silent header mutation; requires Owner approval and business-integrity review before any engine or save-path changes.
todos:
  - id: owner-approve-bh-scope
    content: "Owner confirms BH-01 (clear projectId on auto_pool) and BH-02 (destination UX) scope and acceptance criteria"
    status: pending
  - id: map-current-write-paths
    content: "Document expense header projectId vs allocation lines; prove runAutomaticAllocation write set (no silent address clear today)"
    status: pending
  - id: ux-destination-separation
    content: "UI: separate 'run auto-split' from 'change destination' with explicit copy and confirm when project association changes"
    status: pending
  - id: engine-guardrails
    content: "If approved: allocation-only writes; optional explicit server action to clear projectId with audit — no side effect on split run"
    status: pending
  - id: tests-bh
    content: "Unit/integration focus on expense create/edit, auto_pool, allocation finalize — no full E2E unless release"
    status: pending
  - id: runtime-smoke-bh
    content: "Owner runtime smoke on /expenses/new and edit after sign-in before production"
    status: pending
isProject: true
---

# Expense BH-01 / BH-02 — Prepared sprint (not started)

**Blocked on:** explicit Owner approval per `projectflow-business-integrity` and Phase 0 decision BH-01 in EXLFY plan.

**Non-goals until approved:** No changes to `expense-form` destination/auto_pool behavior in EXLFY waves 1–3.

**Reference:** `docs/audits/EXLFY_UX_UI_UNIFICATION_MAP_2026-10-29.md`, wave 3 execution `docs/audits/EXLFY_WAVE3_EXECUTION_2026-10-30.md`.
