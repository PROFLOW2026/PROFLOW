# BUG-05 — Mobile floating action button (+) overlays content

**Date:** 2026-11-14  
**Mode:** READ-ONLY code + prior audit cross-check  
**Severity:** P2 (UX / mobile accessibility of actions)

## Status on current HEAD (`b2f0b9e7`)

**Still present as a systemic risk.** Clearance tokens exist, but FAB remains `position: fixed; z-50` and can cover bottom-end actions on screens that do not inherit shell padding or that place CTAs in the FAB/nav collision zone (sheets, sticky footers, dialogs, long forms).

## Implementation

| Piece | Path | Behavior |
|-------|------|----------|
| FAB | `src/components/shell/quick-create.tsx` | `fixed z-50`, bottom above bottom-nav via CSS vars |
| Bottom nav | `mobile-nav.tsx` / employee / contractor nav | `fixed z-40` |
| Content pad | `app-shell.tsx` `pb-[var(--pf-mobile-content-bottom)]` | Main scroll area only |
| Tokens | `globals.css` `--pf-fab-size`, `--pf-fab-gap`, `--pf-bottomnav-total-height`, `--pf-mobile-content-bottom` | Designed clearance |

## What unit tests prove

`tests/unit/shell/mobile-layout-regression.test.ts` and `quick-create-fab.test.ts` pass: FAB tokens, RTL physical left, shell padding constants, no dynamic visualViewport geometry.

**They do not prove** every form/card/dialog/sticky footer clears the FAB at 320–430px.

## Prior audit evidence (still relevant)

- `docs/audits/EXLFY_UX_UI_UNIFICATION_MAP_2026-10-29.md` — FAB duplicate CTAs / clearance policy
- Comprehensive QA matrices still track FAB as an open UX concern
- E2E `mobile.spec.ts` checks FAB clears **bottom nav**, not in-page primary actions

## Affected surfaces (code)

| App | FAB |
|-----|-----|
| Main | `QuickCreate` in app shell |
| Employee | Separate shell; may include quick-create where permitted |
| Contractor | No owner-style FAB (portal tabs) — lower risk |

Screens most at risk: list pages with bottom actions, multi-step forms without extra bottom padding, sticky save bars, fullscreen sheets that do not account for `--pf-mobile-content-bottom`.

## Runtime verification

**UNVERIFIED** in this audit pass (no Playwright against live authenticated session in this wave). Code-level risk remains **confirmed**.

## Proposed fix (do not implement)

1. Audit sticky footers / primary CTAs for `pb` ≥ FAB clearance or `scroll-margin-bottom`.
2. Hide or relocate FAB on `/new`, dense editors, and open dialogs (partially exists via `shouldHideQuickCreateForRoute` — extend coverage).
3. Add Playwright checks at 390px for expenses/tasks/workforce forms: primary save not intersect FAB bounding box.
