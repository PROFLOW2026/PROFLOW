# 21 — Procurement, Materials & Inventory

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** V3–Later (optional module)  
**Class:** Optional module (critical for many contractors; unused by many consultants)

---

## 1. Purpose

Plan purchasing, materials, and inventory without forcing them into every organization’s UX, and without breaking the existing cost model.

---

## 2. Architectural rules

1. Module is **optional**. Architects/consultants may never enable inventory.
2. **Committed cost ≠ actual expense.** POs create commitments; invoices/receipts create actuals.
3. Inventory issues to projects create project material cost (and stock movement).
4. Reuse Vendor, Document, WorkPackage, MoneyValue, audit, and allocation concepts.
5. Do not hardcode construction SKUs into core.

---

## 3. Procurement

### Concepts

| Concept | Meaning |
|---------|---------|
| **RFQ** | Request for quote to one or more vendors |
| **SupplierQuotation** | Vendor response |
| **QuoteComparison** | Side-by-side evaluation |
| **VendorSelection** | Chosen supplier decision record |
| **PurchaseOrder** | Commitment to buy |
| **POAmendment** | Versioned change to PO |
| **POApproval** | Internal approval chain |
| **DeliveryReceipt** | Partial/full goods receipt |
| **SupplierInvoiceMatch** | Match invoice to PO/receipts |
| **POVariance** | Quantity/price/amount differences |

### Flow

```text
Need (project/WP/stock)
  → RFQ
  → Supplier quotations
  → Comparison / selection
  → PO (+ approvals)
  → Expected delivery
  → Partial/full receipt
  → Supplier invoice matching
  → Payment (AP)
```

### Financial meaning

| Stage | Financial effect |
|-------|------------------|
| PO approved | Committed cost |
| Goods/services received | Accrual/actualization policy (later) |
| Supplier invoice matched | AP actual |
| Payment | Cash out |

V1 expenses remain valid without POs. Future reporting should show Committed vs Actual.

---

## 4. Materials catalog

| Concept | Meaning |
|---------|---------|
| **MaterialItem** | Organization-defined catalog item |
| Manufacturer / model | Identity attributes |
| Unit | Explicit unit of measure |
| Standard cost | Internal planning cost |
| Vendor price | Price per vendor |
| Project-specific price | Override for a project |
| Historical prices | Effective-dated price history |
| Price validity periods | From/until |

Catalog items may be stocked or non-stocked (buy-to-project).

---

## 5. Inventory / warehouse

| Concept | Meaning |
|---------|---------|
| **StockLocation** | Warehouse, room, yard, or vehicle-as-location |
| Stock quantity | On-hand by item/location |
| Reservation | Soft hold for a project/WP |
| Transfer | Location → location |
| Issue to project | Stock out to project consumption |
| Return from project | Stock in from project |
| Damaged / lost | Write-off / adjustment reasons |
| Minimum stock | Reorder threshold |
| Reorder alerts | Notifications / tasks |

Vehicles as mobile stock locations are optional specialization of StockLocation.

---

## 6. Project material consumption

Track per project/WP/item:

- planned quantity
- ordered quantity
- received
- used
- returned
- waste
- actual cost

This feeds project Actual Cost and later variance analytics (`29`).

---

## 7. Fit with existing cost families

- Direct project materials → Direct Project Cost  
- Shared warehouse handling → Shared Cost / Overhead  
- Stock adjustments / shrinkage → Overhead or policy-driven category  
- Capital spare equipment purchases may still use Asset/Capital categorization (`08`, `23`)

---

## 8. V1 impact

**No V1 scope change.**  
V1 continues with expenses + documents + vendors. Reserve conceptual room for CommittedCost later.

---

## 9. Related documents

- Vendors → `07-VENDORS-SUBCONTRACTORS.md`
- Financial model → `04-FINANCIAL-MODEL.md`
- Financial expansion → `28-FINANCIAL-EXPANSION-INTEGRATIONS.md`
- Field ops (delivered materials) → `22-SCHEDULING-FIELD-OPERATIONS.md`
- Capability map → `19-FUTURE-CAPABILITY-MAP.md`
