# WAVE4 Audit C — UX docs 39–64 vs screens

**Date:** 2026-08-09  
**Auditor:** Auto/Composer (PART B / AUDITOR C)  
**Scope:** IA, flows, wireframes, Deep Teal, forms/tables, mobile/responsive, RTL, HE/EN, a11y, empty/loading/error, progressive disclosure  
**Policy:** Turn high-value findings into **actual fixes** when safe (no migrations, no notifications product).

---

## Verdict

Shell, adaptive nav, Deep Teal tokens, RTL logical CSS, Hebrew glossary (core), coverage disclosure, and progressive create forms are in good shape. Highest residual UX debt: EN work-area terminology drift, incomplete milestone status actions, uneven loading skeletons, and a few empty states without a clear single action.

---

## Screen / IA coverage (docs 39–55)

| Area (docs) | Routes / UI | Gap |
|-------------|-------------|-----|
| Flexible workflows 39 | Module prefs + usage | OK |
| IA / nav 40–41 | `navigation.ts`, sidebar, mobile nav | Wave2/3 items correctly conditional |
| Onboarding 42 | `/onboarding`, `/setup` | Skip path OK |
| Core flows 43 | Project/expense/change/billing | OK |
| Screen inventory 44 | Most Must screens present | Global docs hub secondary OK |
| Project workspace 45 | Tabs + progressive links | Work tab reveals multi-WP |
| Financial dashboards 46 | Home + project financials + reports | Coverage present |
| Mobile field 47 / 55 | Responsive shell + field-ops | Offline drafts partial |
| UX rules 48 | Generally enforced | Terminology EN drift |
| Wireframes 49–54 | Implemented as functional UI not pixel mocks | Acceptable |
| Visual 56–64 | Tokens, status badges, tables, forms | Deep Teal in use; avoid purple bias OK |

---

## Cross-cutting findings

### Progressive disclosure

| ID | Severity | Finding | Action |
|----|----------|---------|--------|
| UX-01 | LOW | Expense + project create use More details / Advanced | Keep |
| UX-02 | LOW | Change form progressive sections | Keep |
| UX-03 | MEDIUM | Milestone empty is soft text; form below acts as CTA | Soft OK; add missed/cancel actions |

### Empty / loading / error

| ID | Severity | Finding | Action |
|----|----------|---------|--------|
| UX-04 | MEDIUM | `loading.tsx` only on subset of routes | **FIX:** add for projects, clients, workforce, reports, crm |
| UX-05 | LOW | Most lists use `EmptyState` + CTA | Continue pattern on Wave3 lists (mostly done) |
| UX-06 | LOW | Form errors use `role="alert"` widely | Keep |

### Mobile / responsive / RTL

| ID | Severity | Finding | Action |
|----|----------|---------|--------|
| UX-07 | — | Logical properties (`ms`/`ps`/`start`) dominant | OK |
| UX-08 | LOW | `ResponsiveTable` used on directories + API settings | OK |
| UX-09 | LOW | Bottom nav primary items match U1 | OK |
| UX-10 | LOW | Skip link to `#main` present | OK |

### Hebrew / English / terminology

| ID | Severity | Finding | Action |
|----|----------|---------|--------|
| UX-11 | MEDIUM | EN “work package” vs projects “work area” | **FIX** normalize EN |
| UX-12 | — | HE `תחום עבודה`, changes, contract value glossary | OK |
| UX-13 | LOW | Wave3 locale files exist en + he-IL | Spot-check remaining hardcodes |

### A11y (doc 63)

| ID | Severity | Finding | Action |
|----|----------|---------|--------|
| UX-14 | — | Focus rings on buttons; status ≠ color alone (`StatusBadge`) | OK |
| UX-15 | LOW | Icon-only controls generally `aria-hidden` / labels | Keep auditing Wave3 forms |
| UX-16 | LOW | Min touch `min-h-11` used in many mobile cards | Extend where missing |

### Deep Teal / components (56–61)

| ID | Severity | Finding | Action |
|----|----------|---------|--------|
| UX-17 | — | CSS variables `--pf-teal-*`, status tokens | OK |
| UX-18 | LOW | Cards used as interaction containers (settings sections) | Acceptable vs “no cards in hero” |
| UX-19 | LOW | Tables: sticky/responsive patterns present | OK |

---

## High-value fixes in this wave

1. **EN work-area terminology** — fieldOps, procurement, workforce (expenses already “work area”).  
2. **Milestones** — Mark missed / Mark cancelled already on planned milestones.  
3. **Loading skeletons** — projects, clients, workforce, reports, crm list routes.  
4. **Webhook revoke / rotate secret** — Settings API panel (actions were present; UI completed).  
5. **Project financials CSV export** — link with `projectId` on financials page.

---

## Remaining UX backlog (not blocking if P0 done)

- Project-scoped people assignment UI (ties to Audit A-02)  
- Customer/vendor **public** portal chrome (product decision)  
- Field-ops photo limitation copy already noted — full photo attach may need storage owners  
- Preset content editor  
- Rich empty illustrations — out of scope  
- Pixel-perfect wireframe parity — not required for launch

---

## Non-goals

- Notifications UI (owner deferred)  
- Marketing landing redesign  
- Replacing Deep Teal direction
