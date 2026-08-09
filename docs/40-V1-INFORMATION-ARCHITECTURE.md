# 40 — V1 Information Architecture

**Status:** UX planning draft  
**Phase:** Planning only — no visual design, no UI code  
**Depends on:** `16-V1-SCOPE.md`, `39-FLEXIBLE-OPTIONAL-WORKFLOWS.md`

---

## 1. Purpose

Define how V1 is structured from the user’s point of view: areas, objects, and how depth appears only when chosen.

---

## 2. Core UX principle

**Progressive Complexity**

- Simple users see a simple product.
- Deeper capabilities appear when enabled or first used.
- One giant “all modules” shell is forbidden.
- Internal technical structure (e.g. Default WorkPackage) may exist without being exposed.

---

## 3. Object hierarchy (user-facing)

```text
Organization (tenant)
  ├── Home / Dashboard
  ├── Projects
  │     └── Project Workspace
  │           ├── Overview
  │           ├── Financials
  │           ├── Expenses
  │           ├── Changes
  │           ├── Billing
  │           ├── Work (WorkPackages — revealed when multi-area)
  │           ├── Time / Team (if workforce used)
  │           ├── Documents
  │           └── Details
  ├── Expenses (cross-project)
  ├── Billing / Payments (if billing used)
  ├── Changes (cross-project optional; primary home = Project)
  ├── Clients (optional directory)
  ├── Vendors (optional directory)
  ├── Workforce (optional)
  ├── Documents (optional global view)
  └── Settings
```

---

## 4. Top-level product areas (V1)

| Area | Role | Always in nav? |
|------|------|----------------|
| **Home** | Business overview | Yes |
| **Projects** | Main operational/commercial center | Yes |
| **Expenses** | Business + project costs | Yes (core cost loop) |
| **Billing** | Outgoing billing, payments, outstanding | Surfaced when billing used/enabled |
| **Changes** | Cross-project extras list | Prefer **inside Projects** + optional cross-project entry; see §5 |
| **Clients** | Structured client directory | Optional |
| **Vendors** | Structured vendor directory | Optional |
| **Workforce** | Employees, time, labor cost | Optional |
| **Documents** | Cross-entity file view | Optional / secondary |
| **Settings** | Business + module + tax + users | Yes |

---

## 5. Recommendation: Changes placement

**Primary:** Project → Changes tab (where work happens).  
**Secondary:** Optional cross-project “Changes” list under Projects or Billing-adjacent filter (“Unbilled approved changes”).

**Do not** make Changes a heavy always-on top nav item for minimal orgs.  
If needed later, add as nav item once the org actively uses change tracking.

---

## 6. Global affordances

| Affordance | Purpose |
|------------|---------|
| Global `+ New` | Adaptive quick-create (`41`) |
| Search (basic) | Projects/clients first; full global search may be V1.x if capacity tight (`48`) |
| Org switcher | Future multi-org; V1 may be single-org UI |

---

## 7. What users should never see by default

Unless enabled/used:

- Employees / timesheets chrome
- Advanced vendor CRM-like pages
- Allocation engine UI
- Phases / multi-WP management
- Assets / fleet / insurance / inventory / CRM / portals / AI

---

## 8. Related docs

- Navigation → `41`
- Onboarding → `42`
- Flows → `43`
- Screens → `44`
- Project workspace → `45`
- Dashboards → `46`
- Mobile → `47`
- Validation → `48`
