# 38 — ProjectFlow SaaS Billing & Packaging

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** Later (before commercial launch / scaling)  
**Class:** Platform bounded context (not customer project billing)

---

## 1. Purpose

Plan how organizations pay for ProjectFlow itself.

This is **different** from customer project BillingRecord / Invoice concepts inside the product.

---

## 2. Hard separation rule

| Context | Examples |
|---------|----------|
| **Customer project commercial domain** | Contract Value, ChangeOrder, BillingRecord, Payment, Outstanding |
| **ProjectFlow SaaS commercial domain** | Subscription, Plan, Seat, Invoice-to-tenant, usage limits |

**Do not mix these entity families.**  
Use distinct names in code/docs (e.g. `Subscription`, `SaasPlan`, `SaasInvoice`) — never overload `BillingRecord` for both.

---

## 3. Future SaaS concepts

- organization subscription
- plans
- users / seats
- usage limits
- storage limits
- optional modules (portal, inventory, AI, etc.)
- trials
- billing provider abstraction
- country/currency considerations for charging tenants

---

## 4. Packaging (undecided)

Possible directions (not chosen):

- flat organization plans
- seat-based pricing
- module add-ons
- usage-based storage/AI
- country-pack inclusive vs add-on

**Do not decide pricing now.**

See also open question `K1` in `18-OPEN-QUESTIONS.md` (commercial packaging). Keep technical feature flags possible regardless of pricing model.

---

## 5. Provider abstraction

```text
SaasBillingPort
  → Stripe / Paddle / local PSP / manual invoicing adapters
```

No provider commitment in this phase.

---

## 6. V1 impact

**No SaaS billing implementation required for product-domain V1 planning.**  
When launching commercially, implement as a separate bounded context.

---

## 7. Related documents

- Customer financial model → `04`, `28`
- Open questions packaging → `18` (`K1`)
- Capability map → `19`
