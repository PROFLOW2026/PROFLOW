# AUDIT-UX-39-64 — Screen / flow gap review

**Auditor:** Auto AUDITOR C  
**Date:** 2026-08-09  
**Scope:** Docs `39`–`64` (IA, Progressive Complexity, wireframes, Deep Teal, forms/tables, mobile, RTL, he-IL/en, a11y, empty/loading/error)  
**Policy:** Fix BLOCKER / HIGH / MEDIUM in code. No push. No redesign for its own sake. Glossary: WorkPackage → **תחום עבודה**.

---

## Verdict

No **BLOCKER** UX gaps vs V1 shell/IA for implemented surfaces. Core glossary (nav, financial coverage, תחום עבודה) was largely already correct. This pass closed **HIGH/MEDIUM** gaps in touch targets, focus, empty states, ResponsiveTable islands, progressive-disclosure copy, and one Hebrew glossary drift.

**Fixes applied: 18**

---

## Severity legend

| Severity | Meaning |
|----------|---------|
| BLOCKER | Unusable / unsafe / glossary breaking core IA |
| HIGH | Fails a non-negotiable UX rule on a shipped surface |
| MEDIUM | Clear doc gap; fixable without redesign |
| LOW | Polish / deferred |

---

## Findings + fixes

| ID | Sev | Area | Finding | Fix |
|----|-----|------|---------|-----|
| UX-01 | HIGH | Mobile / a11y `62` `63` | `Button` `sm` / `iconSm` were 32px — below 44px touch | `button.tsx`: `sm` → `min-h-11 md:h-8`; `icon`/`iconSm` → 44px mobile |
| UX-02 | HIGH | Progressive disclosure `39` `61` | Expense advanced toggle used `showAdvanced` (“מתקדם”) instead of **פרטים נוספים** | `expense-form.tsx` → `actions.showMore` |
| UX-03 | HIGH | Focus `63` | Field-ops hub cards had hover but no visible focus ring | `field-ops/page.tsx` focus-visible + `min-h-11` |
| UX-04 | MEDIUM | Glossary U5 `48` | he-IL documents owner type `change_order` = “הוראת שינוי” (vs **שינוי מאושר**) | `he-IL/documents.json` |
| UX-05 | MEDIUM | RTL islands `58` `63` | Work-package progress % lacked LTR/numeric island | `work-tab.tsx` `numeric` + `dir="ltr"` |
| UX-06 | MEDIUM | Empty states `48` | Document attachments used bare `<p>` | `EmptyState` + dropzone hint |
| UX-07 | MEDIUM | Empty + RTL | Milestones empty bare; dates not LTR | `EmptyState`; date `dir="ltr"` |
| UX-08 | MEDIUM | Empty `48` | Offline drafts list bare empty | `EmptyState` + hint |
| UX-09 | HIGH | Tables mobile `61` `62` | Activity log desktop-only table; load-more without focus | `ResponsiveTable` + focusable load-more |
| UX-10 | HIGH | Tables mobile | Rate history desktop-only; dates not LTR; bare empty | `ResponsiveTable` + `EmptyState` + LTR |
| UX-11 | MEDIUM | Empty `48` | Custom fields list bare empty; setup-ish copy | `EmptyState` + softened en/he copy |
| UX-12 | HIGH | Tables + empty | Tax rules desktop-only; “configured yet” tone | `ResponsiveTable` + soft empty + `emptyHint` |
| UX-13 | MEDIUM | Empty | RFQ quotes / comparison bare `<p>` | `EmptyState` |
| UX-14 | MEDIUM | Empty | Asset maintenance history bare empty | `EmptyState` + hint |
| UX-15 | HIGH | Tables mobile | People members table desktop-only | `ResponsiveTable` + mobile cards |
| UX-16 | MEDIUM | Progressive disclosure | Project create “more details” lacked chevron / show-less; dates not LTR | Chevron + `showLess`; date `dir="ltr"` |
| UX-17 | MEDIUM | Locales | Tax empty / custom-fields empty read as setup nags | Softened he-IL + en strings |
| UX-18 | LOW→fixed with UX-01 | Touch | Scattered `size="sm"` without per-call `min-h-11` | Covered by systemic button sizes |

---

## Already compliant (spot-checked)

- IA adaptive nav + U5 glossary in `nav` / billing / changes / workforce / financial coverage (**מה כלול בחישוב**)
- WorkPackage UI copy → **תחום עבודה** (projects, fieldOps, expenses, procurement)
- Deep Teal tokens via `--pf-teal-*` / brand action (no purple admin theme)
- Home brand-new empty with CTAs; list pages generally use `EmptyState` + action
- Skip-to-content in app shell; StatusBadge text+shape on status surfaces
- Money/email/API keys largely use `dir="ltr"` islands
- Expense / billing / client / vendor create already progressive

---

## Residuals (LOW / accepted)

| Item | Notes |
|------|-------|
| Dialog centering `left-1/2` | Physical `left` for transform centering; works in RTL; leave |
| Dense desktop tables still scroll on very narrow tablets | Cards kick in below `md` where ResponsiveTable applied |
| Some nested empties still soft (no CTA) when create UI is adjacent | Intentional; not punishment |
| Full visual Deep Teal brand polish (fonts, marketing) | Doc planning; out of scope |
| Exhaustive Playwright he/en visual matrix every screen | Prior RTL suite exists; not re-run this pass |

---

## Explicit non-goals

- No push / no commit
- No schema / migration invent
- No chrome redesign or new visual system
- Notifications (doc 26) deferred by owner

---

## Fix count

**18** BLOCKER/HIGH/MEDIUM (and one systemic LOW absorbed into UX-01) code/locale fixes applied.
