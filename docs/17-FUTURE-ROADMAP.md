# 17 — Future Roadmap

**Status:** Directional draft aligned to capability architecture  
**Phase:** Planning only  
**Note:** No calendar dates. Labels are sequencing hints only.  
**Detail map:** `19-FUTURE-CAPABILITY-MAP.md` and docs `20`–`38`

---

## 1. Purpose

Show how ProjectFlow can grow after V1 without rewriting the core.  
**Plan wide — build in slices.** Future docs do not expand V1 scope.

---

## 2. V1 (owner-directed — unchanged by this planning batch)

As defined in `16-V1-SCOPE.md`:

- broad Built Environment market, simple UX
- mandatory WorkPackages (+ optional Phase)
- CR/CO, basic billing/payments/outstanding
- overhead + simple allocation
- True Cost (base + burden + optional components)
- documents, Hebrew-first, global-ready core

---

## 3. V1.x — Stabilization & light acceleration

- UX hardening from pilot feedback
- role/permission polish
- better project dashboards (`29`)
- export basics CSV/PDF (`37`)
- in-app + email notification essentials (`26`)
- light templates/presets if onboarding needs them (`36`)
- performance/security hardening

---

## 4. V2 — Commercial depth & pre-project

- CRM / opportunities / sales quotes → conversion (`20`)
- richer AR beyond basic billing: applications, aging, credit notes, retention concepts (`28`)
- cash-flow views (`28`)
- customer portal (scoped) (`25`)
- compliance/insurance expiry tracking (structured) (`24`)
- advanced allocation methods beyond manual amount/% (`04`, `28`)
- accounting connector beginnings (`28`, `32`)
- OCR invoice/receipt assistance (`27`)
- custom fields (controlled) (`35`)
- public API / webhooks foundation (`32`)

---

## 5. V3 — Operations depth

- procurement: RFQ/PO/committed costs (`21`)
- materials catalog; inventory if needed (`21`)
- assets / fleet / maintenance (`23`)
- vendor/subcontractor portal (`25`)
- field operations pack: daily logs, punch lists, inspections (`22`)
- deeper scheduling (tasks toward Gantt as demand justifies) (`22`)
- AP matching to PO (`28`, `21`)

---

## 6. Later / Research tracks (parallelizable)

| Track | Docs |
|-------|------|
| AI financial intelligence & assistant | `27` |
| PWA offline → native only if justified | `31` |
| SMS/WhatsApp channels | `26` |
| Multi-currency conversion + more Country Packs | `30` |
| Enterprise SSO/SCIM/legal hold/regional hosting | `33` |
| Future vertical packs (legal/accounting/etc.) | `34` |
| Configurable BI | `29` |
| ProjectFlow SaaS subscription billing (separate domain) | `38` |
| Full integration marketplace | `32` |

---

## 7. What could pull work forward

Evidence-based reordering examples:

- Invoice photo overload → pull OCR earlier (`27`)  
- Consultant pilots → deepen time/billing/CRM earlier than inventory (`20`, `28`)  
- Main contractor pilots → subcontractors/retention/PO earlier (`21`, `28`)  
- Compliance-heavy bids → insurance/cert tracking earlier (`24`)

---

## 8. Architecture protection reminder

Before implementing any future slice, check `19-FUTURE-CAPABILITY-MAP.md` §6:

- ExternalPrincipal ≠ Membership  
- CommittedCost ≠ Expense  
- SaaS billing ≠ customer BillingRecord  
- Custom fields do not replace canonical commercial entities  

---

## 9. Related documents

- Capability map → `19-FUTURE-CAPABILITY-MAP.md`
- V1 scope → `16-V1-SCOPE.md`
- Principles → `01-PRODUCT-PRINCIPLES.md`
- Open questions → `18-OPEN-QUESTIONS.md`
- Future detail docs → `20`–`38`
