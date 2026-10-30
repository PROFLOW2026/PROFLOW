---
name: EXLFY UX/UI Unification
overview: "Unify list/filter/card/dialog language across EXLFY using vendors as the structural reference, a narrowed Week|Month|Year|Custom date preset set, and shared Main App kit components—without changing business semantics until explicitly approved. Mapping complete at docs/audits/EXLFY_UX_UI_UNIFICATION_MAP_2026-10-29.md; this plan is execution only."
todos:
  - id: owner-decisions
    content: "Owner Phase 0 decisions: date presets; FAB policy; confirm 'associated address' = project; approve whether expense auto_pool may clear projectId (BH-01)"
    status: completed
  - id: date-range-presets
    content: "Narrow DateRangeSelector default presets to Week|Month|Year|Custom; keep precise from/to inputs; optional presets prop for staged rollout"
    status: completed
  - id: standard-filter-bar
    content: "Build Standard Filters on MainAppListSearchToolbar + OwnerListFilterBar + vendors compact density (search, popover/sheet, active chips, advanced period)"
    status: completed
  - id: standard-list-card
    content: "Add Standard List Card slots (title/status/meta/amount/footer) with compact density from vendors owner CSS promoted into kit tokens"
    status: completed
  - id: expenses-list-pilot
    content: "Pilot expenses list on Standard Filters/Cards; collapse always-open grid; optional text search q if approved; preserve dateBasis semantics"
    status: completed
  - id: ap-billing-date-basis
    content: "AP + Billing: one DateRangeSelector + dateBasis instead of dual full preset bars; protect payment KPI semantics"
    status: completed
  - id: align-master-data-lists
    content: "Align clients/projects/employees create chrome and toolbars to kit; minor gaps only"
    status: completed
  - id: thin-lists-filters
    content: "Add minimal status/search filters to quotes and procurement POs; compact subcontracts filters"
    status: completed
  - id: vendors-onto-kit
    content: "After pilot stable: migrate vendors from parallel toolbar/CSS onto shared kit without regressing mobile density"
    status: completed
  - id: dialog-families
    content: "Unify ConfirmAction adoption, DialogFooter Cancel=secondary, merge credentials-share dialogs"
    status: completed
  - id: expense-destination-ux
    content: "ONLY after Owner approval: separate auto-split run from destination change that clears projectId (BH-01/BH-02); no engine mutation of header address"
    status: completed
  - id: employee-contractor-parity
    content: "Apply list/filter parity to employee mirrors and review contractor portal separately last"
    status: pending
isProject: true
---

# EXLFY UX/UI Unification — Execution Plan

**Mapping report (read-only deliverable):** [`docs/audits/EXLFY_UX_UI_UNIFICATION_MAP_2026-10-29.md`](../../docs/audits/EXLFY_UX_UI_UNIFICATION_MAP_2026-10-29.md)  
**Code baseline:** `ad28026203bc9545f5b747812db682a56e79fe2b`  
**Status:** Plan only — do not implement until Owner starts a fix wave.

## Goals

- One product language for lists, filters, cards, forms, and overlays.
- Vendors list = structural/mobile density reference — not blind copy.
- Date quick picks: **Week | Month | Year | Custom** only.
- Preserve business behavior (VAT, payments, recognition, retroactive edits) unless Owner explicitly approves a behavior change.
- Prefer shared components over per-page patches.
- No horizontal scroll on mobile.

## Non-goals (this program)

- No Production SQL / migrations for UX alone.
- No redesign of contractor portal IA in the first waves.
- No changes to `runAutomaticAllocation` write set unless a proven engine bug appears (mapping disproved header address writes).

## Phase 0 — Decisions (blocking)

1. Confirm preset set and whether Custom is a chip or just the from–to inputs.
2. FAB: keep global FAB + header primary; fix expense FAB target to `/expenses/new`?
3. Confirm product meaning of "כתובת משויכת".
4. Approve or defer BH-01 (clearing `projectId` when choosing `auto_pool`).

## Phase 1 — Shared primitives (sequential start)

1. **DateRangeSelector** — change default `PRESETS` in `src/components/patterns/date-range-selector.tsx`.
2. **Standard Filters / Cards** — extend `components/patterns/main-app/` + density tokens from `vendors-list-owner.css` / `main-app-list.css`.
3. Do not rewrite all consumers in one PR; ship kit + one pilot.

## Phase 2 — Pilot: Expenses list

- Collapse filters (period + project + category inside advanced).
- Keep `dateBasis` expense|payment semantics (`expenses.repository` filters).
- Standard card layout; attention as secondary layer.
- Optional `q` search if Owner approves.

## Phase 3 — Parallel money lists

- AP + Billing dateBasis unification (careful with payment KPI ranges).
- Quotes / PO minimal filters.
- Subcontracts compact toolbar.

Can run in parallel after kit exists; **one owner** on shared DateRangeSelector / filter bar files.

## Phase 4 — Master data + vendors onto kit

- Clients / projects / employees small alignments.
- Then migrate vendors parallel implementation onto kit.

## Phase 5 — Dialog families (parallel with Phase 3–4)

- ConfirmAction-only confirms.
- Cancel button contract.
- Credentials share merge.

## Phase 6 — Expense destination behavior (optional, high risk)

- Only with explicit Owner approval and business-integrity review.
- Do not clear header association as a silent side effect of "run split".
- Engine remains allocation-lines-only for auto-split.

## Phase 7 — Surfaces parity

- Employee org-list mirrors.
- Contractor portal review (separate visual system — do not force owner kit blindly).

## Parallelism rules

| Parallel OK | Must be serial |
|---|---|
| Quotes filters vs dialog Cancel contract | DateRangeSelector default change before mass list restyles |
| Credentials share vs master-data chrome | Expenses pilot before vendors-onto-kit |
| AP vs Billing dateBasis (different owners if files disjoint) | BH-01 with any allocation engine touch |

## Acceptance (per wave)

- No horizontal overflow on mobile list pilot.
- Presets show only Week/Month/Year/Custom on touched screens.
- Vendors density not regressed when it migrates.
- Expense create/pay/allocate/finalize still pass existing unit/integration focus (targeted — not full E2E unless release).
- No silent change to payment recognition or VAT.

## Stop condition

Stop after mapping/plan until Owner says to start implementation (e.g. Phase 0 answers + "התחל תיקונים").
