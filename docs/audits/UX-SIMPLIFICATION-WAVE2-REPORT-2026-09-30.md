# UX Simplification Wave 2 — Implementation Report

Date: 2026-09-30  
Scope: Visual / information hierarchy (no capability removal)

---

## Settings (HIGH)

**BEFORE =** Single sidebar listing every accessible settings section (~25–30 links) at once; `/settings` redirected to the first section.

**AFTER =** Level-1 hub at `/settings` (six area cards + Developers when permitted). Inside any setting: horizontal group switcher + only that group’s section links. “All settings areas” returns to the hub.

**WHAT USER NOW SEES FIRST =** Six business areas (My business, Money, People & permissions, Workflow, Connections & storage, Advanced) — not a flat list of every page.

**WHAT WAS MOVED/REGROUPED =** IA in `access.ts`: business catalogs → My business; integrations/SUMIT → Money; approvals → People; forms → Workflow; modules → Advanced; OCR + offline → Connections & storage.

**WHAT WAS HIDDEN UNTIL NEEDED =** Section links for other groups; statutory/filter blocks on Billing (see below); integrity note on receivables summary (collapsible).

**DATA REMOVED = 0**  
**IMPORTANT ACTIONS REMOVED = 0**

**Company details page:** Identity / contact / optional emails / address sections; secondary panels split into separate cards (profile, legal identity, preset, policies, payment instruments).

---

## Client

**BEFORE =** Overview tab with a few stats + prose hint + text link list (felt like another panel dump).

**AFTER =** KPI grid (projects, contracts, open quotes, billed net, collected, outstanding, overdue, profit) + prominent tab shortcut cards; overdue alert when relevant.

**WHAT USER NOW SEES FIRST =** At-a-glance money and workload numbers, then one-tap navigation to full tabs.

**WHAT WAS MOVED/REGROUPED =** Full financial/profit panels remain on Money tab only.

**WHAT WAS HIDDEN UNTIL NEEDED =** Full tables and statement tools (unchanged tabs).

**DATA REMOVED = 0**  
**IMPORTANT ACTIONS REMOVED = 0**

---

## Billing

**BEFORE =** Header → disclosure → commercial hub → date filters → collections banner → receivables → aging → list.

**AFTER =** Header → receivables KPI block → action chips (overdue list, jump to unallocated) → collapsible “dates, filters & related pages” → aging → unallocated → records/payments (unchanged data).

**WHAT USER NOW SEES FIRST =** Outstanding, overdue, open counts (existing summary panel, moved up).

**WHAT WAS MOVED/REGROUPED =** Filters, commercial docs hub, and statutory line inside `<details>`.

**WHAT WAS HIDDEN UNTIL NEEDED =** Filter forms and cross-links until the user expands the block.

**DATA REMOVED = 0**  
**IMPORTANT ACTIONS REMOVED = 0**

---

## Today (Command Center)

**BEFORE =** Pending payments, then Critical / High / Medium / Low severity buckets.

**AFTER =** Pending payments (unchanged), then domain buckets: Money & collections, Approvals, People, Projects & field, Documents, Sales — only non-empty sections.

**WHAT USER NOW SEES FIRST =** “What needs me?” grouped by job type, not severity labels.

**WHAT WAS MOVED/REGROUPED =** Same items and actions; grouping logic only (`groupInboxForToday`).

**WHAT WAS HIDDEN UNTIL NEEDED =** Empty domain sections omitted.

**DATA REMOVED = 0**  
**IMPORTANT ACTIONS REMOVED = 0**

---

## CRM / Quotes

**BEFORE =** Section nav without an explicit funnel cue.

**AFTER =** Compact pipeline hint: Prospects → Leads → Opportunities → Quote (links only).

**Project / Dashboard / Commercial =** No structural redesign (regression-only intent).

---

## Validation

- `npm run typecheck`, `eslint`, `npm run build` — pass  
- Unit: `settings-grouping`, `owner-payments-collector` — pass  
- Manual visual pass recommended on: Settings hub, Settings/Business, Client Overview/Money, Billing, CRM, Today, Project overview, Dashboard (RTL + mobile spot-check)

---

## Acceptance matrix

| Flag | Value |
|------|-------|
| SETTINGS VISUALLY SIMPLIFIED | YES |
| CLIENT VISUALLY SIMPLIFIED | YES |
| BILLING VISUALLY SIMPLIFIED | YES |
| TODAY VISUALLY SIMPLIFIED | YES |
| PROJECT DETAIL PRESERVED | YES |
| DASHBOARD STRUCTURE PRESERVED | YES |
| BUSINESS CAPABILITY LOSS | 0 |
| IMPORTANT ACTION LOSS | 0 |
| OPEN IN-SCOPE FINDINGS | 0 |
