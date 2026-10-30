# EXLFY — BH-01/BH-02 + Vendors kit (2026-10-30)

**Baseline:** `9c77de44` (wave 3) → post-commit SHA below.  
**Runtime:** **NOT VERIFIED** (no authenticated session in automation).

---

## 1. BH-01 / BH-02 — what was fixed

| ID | Before | After |
|----|--------|--------|
| **BH-01** | Switching cost destination from single project to auto-pool / multi / company-only cleared header `projectId` on save **without warning** (felt like “lost association”). `runAutomaticAllocation` already did **not** write header `projectId`. | Leaving **project single** with a linked project requires **`window.confirm`** (`destination.confirmLeaveSingleProject`) before the mode changes. Save still omits `projectId` only when destination is not single — **explicit, user-approved** destination change. Automatic driver / finalize path unchanged (no engine edits). |
| **BH-02** | Returning to single project picked **`projects[0]`** when targeting was overhead. | **`rememberedSingleProjectId`** stores last single-project choice; restore via `resolveRestoredSingleProjectId` — **no auto-first-project**; empty select if project unavailable. |

**Code:** `src/modules/expenses/domain/expense-cost-destination-state.ts`, `expense-form.tsx`, i18n `destination.confirmLeaveSingleProject` (en, he-IL, ar, ru).

**Not changed:** allocation engine, VAT, payment recognition, profitability formulas, `runAutomaticAllocation` write set.

---

## 2. Behaviors that actually changed (user-visible)

1. Confirm dialog when leaving **פרויקט אחד** with a project selected → any other destination mode.
2. When switching back to **פרויקט אחד**, project dropdown restores **previous** selection if still in list; otherwise stays unselected.
3. Setting allocation driver / saving in auto-pool mode does **not** by itself change destination selector — destination change is only via the destination field (+ confirm).

---

## 3. Vendors → shared kit

| Item | Status |
|------|--------|
| Owner list filters | `VendorListFilters` owner path → `MainAppOrgListFilterPanel` + collapsed advanced filters |
| Query params | `q`, `type`, `status`, `categoryId` unchanged |
| Create button | Still only in `PageHeader` (no duplicate) |
| Density | Owner CSS trimmed; kit form hooks + table/card rules retained |
| 360 / cards | Unchanged (wave 3 shell) |

**CSS removed (owner):** legacy `.pf-vendors-list-toolbar-*`, mobile popover grid, duplicate search field rules — see [Vendors kit](74dcfc7e-99f3-4ab7-aaf6-dbee3dbb3a83) agent notes.

**Desktop UX shift:** type/status/category moved into **collapsed** filter panel (aligned with expenses/quotes), search stays in toolbar.

---

## 4. Tests

| Suite | Result |
|-------|--------|
| `tests/unit/expenses/expense-cost-destination-state.test.ts` | PASS (4) |
| `tests/unit/expenses/expense-form-preservation.test.ts` | PASS (2) |
| `tests/ui/main-app-form-actions.test.tsx` | PASS (3) |
| `tests/ui/project-tabs-order.test.tsx` | PASS (2) |

**Runtime:** not run — sign-in required.

---

## 5. Open items

- Owner **runtime smoke** (checklist below) before production release of waves 1–3 + BH + vendors together.
- `expense_bh01_bh02_sprint.plan.md`: engine guardrails / production smoke todos remain **pending** (no engine change was required).

---

## 6. Git

Commit after this doc (focused staging). **No push.**

---

## Runtime smoke checklist (waves 1–3 + BH + vendors)

**Lists (waves 1–2):** expenses, AP, billing, quotes, procurement, subcontracts — presets Week/Month/Year/Custom; mobile filter sheet; no horizontal scroll; FAB → `/expenses/new`.

**Wave 3:** confirm dialog footers; credentials share channels; sticky form actions on create flows; client/project/vendor/workforce tab strips.

**BH:** create expense on single project → switch to auto-pool → confirm → save → header unlinked; switch back to single → prior project restored; run weight driver without changing destination first — no surprise confirm.

**Vendors:** owner list search + collapsed filters; mobile card density vs prior reference; open 360 tabs.

**Sign-off:** record PASS/FAIL per row after Owner login — do not treat redirect-to-sign-in as PASS.
