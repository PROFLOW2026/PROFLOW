# EXLFY — Pre-release status (2026-10-30)

## Scope in local commits (not pushed)

| SHA | Summary |
|-----|---------|
| `ed2bf9a8` | Waves 1–2: list filters, date presets, expenses pilot |
| `f6655de2` | Wave 3 start: `FormDialogFooter` |
| `9c77de44` | Wave 3 complete: dialogs, forms, 360 tabs |
| `313e5d39` | BH-01/BH-02 + vendors kit |
| `c382f71c` | BH-01 confirm → shared `Dialog` + `FormDialogFooter` |

---

## Automated tests executed (this session)

| Suite | Result |
|-------|--------|
| `expense-cost-destination-state.test.ts` | PASS |
| `expense-form-preservation.test.ts` | PASS |
| `date-range-selector-presets.test.ts` | PASS |
| `confirm-action.test.tsx` | PASS |
| `main-app-form-actions.test.tsx` | PASS |

**15/15 PASS** — unit/UI only; **not** mobile UX runtime.

---

## Runtime verification

**Status: NOT VERIFIED** — `/he-IL/expenses` → redirect to `/he-IL/sign-in` (no Owner session in test environment). No credential bypass attempted.

### Owner browser checklist (sign in first)

Mark each **PASS / FAIL / NOT RUN**:

| # | Area | Check |
|---|------|--------|
| 1 | Expenses list | Week/Month/Year/Custom presets; collapsed filters; search `q`; compact mobile cards; no horizontal scroll |
| 2 | AP / Billing | Date basis preserved; payment KPI range unchanged semantically |
| 3 | Quotes / PO / Subcontracts | Minimal filters; compact toolbar |
| 4 | Expenses create/edit | Destination change from single project → **dialog** (not browser alert); cancel keeps mode; confirm applies; return to single restores last project |
| 5 | Vendors list | Kit filter panel; mobile card density; 360 tabs open |
| 6 | Wave 3 surfaces | ConfirmAction dialogs; credentials share; sticky form actions on create flows |
| 7 | RTL mobile | Dialog/sheet footers; bottom nav clearance on sticky actions |

---

## Blockers (release)

**None from automated tests.** Production release blocked only on **missing Owner runtime sign-off** above.

---

## Business rules

No intentional change to allocation engine, VAT, payment recognition, or profitability in EXLFY program commits.
