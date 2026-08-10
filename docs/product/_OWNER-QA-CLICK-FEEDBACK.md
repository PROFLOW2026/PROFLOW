# Owner QA — Click / Press Feedback (Agent CLICK)

**Status:** DONE for Final Closure (no commit)  
**Contract:** `_OWNER-QA-FINAL-LEAD-CONTRACT.md`

## Shared primitives

| Surface | Behavior |
|---------|----------|
| `Button` | Touch press (`active` bg + subtle scale), spinner + `aria-busy` + **hard disable while `loading`** (`disabled \|\| loading`) |
| `pressable.ts` | `pressableClassName` / `pressableChromeClassName` / **`textNavLinkClassName`** / **`textNavLinkMutedClassName`** / **`pressableCardLinkClassName`** (Server-Component-safe) |
| `SectionNavLink` | Press + pending spinner + duplicate-click guard (workspace chips + section tabs) |
| `ShellNavLink` | Press + icon spinner pending (sidebar + mobile); respect Perf prefetch props if added |
| `TabsTrigger` | Press + `data-pending` (with `useQueryTabPending`) |
| Dropdown / dialog / sheet close / select | Press on highlight + close / trigger controls |

## Must-fix (this wave)

| Location | Fix |
|----------|-----|
| `project-planning-panel.tsx` `tr[role=button]` | `pressableClassName` + active/hover row chrome |
| `project-workspace-nav.tsx` chip Links | `SectionNavLink` (press + pending) |
| Entity / list text-link rows | `textNavLinkClassName` / `pressableCardLinkClassName` across clients, projects, jobs, expenses, billing, workforce, dashboard, CRM, procurement, assets, field-ops, vendors, compliance, changes, reports, auth, etc. |

## Also closed this wave

- Banking txn `tr` selection rows → pressable + keyboard
- Work-kind filter chips → `SectionNavLink`
- Disclosure `<summary>` (financials, fleet, billing form, API settings)
- OCR file-picker `Label` chrome
- Coverage disclosure trigger (pressable kept)

## Audit counts

- **Total clickable patterns audited = 25** (pattern families: Button, ShellNavLink, SectionNavLink, textNavLink, textNavLinkMuted, pressableCardLink, pressable / pressableChrome, Tabs, Dropdown, Dialog/Sheet close, Select, StatusToast dismiss, table `role=button` rows, document dropzone, OCR/banking option cards, disclosures, coverage popover, FAQ accordion, metric drilldown, file Labels, work-kind chips, auth/aux links, entity list Links, mobile list cards, FAB/bottom-nav chrome)
- **Instance signal (refs):** textNavLink ~126 · muted ~60 · card links ~39 · pressableClassName ~51 · SectionNavLink ~23 · ShellNavLink ~13 · files importing Button ~156 · files importing pressable ~91
- **`hover:underline` without shared pressable text-nav classes remaining = 0** (coverage-disclosure keeps underline tokens *with* `pressableClassName`)

## Raw interactive exceptions remaining = 0

All previously raw surfaces either adopted primitives or keep intentional non-`Button` geometry **with** press feedback:

| Location | WHY (intentional; press applied) |
|----------|----------------------------------|
| `Button` internal `<button>` | Primitive itself |
| `quick-create.tsx` / `mobile-nav.tsx` More | FAB / bottom-nav geometry; `pressableChromeClassName` |
| `status-toast.tsx` dismiss | Tiny dismiss chip; `pressableClassName` |
| OCR / banking selection rows | Listbox / option cards; press feedback applied |
| `landing-faq.tsx` accordion | Disclosure pattern; press feedback applied |
| `metric-drilldown.tsx` expand | Inline disclosure; press feedback applied |
| `document-attachments` dropzone `role="button"` | Drag-and-drop surface; press + busy opacity |
| `project-planning-panel` / banking txn `tr[role=button]` | Focus/select rows; `pressableClassName` (not Button) |
| Marketing landing header menu | Uses `Button` |

## Success / error

No new toast system. Continues to use `StatusToast` / form `Alert` / action result messages already in product.

## Schema / tests / commit

- Schema: NO  
- Tests: not run (UI class/composition only)  
- Commit / push: FORBIDDEN (none)
