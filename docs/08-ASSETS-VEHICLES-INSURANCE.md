# 08 — Assets, Vehicles & Insurance

**Status:** Draft with future-architecture cross-links  
**Phase:** Planning only

---

## 1. Purpose

Describe future-ready modules for equipment, vehicles, and insurance, including cost allocation concepts.

These modules are important for true business cost, but are **not all required in V1**.

### Deeper future architecture

| Topic | Detail doc |
|-------|------------|
| Assets / fleet / maintenance depth | `23-ASSETS-FLEET-MAINTENANCE.md` |
| Insurance + compliance/licenses | `24-INSURANCE-COMPLIANCE-LICENSES.md` |
| Capability timing map | `19-FUTURE-CAPABILITY-MAP.md` |

This file remains the shorter planning overview; `23`/`24` expand long-term capability surface without changing V1 scope.

---

## 2. Assets / Equipment

### Meaning

Trackable capital or durable items used by the business.

Examples:

- power tools
- machines
- generators
- measuring equipment
- computers
- specialty professional equipment

### Conceptual data

- name / type category
- purchase price (money + currency)
- purchase date
- warranty
- serial number
- responsible employee
- location
- status (available / in use / maintenance / retired)
- maintenance & repair history
- project usage history
- documents
- effective operating cost concepts

### Goals over time

- know what we own
- know where it is
- estimate cost of using it on projects
- plan maintenance and replacement

---

## 3. Vehicles

### Meaning

A specialized asset class with transportation-specific cost drivers.

### Whether Vehicle is separate entity

- **Option A:** `Vehicle` specializes `Asset`  
- **Option B:** Independent module with optional link to Asset  
- **Recommendation:** Option A (specialization)  
- **OWNER DECISION REQUIRED**

### Vehicle cost/event types

- acquisition / lease / financing
- insurance
- licensing
- maintenance
- tires
- repairs
- fuel
- parking
- tolls
- odometer / distance
- responsible employee
- project usage

### Future calculations

- monthly holding cost
- cost per km/mile
- project-allocated vehicle cost

---

## 4. Depreciation and cost recovery (conceptual)

Asset costs are not always immediate project expenses.

Possible future approaches:

- straight-line depreciation into overhead
- usage-based allocation to projects
- simple manual monthly charge
- no depreciation in-app; import from accounting

ProjectFlow should not pretend to replace accounting depreciation rules in V1.

**OWNER DECISION REQUIRED** whether any depreciation support appears before V3.

---

## 5. Insurance module

### Meaning

General insurance registry for business risk coverage.

### Example policy types

- business insurance
- professional liability
- third-party liability
- employers’ liability
- vehicle
- equipment
- contractors’ works
- project-specific insurance
- custom types

### Policy data

- insurer
- policy number
- coverage amount
- period start/end
- premium cost
- documents
- coverage links (org / project / asset / vehicle / vendor requirement)
- allocation method for premium cost
- renewal alerts

### Effective dating

Premiums, coverage amounts, and allocation methods may change over time. Keep history.

---

## 6. Allocation intersections

Insurance and assets often feed cost allocation:

Examples:

- annual business insurance allocated in V1 via manual amount/%; later by hours or contract basis
- vehicle insurance allocated by distance or project days (later)
- equipment insurance allocated to owning department/overhead

See `04-FINANCIAL-MODEL.md`.

---

## 7. Documents and alerts

Both assets and insurance are document-heavy and date-sensitive.

Needed later:

- expiry alerts (insurance, warranty, license)
- maintenance due alerts
- missing document alerts for subcontractors’ insurance

---

## 8. V1 recommendation

**Defer full asset/vehicle/insurance registry modules.**

V1 must still support:

- Asset / Capital-related **expense categorization**
- document uploads that can later attach to these entities
- allocating such costs via V1 simple shared/overhead allocation when relevant

Do not block future entity creation by hardcoding expense categories that cannot map later.

---

## 9. Related documents

- Cost families/allocation → `04-FINANCIAL-MODEL.md`
- Documents → `09-DOCUMENTS-EXPENSE-CAPTURE.md`
- Future assets/fleet depth → `23-ASSETS-FLEET-MAINTENANCE.md`
- Insurance/compliance depth → `24-INSURANCE-COMPLIANCE-LICENSES.md`
- Capability map → `19-FUTURE-CAPABILITY-MAP.md`
- Roadmap → `17-FUTURE-ROADMAP.md`
