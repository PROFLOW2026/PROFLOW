# 19 — Future Capability Map

**Status:** Long-term architecture planning  
**Phase:** Planning only  
**Principle:** Plan wide — build in slices. This map does **not** expand V1 scope.

---

## 1. Purpose

Provide a master inventory of known ProjectFlow capabilities so future development does not repeatedly reopen foundational architecture questions.

Related detail docs: `20`–`38`.

---

## 2. Classification keys

### Capability class

| Class | Meaning |
|-------|---------|
| **Core extension** | Extends general project-business core |
| **Construction vertical** | Built Environment–specific packaging/UX |
| **Country Pack** | Jurisdiction/locale configuration |
| **Optional module** | Can be disabled/unused by many orgs |
| **Integration** | External system connector |
| **Enterprise capability** | Larger-org governance/security/ops |
| **Future vertical pack** | Non–Built Environment packaging later |

### Timing (conceptual, no calendar dates)

`V1` · `V1.x` · `V2` · `V3` · `Later` · `Research / optional`

---

## 3. Master capability map

| Capability family | Detail doc | Class | Timing |
|-------------------|------------|-------|--------|
| Org / users / roles / projects / WP / phases | `02`–`03`, `12`, `16` | Core | V1 |
| Contracts, CR/CO, quote versions | `05`, `16` | Core | V1 |
| Expenses, overhead, simple allocation, True Cost, time | `04`, `06`, `16` | Core | V1 |
| Basic outgoing billing / payments / outstanding | `04`, `16` | Core | V1 |
| Documents + secure storage metadata | `09` | Core | V1 |
| Israel Country Pack + Hebrew UI + tax basics | `10`, `11`, `30` | Country Pack | V1 |
| CRM / sales / pre-project lifecycle | `20` | Core extension | V2 |
| Quote templates / alternate options (pre-project) | `20` | Core extension | V2 |
| Opportunity → Client/Project conversion | `20` | Core extension | V2 |
| RFQ / supplier quote comparison | `21` | Optional module | V3 |
| Purchase Orders + committed costs | `21` | Optional module | V3 |
| Material catalog + historical prices | `21` | Optional module | V3 |
| Inventory / warehouse / issues-returns | `21` | Optional module | Later |
| Simple dates / milestones / progress % | `22` | Core extension | V1.x–V2 |
| Tasks / Gantt / critical path / resource scheduling | `22` | Optional / Construction | Later |
| Daily logs / punch lists / inspections / handover | `22` | Construction vertical | V3–Later |
| Asset registry / checkout / usage | `23`, `08` | Optional module | V3 |
| Fleet / vehicle true cost / cost per distance | `23`, `08` | Optional module | V3 |
| Maintenance schedules / meter-based service | `23` | Optional module | V3–Later |
| Insurance policies + renewal alerts | `24`, `08` | Optional module | V2–V3 |
| Licenses / certifications / compliance requirements | `24` | Core extension + Country Pack hooks | V2–V3 |
| Customer portal | `25` | Optional module | V2–V3 |
| Vendor / subcontractor portal | `25` | Optional module | V3 |
| E-signature | `25`, `32` | Integration | Later |
| In-app + email notifications | `26` | Core extension | V1.x |
| SMS / WhatsApp / push | `26` | Integration / Optional | Later |
| Automations / digests / escalation | `26` | Core extension | V2–Later |
| OCR / document intelligence | `27` | Optional module + Integration | V2–Later |
| AI suggestions & financial intelligence | `27` | Optional module | Later / Research |
| Full AR (aging, credit notes, retention) | `28` | Core extension | V2 |
| Full AP + PO matching | `28`, `21` | Optional module | V3 |
| Cash-flow forecasting | `28` | Core extension | V2–V3 |
| Accounting connectors | `28`, `32` | Integration | V2–Later |
| Reporting / dashboards / BI | `29` | Core extension | V1.x–Later |
| Configurable reports | `29` | Core extension | Later |
| Additional Country Packs | `30` | Country Pack | Later |
| Multi-currency conversion | `30`, `10` | Core extension | Later |
| Terminology packs / more locales | `30`, `10` | Core / Country / Vertical | V1.x–Later |
| PWA / offline drafts | `31` | Core extension | V2–V3 |
| Native mobile apps | `31` | Optional | Later / Research |
| Public API / webhooks / API keys | `32` | Platform / Enterprise | V2–Later |
| Payroll / calendar / payments / maps connectors | `32` | Integration | Later |
| MFA / SSO / SCIM / legal hold / regional hosting | `33` | Enterprise | Later |
| Legal / accounting / consulting vertical packs | `34` | Future vertical pack | Later |
| Custom fields / controlled customization | `35` | Core extension | V2–V3 |
| Templates & profession presets | `36` | Core / Construction vertical | V1.x–V2 |
| Data import / migration / export | `37` | Core extension | V1.x–V2 |
| ProjectFlow SaaS subscription billing | `38` | Platform (separate domain) | Later |

---

## 4. Architecture protection summary

### What the current core already protects

- Organization tenancy + roles
- Project → mandatory WorkPackage → optional Phase
- MoneyValue (amount + currency)
- Contract value vs billing vs payments
- ChangeRequest ≠ ChangeOrder
- Cost families + allocation extension points
- Effective-dated config / audit / soft delete
- Documents as first-class links
- Country Pack + override ladder
- English-canonical i18n / terminology keys

### Reserved relationships (do not close casually)

- Opportunity/Quote → Client/Project/Contract conversion path (`20`)
- Commitments (PO) distinct from Expenses/Actuals (`21`)
- External collaborator identity ≠ internal Membership (`25`)
- AI outputs as proposals with provenance, not ledger truth (`27`)
- Accounting external IDs / sync state (`28`)
- SaaS subscription entities isolated from customer BillingRecord (`38`)

### Genuine risks to watch (not redesign-now)

See §6 and final architecture review notes in this planning batch. No V1 redesign required solely because a future module exists.

---

## 5. What must NOT enter V1 just because it is listed here

Everything timed `V2` / `V3` / `Later` / `Research` stays out of V1 unless a separate owner decision moves it.

V1 remains as defined in `16-V1-SCOPE.md`.

---

## 6. Architecture protection review (cross-cutting)

| Future module | Blocked by current core? | Requires replacing core entity? | Addable as extension? | Construction-specific naming risk? | Reserve now? | V1 dead-end risk? |
|---------------|--------------------------|----------------------------------|------------------------|-------------------------------------|--------------|-------------------|
| CRM / pre-project | No | No | Yes | Low if Opportunity ≠ Project | Conversion links | Low if Client can be created late |
| Procurement / inventory | No | No | Yes (optional) | Avoid forcing inventory UX | CommittedCost ≠ Expense | Low if expenses stay actuals-only |
| Scheduling / field ops | No | No | Yes; field ops as vertical | “Site diary” should be vertical-packaged | Progress snapshots | Low if Phase remains optional |
| Assets / fleet | No | No | Yes | Keep Asset generic | Asset cost → allocation | Low; V1 has categorization only |
| Insurance / compliance | No | No | Yes | License names via Country Pack | Requirement targets polymorphic | Low |
| External portals | No | No | Yes | N/A | ExternalPrincipal ≠ Membership | **Watch:** do not overload Membership for clients/vendors |
| Notifications | No | No | Yes | N/A | Domain events ≠ providers | Low |
| AI / OCR | No | No | Yes | N/A | Proposal vs authoritative record | Low if CaptureJob reserved |
| Full AR/AP / accounting | No | No | Yes | BillingRecord name OK if not “statutory invoice” | Connector IDs | Low if BillingRecord stays generic |
| Reporting / BI | No | No | Yes | N/A | Export/API later | Low |
| Country packs | No | No | Yes | Avoid IL hardcoding | Override ladder | Low |
| Mobile / offline | No | No | Yes | N/A | Offline draft + sync | Low with responsive V1 |
| Public API | No | No | Yes | N/A | Stable external IDs | Prefer stable public IDs early when implementing |
| Enterprise security | No | No | Yes | N/A | Audit export hooks | Low |
| Other verticals | No | No | Yes (packs) | Prefer Project/Engagement terminology keys | Canonical keys | Low if core stays general |
| Custom fields | No | No | Yes (controlled) | N/A | Canonical vs custom boundary | **Watch:** do not make every field custom |
| Templates | No | No | Yes | Presets ≠ hardcoded product | Template → instance copy | Low |
| Import/export | No | No | Yes | N/A | Idempotent external keys | Low |
| SaaS billing | No | No if isolated | Yes (platform) | N/A | Separate bounded context | **Watch:** naming collision with BillingRecord |

### Genuine blockers / sharp edges (only)

1. **External collaborators must not be modeled as ordinary OrganizationMembership** without a distinct principal/scope model.  
2. **Committed costs (PO) must not be collapsed into Expense/Actual Cost** or inventory/procurement will fight the financial model.  
3. **ProjectFlow SaaS subscription billing must stay a separate bounded context** from customer project BillingRecord.  
4. **Custom fields must not replace canonical commercial/financial entities.**  
5. Prefer **stable public identifiers** when implementation starts, so API/integrations are not a rewrite later.

None of these require expanding V1 feature scope; they are modeling hygiene.

---

## 7. Related documents

- Roadmap → `17-FUTURE-ROADMAP.md`
- V1 scope → `16-V1-SCOPE.md`
- Open questions → `18-OPEN-QUESTIONS.md`
- Detail capabilities → `20`–`38`
