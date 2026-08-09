# ProjectFlow — Documentation Index

**Product (temporary name):** ProjectFlow  
**Project path:** `projectflow/`  
**Current phase:** **PLANNING ONLY**  
**Last updated:** 2026-08-09 (Stack A + pre-impl domain DECIDED; Implementation Blueprint `71`–`80` ready for owner review)

---

## Project status

| Item | Status |
|------|--------|
| Product vision | Owner-reviewed direction applied |
| Domain model | Updated with key owner decisions |
| V1 scope | Owner-directed scope recorded — still planning only |
| Future capability architecture | Documented (`19`–`38`) — does **not** expand V1 |
| Flexible / optional usage model | DECIDED — see `39-FLEXIBLE-OPTIONAL-WORKFLOWS.md` |
| V1 UX / IA / flows | U1–U7 closed — see `40`–`48` |
| V1 wireframes | Structure specs — see `49`–`55` (no visual UI) |
| V1 visual design system | Direction **B Deep Teal DECIDED** — see `56`–`64` (hex/logo still open) |
| Pre-implementation decisions | **Owner approved** (`65` → DECIDED in `18`) |
| Technical stack | **Stack A APPROVED** (`67`; J1–J7 DECIDED) |
| Implementation Blueprint | `71`–`80` — **READY FOR OWNER REVIEW BEFORE IMPLEMENTATION** |
| Key product decisions | See `18-OPEN-QUESTIONS.md` |
| Application code | **Not started** |
| Database / Auth / UI | **Not started** |
| Cloud provisioning | **Not started** (no Supabase/Vercel projects created in planning) |

> **Important:** Do not begin implementation until the owner explicitly approves leaving the planning phase.  
> **Principle:** Plan wide — build in slices. Future docs are architecture protection, not V1 scope.

---

## How to use this documentation

These documents are the **source of truth** for future development.

Rules:

1. Read before proposing or writing product code.
2. Prefer updating documents over inventing behavior in code.
3. Open decisions stay in `18-OPEN-QUESTIONS.md` until the owner decides.
4. Recommendations are not decisions. Look for `OWNER DECISION REQUIRED`.
5. Future capability docs (`19`–`38`) must not be treated as V1 backlog unless explicitly moved into `16-V1-SCOPE.md`.
6. Read [`39-FLEXIBLE-OPTIONAL-WORKFLOWS.md`](./39-FLEXIBLE-OPTIONAL-WORKFLOWS.md) for how capabilities are consumed with progressive complexity.

---

## Suggested reading order

### Round 1 — Vision and boundaries

1. [`00-PROJECT-OVERVIEW.md`](./00-PROJECT-OVERVIEW.md)  
2. [`01-PRODUCT-PRINCIPLES.md`](./01-PRODUCT-PRINCIPLES.md)  
3. [`39-FLEXIBLE-OPTIONAL-WORKFLOWS.md`](./39-FLEXIBLE-OPTIONAL-WORKFLOWS.md) — progressive complexity  
4. [`16-V1-SCOPE.md`](./16-V1-SCOPE.md)  

### Round 2 — Business domain

4. [`02-DOMAIN-MODEL.md`](./02-DOMAIN-MODEL.md)  
5. [`03-BUSINESS-PROJECT-MODEL.md`](./03-BUSINESS-PROJECT-MODEL.md)  
6. [`05-CONTRACTS-QUOTES-CHANGES.md`](./05-CONTRACTS-QUOTES-CHANGES.md)  
7. [`04-FINANCIAL-MODEL.md`](./04-FINANCIAL-MODEL.md)  

### Round 3 — Operating model

8. [`06-WORKFORCE-COSTS.md`](./06-WORKFORCE-COSTS.md)  
9. [`07-VENDORS-SUBCONTRACTORS.md`](./07-VENDORS-SUBCONTRACTORS.md)  
10. [`08-ASSETS-VEHICLES-INSURANCE.md`](./08-ASSETS-VEHICLES-INSURANCE.md)  
11. [`09-DOCUMENTS-EXPENSE-CAPTURE.md`](./09-DOCUMENTS-EXPENSE-CAPTURE.md)  

### Round 4 — Global, tax, access, integrity

12. [`10-GLOBALIZATION-LOCALIZATION.md`](./10-GLOBALIZATION-LOCALIZATION.md)  
13. [`11-TAX-CONFIGURATION.md`](./11-TAX-CONFIGURATION.md)  
14. [`12-USERS-ROLES-PERMISSIONS.md`](./12-USERS-ROLES-PERMISSIONS.md)  
15. [`13-AUDIT-HISTORY-DATA-INTEGRITY.md`](./13-AUDIT-HISTORY-DATA-INTEGRITY.md)  

### Round 5 — Technical direction & decisions

16. [`14-TECHNICAL-ARCHITECTURE-OPTIONS.md`](./14-TECHNICAL-ARCHITECTURE-OPTIONS.md)  
17. [`15-SECURITY-MULTITENANCY.md`](./15-SECURITY-MULTITENANCY.md)  
18. [`66-TECHNICAL-STACK-REVIEW.md`](./66-TECHNICAL-STACK-REVIEW.md) — Stack A/B/C scorecard + sources  
19. [`67-RECOMMENDED-STACK.md`](./67-RECOMMENDED-STACK.md) — proposed V1 stack (owner approval)  
20. [`68-TECHNICAL-BOUNDARIES.md`](./68-TECHNICAL-BOUNDARIES.md) — modules / multi-agent ownership  
21. [`69-ENVIRONMENTS-DEPLOYMENT-PLAN.md`](./69-ENVIRONMENTS-DEPLOYMENT-PLAN.md)  
22. [`70-TESTING-QUALITY-STRATEGY.md`](./70-TESTING-QUALITY-STRATEGY.md)  
23. [`17-FUTURE-ROADMAP.md`](./17-FUTURE-ROADMAP.md)  
24. [`18-OPEN-QUESTIONS.md`](./18-OPEN-QUESTIONS.md)  

### Round 6 — Future capability architecture (long-term)

25. [`19-FUTURE-CAPABILITY-MAP.md`](./19-FUTURE-CAPABILITY-MAP.md) — start here for the master map  
26. Then browse `20`–`38` as needed by topic  

### Round 7 — V1 UX / information architecture (no visual UI yet)

27. [`40-V1-INFORMATION-ARCHITECTURE.md`](./40-V1-INFORMATION-ARCHITECTURE.md)  
28. [`41-V1-NAVIGATION-MODULE-VISIBILITY.md`](./41-V1-NAVIGATION-MODULE-VISIBILITY.md)  
29. [`42-V1-ONBOARDING-SETUP-FLOW.md`](./42-V1-ONBOARDING-SETUP-FLOW.md)  
30. [`43-V1-CORE-USER-FLOWS.md`](./43-V1-CORE-USER-FLOWS.md)  
31. [`44-V1-SCREEN-INVENTORY.md`](./44-V1-SCREEN-INVENTORY.md)  
32. [`45-V1-PROJECT-WORKSPACE.md`](./45-V1-PROJECT-WORKSPACE.md)  
33. [`46-V1-FINANCIAL-DASHBOARDS.md`](./46-V1-FINANCIAL-DASHBOARDS.md)  
34. [`47-V1-MOBILE-FIELD-FLOWS.md`](./47-V1-MOBILE-FIELD-FLOWS.md)  
35. [`48-V1-UX-RULES-VALIDATION.md`](./48-V1-UX-RULES-VALIDATION.md)  

### Round 8 — V1 wireframe structure (no branding/CSS)

36. [`49-V1-WIREFRAME-MAP.md`](./49-V1-WIREFRAME-MAP.md)  
37. [`50-V1-APP-SHELL-WIREFRAMES.md`](./50-V1-APP-SHELL-WIREFRAMES.md)  
38. [`51-V1-HOME-DASHBOARD-WIREFRAME.md`](./51-V1-HOME-DASHBOARD-WIREFRAME.md)  
39. [`52-V1-PROJECT-WIREFRAMES.md`](./52-V1-PROJECT-WIREFRAMES.md)  
40. [`53-V1-TRANSACTION-WIREFRAMES.md`](./53-V1-TRANSACTION-WIREFRAMES.md)  
41. [`54-V1-DIRECTORY-SETTINGS-WIREFRAMES.md`](./54-V1-DIRECTORY-SETTINGS-WIREFRAMES.md)  
42. [`55-V1-MOBILE-WIREFRAMES.md`](./55-V1-MOBILE-WIREFRAMES.md)  

### Round 9 — V1 visual design system (planning only)

43. [`56-V1-VISUAL-DESIGN-DIRECTION.md`](./56-V1-VISUAL-DESIGN-DIRECTION.md) — 3 directions + recommendation  
44. [`57-V1-DESIGN-TOKENS.md`](./57-V1-DESIGN-TOKENS.md)  
45. [`58-V1-TYPOGRAPHY-RTL.md`](./58-V1-TYPOGRAPHY-RTL.md)  
46. [`59-V1-COLOR-STATUS-SYSTEM.md`](./59-V1-COLOR-STATUS-SYSTEM.md)  
47. [`60-V1-COMPONENT-VISUAL-SPECS.md`](./60-V1-COMPONENT-VISUAL-SPECS.md)  
48. [`61-V1-TABLE-FORM-DESIGN.md`](./61-V1-TABLE-FORM-DESIGN.md)  
49. [`62-V1-RESPONSIVE-VISUAL-RULES.md`](./62-V1-RESPONSIVE-VISUAL-RULES.md)  
50. [`63-V1-DESIGN-ACCESSIBILITY.md`](./63-V1-DESIGN-ACCESSIBILITY.md)  
51. [`64-V1-VISUAL-SCREEN-SPECS.md`](./64-V1-VISUAL-SCREEN-SPECS.md)  
52. [`65-PREIMPLEMENTATION-DECISION-PACK.md`](./65-PREIMPLEMENTATION-DECISION-PACK.md) — domain/data decisions (**approved**)  
53. Stack docs `66`–`70` (Round 5) — Stack A **approved**  

### Round 10 — Implementation Blueprint (review before code)

54. [`71-IMPLEMENTATION-BLUEPRINT.md`](./71-IMPLEMENTATION-BLUEPRINT.md) — master index  
55. [`72-V1-DATABASE-BLUEPRINT.md`](./72-V1-DATABASE-BLUEPRINT.md)  
56. [`73-AUTH-TENANCY-PERMISSIONS-BLUEPRINT.md`](./73-AUTH-TENANCY-PERMISSIONS-BLUEPRINT.md)  
57. [`74-RLS-SECURITY-BLUEPRINT.md`](./74-RLS-SECURITY-BLUEPRINT.md)  
58. [`75-STORAGE-DOCUMENTS-BLUEPRINT.md`](./75-STORAGE-DOCUMENTS-BLUEPRINT.md)  
59. [`76-CODEBASE-MODULE-BOUNDARIES.md`](./76-CODEBASE-MODULE-BOUNDARIES.md)  
60. [`77-MIGRATIONS-SEED-DATA-PLAN.md`](./77-MIGRATIONS-SEED-DATA-PLAN.md)  
61. [`78-WAVE-IMPLEMENTATION-PLAN.md`](./78-WAVE-IMPLEMENTATION-PLAN.md)  
62. [`79-MULTI-AGENT-IMPLEMENTATION-PROTOCOL.md`](./79-MULTI-AGENT-IMPLEMENTATION-PROTOCOL.md)  
63. [`80-WAVE0-ACCEPTANCE-CRITERIA.md`](./80-WAVE0-ACCEPTANCE-CRITERIA.md)  

---

## Document map

### Core planning (00–18)

| # | File | Topic |
|---|------|--------|
| 00 | Project overview | Vision, audience, principles summary |
| 01 | Product principles | Product rules, modularity, global-first |
| 02 | Domain model | Entities and relationships (not final schema) |
| 03 | Business / project model | Orgs, clients, projects, trades, work packages |
| 04 | Financial model | Contract value, costs, overhead, billing, allocation |
| 05 | Contracts / quotes / changes | Contract value, ChangeRequest, ChangeOrder, versions |
| 06 | Workforce costs | Employees, rates, time, true cost |
| 07 | Vendors / subcontractors | Vendor entities, hierarchies, engagements |
| 08 | Assets / vehicles / insurance | Overview; see also 23/24 |
| 09 | Documents / expense capture | Files, invoices, future OCR |
| 10 | Globalization / localization | Locales, countries, currency, units, RTL |
| 11 | Tax configuration | Tax engine, overrides, history |
| 12 | Users / roles / permissions | Multi-user orgs, RBAC |
| 13 | Audit / history / integrity | Audit trail, soft delete, immutability |
| 14 | Technical architecture options | Stack options only — no implementation |
| 15 | Security / multi-tenancy | Tenant isolation and secure defaults |
| 16 | V1 scope | Owner-directed MVP (planning only) |
| 17 | Future roadmap | Sequencing across V1.x–Later |
| 18 | Open questions | Decision log (DECIDED / OPEN / PARTIAL) |

### Future capability architecture (19–38)

| # | File | Topic |
|---|------|--------|
| 19 | Future capability map | Master map + architecture protection review |
| 20 | CRM / sales / pre-project | Leads, opportunities, conversion to project |
| 21 | Procurement / materials / inventory | RFQ, PO, stock, commitments |
| 22 | Scheduling / field operations | Dates, Gantt later, site logs, punch lists |
| 23 | Assets / fleet / maintenance | Equipment, vehicles, maintenance depth |
| 24 | Insurance / compliance / licenses | Policies, certs, requirement targets |
| 25 | External portals | Customer & vendor portals, scoped access |
| 26 | Communications / automations | Channels, triggers, preferences |
| 27 | AI / OCR / intelligence | Proposals only; not system of record |
| 28 | Financial expansion / integrations | AR/AP depth, cash, accounting connectors |
| 29 | Reporting / analytics / BI | Project/org metrics, exports |
| 30 | Country packs & terminology | Global expansion + display aliases |
| 31 | Mobile / PWA / offline | Responsive → PWA → native |
| 32 | API / integration platform | Ports, webhooks, adapters |
| 33 | Enterprise security / governance | SSO, SCIM, legal hold, etc. |
| 34 | Future vertical packs | Legal/accounting/consulting flexibility |
| 35 | Configuration / customization | Controlled custom fields & catalogs |
| 36 | Templates / presets | Profession presets without hardcoding |
| 37 | Data import / export | Migration, CSV/Excel, account export |
| 38 | SaaS billing / packaging | ProjectFlow subscriptions (separate domain) |
| 39 | Flexible / optional workflows | Progressive complexity; minimal config UX |
| 40 | V1 information architecture | Top-level areas & object hierarchy |
| 41 | V1 navigation / module visibility | Adaptive nav, + New, hide≠delete |
| 42 | V1 onboarding / first-use | Minimal setup, welcome CTAs |
| 43 | V1 core user flows | 20 primary flows |
| 44 | V1 screen inventory | Screens without pixel UI |
| 45 | V1 project workspace | Header, tabs, WorkPackage reveal |
| 46 | V1 financial dashboards | Home/billing KPIs + coverage |
| 47 | V1 mobile field flows | Responsive quick actions |
| 48 | V1 UX rules / validation | Closed U1–U7 + HE glossary |
| 49 | V1 wireframe map | Index, patterns, profile chrome |
| 50 | App shell wireframes | Desktop sidebar + mobile bottom nav |
| 51 | Home dashboard wireframe | Empty / simple / advanced |
| 52 | Project wireframes | List, create, workspace, financials |
| 53 | Transaction wireframes | Expenses, changes, billing |
| 54 | Directory / settings wireframes | Clients, vendors, workforce, modules |
| 55 | Mobile wireframes | FAB, sheets, field capture |
| 56 | Visual design direction | A/B/C options; Deep Teal recommended |
| 57 | Design tokens | Color/spacing/radius candidates |
| 58 | Typography & RTL | HE-first type roles; RTL rules |
| 59 | Color & status | Badges, alerts, money caution |
| 60 | Component visual specs | Shell, cards, buttons, patterns |
| 61 | Table & form design | Density, money input, progressive forms |
| 62 | Responsive visual rules | Desktop/tablet/mobile |
| 63 | Design accessibility | WCAG AA posture |
| 64 | Visual screen specs | Home, project, expenses, changes, billing |
| 65 | Pre-implementation decision pack | Blocker vs defer; owner recommendations |
| 66 | Technical stack review | Stack A/B/C scorecard + official sources |
| 67 | Recommended stack | Proposed V1 stack (awaiting owner) |
| 68 | Technical boundaries | Layers, modules, multi-agent ownership |
| 69 | Environments / deployment plan | Local/preview/prod; no prod DB on preview |
| 70 | Testing / quality strategy | Unit/integration/E2E + tenancy gates |
| 71 | Implementation blueprint | Master index for coding readiness |
| 72 | V1 database blueprint | Tables/families (not executable schema) |
| 73 | Auth / tenancy / permissions | Auth≠authz; permission catalog |
| 74 | RLS / security | Policy patterns + isolation tests |
| 75 | Storage / documents | Private bucket + metadata |
| 76 | Codebase module boundaries | Agent ownership map |
| 77 | Migrations / seed plan | Drizzle workflow + system vs demo seed |
| 78 | Wave implementation plan | Wave 0–3 scope |
| 79 | Multi-agent protocol | Lead / feature / review rules |
| 80 | Wave 0 acceptance criteria | Gate before Wave 1 |

---

## Naming conventions in docs

- **English** is used for canonical product/domain terms (e.g. `WorkPackage`, `ChangeRequest`).
- Temporary product name: **ProjectFlow** (final brand name may change).
- Technical entity names in docs are **working names**, not final database table names.
- Display terminology may vary by locale/vertical; canonical meaning must not.

---

## Change policy for documentation

When a decision is made:

1. Update the relevant domain document.
2. Mark the matching item in `18-OPEN-QUESTIONS.md` as decided.
3. Record the decision, date, and short rationale.
4. If the decision affects V1, update `16-V1-SCOPE.md`.
5. If it is future-only, update `19` / the relevant `20`–`38` doc and `17` as needed — **do not** silently move it into V1.

---

## Explicit non-goals for this phase

- No application scaffolding  
- No package installs  
- No database / migrations  
- No UI  
- No authentication implementation  
- No irreversible cloud vendor lock-in  

**Status:** `READY FOR OWNER REVIEW BEFORE IMPLEMENTATION`  

Owner has approved domain pack + Stack A. Next: review Blueprint `71`–`80`, then **explicitly authorize Wave 0** (scaffolding/provisioning).  

Until Wave 0 is authorized: **PLANNING ONLY** — no application code, packages, DB, or cloud provisioning from this phase.
