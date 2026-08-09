# 44 — V1 Screen Inventory

**Status:** UX planning draft  
**Phase:** Planning only — no pixel UI  

For each screen: purpose, users, entry, data, actions, advanced, empty, mobile, permissions, module deps.

---

## Auth & onboarding

| Screen | Purpose | Primary user | Entry | Main data / actions | Module deps |
|--------|---------|--------------|-------|---------------------|-------------|
| Sign in / Sign up | Authenticate | Any | Public | Email/password; verify | Always |
| Accept invite | Join org | Invitee | Email link | Accept → membership | Always |
| Onboarding business | Name org | Owner | After signup | Org name | Always |
| Onboarding locale | Country/lang/currency | Owner | Next | Defaults | Always |
| Onboarding modules (optional) | Nav defaults | Owner | Next / Skip | Checkboxes | Always |
| Welcome / first-use Home | CTA to first project | Owner/Manager | Empty org | Create project / Add expense | Always |

---

## Home

| Screen | Purpose | Entry | Main shown | Actions | Empty | Module deps |
|--------|---------|-------|------------|---------|-------|-------------|
| Home dashboard | Business overview | Nav Home | Active projects; contract/cost/billing/changes summaries; profit with coverage | + Project, + Expense, open project | Welcome CTAs — no zero spam | Widgets adapt (`46`) |

---

## Projects

| Screen | Purpose | Entry | Main shown | Actions | Empty | Module deps |
|--------|---------|-------|------------|---------|-------|-------------|
| Project list | Find projects | Nav Projects | Name, client, status, contract, cost, outstanding | + Project, filters, open | CTA create first | Always |
| New Project (simple) | Ultra-light create | + New / list | Name required; optional client/value/domain/location | Save; Add more details | — | Always |
| New Project (more details) | Progressive create | Add more details | Client, commercial, work, location, dates, structure, team | Save | — | Structure/team sections contextual |
| Project Overview | Instant project truth | Project tab | Contract, pending, costs, billing, profit + coverage | Quick + Expense/Change/Billing | Soft empty cards | Always |
| Project Financials | Deeper money | Tab | Same metrics + breakdowns | Allocate (if overhead), export later | Honest empty | Always |
| Project Expenses | Project costs | Tab | Expense list/filters | + Expense, open, split | Add first expense | Always |
| Project Changes | Extras | Tab | CR list + summaries | + Change | Add first change | Always |
| Change create/edit | CR→CO flow | + Change | Description, price, quote version, status | Save, send, approve/reject | — | Always |
| Project Billing | AR basics | Tab | Billing records, paid, outstanding | + Billing, + Payment | Enable/add billing | Billing used |
| Project Work | Multi-WP | Tab / reveal | Packages, costs per area | Split/add/rename WP; optional phases | Hidden until split | Multi-WP |
| Project Time/Team | Workforce on project | Tab | Team, time | + Time, assign | Tab hidden if no workforce | Workforce |
| Project Documents | Files | Tab | Attachments | Upload | Soft empty | Docs optional |
| Project Details | Metadata | Tab | Client, dates, domains, tax, status | Edit | — | Always |

---

## Expenses (global)

| Screen | Purpose | Entry | Main shown | Actions | Module deps |
|--------|---------|-------|------------|---------|-------------|
| All Expenses | Cross-project costs | Nav | Table/cards + filters | + Expense, open | Always |
| Quick Expense | Fast capture | + New | Amount, desc, project, supplier | Save; More details | Always |
| Expense detail | Enrich/view | List/project | Full fields, splits, doc | Edit, promote Vendor | Always |
| Business/Overhead Expenses | Non-project costs | Filter/section | Overhead list | + Expense, allocate | Overhead tools optional |

---

## Billing (global)

| Screen | Purpose | Entry | Main shown | Actions | Module deps |
|--------|---------|-------|------------|---------|-------------|
| Billing list | Business AR | Nav when used | Invoiced/paid/outstanding/overdue | + Billing | Billing |
| Billing detail | One record | List/project | Amounts, docs, payments | + Payment | Billing |
| Payment create | Cash in | + Payment | Amount, date, target billing | Save | Billing |

---

## Clients / Vendors (optional)

| Screen | Purpose | Entry | Main shown | Actions | Module deps |
|--------|---------|-------|------------|---------|-------------|
| Client list | Directory | Nav when used | Names, projects count | + Client | Clients |
| Client detail | Progressive profile | List/project | Contacts, docs, projects | Edit enrich | Clients |
| Vendor list | Directory | Nav when used | Names, spend | + Vendor | Vendors |
| Vendor detail | Basic profile | List/expense promote | Expenses, projects, docs | Edit | Vendors |

---

## Workforce (optional)

| Screen | Purpose | Entry | Main shown | Actions | Module deps |
|--------|---------|-------|------------|---------|-------------|
| Employee list | People costing | Nav Workforce | Name, type, rate | + Employee | Workforce |
| Employee detail | Rates/burden | List | Effective-dated rates | Edit | Workforce |
| Time list / entry | Hours | Workforce / + Time | Entries by date/project | + Time | Workforce |

---

## Documents (optional hub)

| Screen | Purpose | Entry | Recommendation |
|--------|---------|-------|----------------|
| Global Documents | Cross search | Nav optional | **V1: secondary.** Prefer entity-context attachments; global hub optional if capacity |

---

## Settings

| Screen | Purpose | Main sections |
|--------|---------|---------------|
| Business | Name, country, currency, language, timezone | Always |
| Modules / Features | Show/hide areas; never delete data | Always |
| Professions & Services | Domains, custom services | Always |
| Costs | Categories, overhead helpers | Always |
| Tax | Defaults, overrides | Always |
| Users & Permissions | Invite, roles, scopes | Always |
| Terminology | Basic/future labels | Minimal V1 / later |

---

## Permissions considerations (all screens)

- Owner/Finance: financial figures, tax, modules  
- PM: assigned projects; financial visibility per role settings (H2 OPEN)  
- Worker: time/expense create; limited profit  
- Hide actions user cannot perform; don’t show empty forbidden modules as errors  

---

## Related

`40`, `45`, `46`, `47`, `48`
