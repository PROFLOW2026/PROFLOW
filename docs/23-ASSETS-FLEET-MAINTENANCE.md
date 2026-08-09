# 23 — Assets, Fleet & Maintenance (Future Architecture)

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** V3 (+ Later for advanced maintenance)  
**Class:** Optional module  
**Cross-reference:** Expands `08-ASSETS-VEHICLES-INSURANCE.md` (does not replace it)

---

## 1. Purpose

Define the long-term equipment, vehicle, and maintenance surface, and how their costs feed True Cost / allocation models already planned in the financial core.

---

## 2. Relationship to `08`

| Doc | Role |
|-----|------|
| `08` | Initial planning for assets/vehicles/insurance concepts and V1 categorization posture |
| `23` | Deeper future architecture for registry, fleet economics, maintenance operations |

If details differ, prefer this file for future module depth; keep `08` aligned via cross-links.

---

## 3. Equipment / asset registry

Capabilities:

- asset registry
- serial numbers
- purchase (MoneyValue + date)
- warranty
- depreciation / cost recovery concepts
- assignment
- checkout / check-in
- project usage
- employee responsibility
- location
- damage records
- loss / theft status
- repair
- maintenance linkage
- documents

### Conceptual entities

**Asset**, **AssetAssignment**, **AssetCheckout**, **AssetUsageEvent**, **MaintenanceEvent**, **DamageRecord**

Asset remains generic (tools, machines, IT, instruments). Construction tools are examples, not the only type.

---

## 4. Vehicles / fleet

Vehicle is a specialization of Asset (preferred; see open discussion in `08`).

Capabilities:

- ownership / lease
- financing
- insurance link (`24`)
- registration
- inspections
- fuel
- maintenance
- repairs
- tires
- parking
- tolls
- mileage / odometer
- employee assignment
- project travel linkage
- cost per km/mile
- monthly true cost

### Cost rollup examples

```text
Monthly vehicle true cost ≈
  finance/lease
  + insurance premium allocation
  + fuel
  + maintenance/repairs
  + tires
  + parking/tolls
  + other holding costs
```

```text
Cost per distance ≈ period true cost / distance in period
```

Project travel can allocate distance- or day-based vehicle cost into Direct / Shared cost families.

---

## 5. Maintenance

- recurring service (time-based)
- meter-based service (hours/km)
- reminders (`26`)
- repair history
- downtime
- documents
- status impact on availability for scheduling (`22`)

---

## 6. Feeding Cost Allocation / True Cost

| Cost source | Possible treatment |
|-------------|--------------------|
| Asset purchase | Asset/Capital; optional depreciation into overhead |
| Repairs/maintenance | Overhead, shared, or direct if project-caused |
| Checkout usage on project | Direct or shared allocation |
| Vehicle monthly holding | Shared/overhead → allocate by hours/distance/manual % |
| Fuel tied to project trip | Direct project cost |

V1 already requires expense categorization readiness for asset/capital-related costs and simple allocation methods. Full registry is not required to begin capturing those expenses.

---

## 7. V1 impact

**No V1 module build.**  
Keep expense categories mappable to future Asset/Vehicle records.

---

## 8. Related documents

- Summary planning → `08-ASSETS-VEHICLES-INSURANCE.md`
- Insurance/compliance → `24-INSURANCE-COMPLIANCE-LICENSES.md`
- Financial model → `04-FINANCIAL-MODEL.md`
- Scheduling (equipment scheduling) → `22-SCHEDULING-FIELD-OPERATIONS.md`
- Capability map → `19-FUTURE-CAPABILITY-MAP.md`
