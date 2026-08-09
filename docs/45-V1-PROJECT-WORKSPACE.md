# 45 — V1 Project Workspace

**Status:** UX planning draft  
**Phase:** Planning only

---

## 1. Purpose

Project is the main operational/commercial workspace.  
Overview answers the job-to-be-done in one glance; tabs add depth without empty clutter.

---

## 2. Project header (candidate)

Always useful:

- Project name
- Client (or “No client yet”)
- Status (text + icon; not color-only)
- Current Contract Value
- Pending changes (value/count)
- Actual Cost to Date
- Invoiced · Paid · Outstanding
- Estimated profit + link to calculation basis

Keep header scannable; details live in tabs.

---

## 3. Tabs / sections

| Tab | When shown | Purpose |
|-----|------------|---------|
| **Overview** | Always | Instant truth |
| **Financials** | Always | Deeper cost/billing/profit |
| **Expenses** | Always | Project costs |
| **Changes** | Always | CR/CO loop |
| **Billing** | If billing enabled/used | Billing records & payments |
| **Work** | After multi-WP revealed / user opens split | WorkPackages (+ optional Phases) |
| **Time / Team** | Workforce used | Assignments & time |
| **Documents** | Always soft, or when any doc exists | Attachments |
| **Details** | Always | Metadata, client, domains, dates, tax |

Do not create empty tabs for unused modules when avoidable (especially Time/Team, Billing, Work).

---

## 4. Overview content

Answers:

1. What is this project?  
2. What was agreed?  
3. What changed?  
4. What has it cost?  
5. What billed / paid / outstanding?  
6. Estimated profit?  
7. Is that based on partial inputs?

### Candidate cards (not all required if zero/unused)

- Current Contract Value  
- Pending Changes  
- Actual Cost to Date  
- Estimated Final Cost (if forecasting used; else soft)  
- Estimated Profit + What’s included  
- Invoiced · Paid · Outstanding  

Do not overload. Prefer 4–8 cards max for simple projects.

---

## 5. WorkPackages UX

### Simple project (default)

- No Work Packages management UI
- All costs/time/changes attach to hidden `General` / Default package
- User never needs the word “WorkPackage” unless splitting

### Reveal multi-area

CTA: `Split project into areas / disciplines`

Then show packages, e.g. Electrical, Plumbing, HVAC, Architecture, Safety.

Each package summary may show (when data exists):

- budget/contract portion (if set)
- costs
- changes
- team / vendors (if used)
- documents
- profitability slice

### Transition without recreate

| Step | Behavior |
|------|----------|
| Before | Single Default/General WP (hidden) |
| On split | Default remains (renamable); user adds packages |
| History | Existing lines stay on Default/General unless user reassigns |
| UX copy | Explain that past items stay under General until moved |

---

## 6. Changes inside project

List columns (conceptual):

- title, value, status, date  
- approved/pending  
- invoiced/not invoiced  
- associated areas (WPs)

Summaries:

- Approved additions / reductions  
- Pending value  
- Potential value  
- Unbilled approved changes  

Create flow: single seamless CR → price → approval → CO (`43` Flow 13).

---

## 7. Billing inside project

Clear separation from Contract Value.

Show project-scoped Invoiced / Paid / Outstanding.  
+ Billing / + Payment actions when module active.

---

## 8. Related

`40`, `43`, `44`, `46`, `39`
