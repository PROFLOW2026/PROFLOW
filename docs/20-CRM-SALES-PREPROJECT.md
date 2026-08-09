# 20 — CRM, Sales & Pre-Project Lifecycle

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** primarily V2 (not V1)  
**Class:** Core extension

---

## 1. Purpose

Define pre-project commercial lifecycle so sales work can later flow cleanly into existing Client / Project / Contract / Quote / Change architecture — without duplicating or replacing it.

---

## 2. Boundary with existing commercial core

| Pre-project (this doc) | Existing delivery commercial core |
|------------------------|-----------------------------------|
| Lead / Prospect / Opportunity | Client / Project |
| Sales Quote (pre-win) | Project Contract + Quote versions + ChangeRequest/ChangeOrder |
| Acceptance of sales quote | Creates/activates Client, Project, Contract, Original Contract Value |
| Lost opportunity | Stays in CRM history; no Project required |

### Rules

1. Do **not** invent a second Change Order system for sales.
2. Pre-win quotes may later become the **initial project quote / contract baseline**.
3. Post-win scope changes use existing **ChangeRequest → ChangeOrder**.
4. Opportunity is not a Project. Conversion is an explicit action.

---

## 3. Proposed entities (conceptual)

| Entity | Meaning |
|--------|---------|
| **Lead** | Early unqualified inbound/outbound interest |
| **Prospect / Company** | Potential customer organization or person |
| **Contact** | Person linked to prospect/client |
| **Opportunity** | Qualified sales pursuit with pipeline stage |
| **ReferralSource** | How the opportunity arrived |
| **SiteVisit** | Pre-quote visit/assessment |
| **Estimate** | Internal estimation / takeoff / effort model |
| **SalesQuote** | Customer-facing pre-win offer (versioned) |
| **SalesQuoteVersion** | Immutable version of a sales quote |
| **QuoteTemplate** | Reusable quote structure |
| **QuoteAlternate** | Optional alternate packages/options inside a version |
| **OpportunityNote** | Notes / activity log items |
| **FollowUpReminder** | Scheduled sales follow-up |
| **LostReason** | Structured reason when opportunity lost |

Contacts/companies should be reusable later as Client contacts after conversion.

---

## 4. Capability checklist

- leads
- prospects
- contacts
- companies
- opportunities
- referral source
- sales pipeline stages
- site visit before quote
- opportunity notes
- project estimation
- initial budget (internal)
- quote creation
- quote templates
- alternate options
- quote versions
- acceptance
- conversion Opportunity/Quote → Client/Project/Contract
- lost opportunities
- reasons lost
- expected project value
- expected start date
- follow-up reminders

---

## 5. Pipeline (conceptual)

```text
Lead
  → Prospect / Contact enrichment
  → Opportunity (pipeline stage)
  → Site visit (optional)
  → Estimate / initial budget (internal)
  → SalesQuote versions (+ alternates)
  → Sent / negotiation
  → Accepted → Conversion
     or Lost (+ reason)
```

Pipeline stages should be organization-configurable later, with sensible presets.

---

## 6. Conversion model

### On acceptance / win

Typical conversion outputs:

1. Ensure **Client** exists (create or link from Prospect)
2. Create **Project** (or draft project)
3. Ensure ≥1 **WorkPackage** (default/general if simple)
4. Create **Contract** with **Original Contract Value** from accepted quote
5. Preserve link back to Opportunity + accepted SalesQuoteVersion
6. Carry selected documents, contacts, estimate assumptions

### What conversion should copy vs reference

| Item | Suggested handling |
|------|--------------------|
| Accepted commercial totals | Become Original Contract Value |
| Line items / packages | Seed WorkPackages / budget lines where useful |
| Documents | Link/copy per policy |
| Estimate internals | Keep as historical estimate baseline |
| Pipeline notes | Remain on Opportunity; optionally summarize to Project |

### Anti-duplication

After conversion:

- Further customer changes → ChangeRequest / ChangeOrder
- Do not keep editing the accepted sales quote as if it were live contract value
- SalesQuoteVersion remains historical

---

## 7. Relationship to project quotes

There may be two quote contexts over time:

1. **SalesQuote** — pre-project, attached to Opportunity  
2. **Project Quote** — already modeled for changes / additional offers on an active Project

Implementation may unify storage with a `QuoteContext` discriminator, or keep separate tables with shared versioning patterns.  
**Open later decision** — not required for V1.

Recommendation: shared versioning patterns; clear context boundary in product language.

---

## 8. Permissions & UX notes

- Sales roles may see pipeline/value without seeing delivery cost internals
- Delivery PMs may not need full CRM
- Consultants and contractors both benefit; avoid construction-only CRM labels

---

## 9. V1 impact

**None required.**  
V1 can create Client/Project/Contract directly. CRM is an additive front-end to that funnel.

---

## 10. Related documents

- Contracts/quotes/changes → `05-CONTRACTS-QUOTES-CHANGES.md`
- Business/project model → `03-BUSINESS-PROJECT-MODEL.md`
- Capability map → `19-FUTURE-CAPABILITY-MAP.md`
- Templates → `36-TEMPLATES-PRESETS.md`
