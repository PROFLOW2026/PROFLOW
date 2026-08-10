# SCHEMA_REQUEST — Vendor payments / Full AP (Agent 1)

**Status:** Required before persistence  
**Module:** `src/modules/ap`  
**Why:** Current `drizzle/schema/ap.ts` has `ap_bills` / `ap_bill_lines` / `ap_po_matches` only. Vendor payments need header + applications so one cash payment can settle multiple bills (and multiple partial payments per bill). Domain + application + gated UI are implemented; DB writes are blocked until Lead ships additive `0020+`.

## Tables

### `ap_payments` (payment header)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL FK → organizations | CASCADE; always filter in app |
| `vendor_id` | uuid NOT NULL FK → vendors | RESTRICT; same-org integrity |
| `amount` | money NOT NULL | header total; must equal sum(applications) |
| `currency` | currency NOT NULL | |
| `payment_date` | date NOT NULL | cash date |
| `method` | text NULL | check / transfer / cash / etc. |
| `reference` | text NULL | bank/cheque ref |
| `notes` | text NULL | |
| `status` | text NOT NULL DEFAULT `'recorded'` | CHECK IN (`recorded`, `void`) |
| `voided_at` | timestamptz NULL | set on void; never rewrite amount |
| `created_by_user_id` | uuid NULL FK → profiles | SET NULL |
| `created_at` / `updated_at` | timestamptz | shared timestamps |

**Indexes**

- `ap_payments_org_idx` (`organization_id`)
- `ap_payments_vendor_idx` (`vendor_id`)
- `ap_payments_org_date_idx` (`organization_id`, `payment_date`)

**Checks**

- `ap_payments_amount_positive`: `amount > 0`
- `ap_payments_status_known`: status in (`recorded`, `void`)

**RLS:** org membership policy (defense in depth; app always filters `organization_id`)

---

### `ap_payment_applications` (allocations to bills)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL FK → organizations | CASCADE; must match payment + bill org |
| `ap_payment_id` | uuid NOT NULL FK → ap_payments | CASCADE |
| `ap_bill_id` | uuid NOT NULL FK → ap_bills | RESTRICT |
| `applied_amount` | money NOT NULL | |
| `currency` | currency NOT NULL | must match payment + bill |
| `created_at` / `updated_at` | timestamptz | |

**Indexes**

- `ap_payment_applications_payment_idx` (`ap_payment_id`)
- `ap_payment_applications_bill_idx` (`ap_bill_id`)
- `ap_payment_applications_org_idx` (`organization_id`)
- UNIQUE (`ap_payment_id`, `ap_bill_id`) — one application row per bill per payment

**Checks**

- `ap_payment_applications_amount_positive`: `applied_amount > 0`

**Same-org integrity (preferred DB-level)**

- Trigger or composite FK pattern ensuring `ap_payments.organization_id = ap_payment_applications.organization_id = ap_bills.organization_id`
- Prefer also: `ap_payments.vendor_id = ap_bills.vendor_id` for each application

**RLS:** org membership policy

---

## Non-goals / financial invariants (must remain true)

- Vendor payment rows are **cash / AP only** — financial compose must **never** add payment amounts into Actual Cost.
- Vendor bill recognition remains the Actual path (`open` / `partially_matched` / `matched`).
- Outstanding is **derived**: `bill.total − Σ(active applications)`; do not store a mutable running balance on the bill.
- Void = status + `voided_at`; do not UPDATE amount/applications in place for corrections (record a new payment after void if needed).
- **Immutability (app + expected DB triggers):** recorded payments cannot be deleted; amount / currency / payment_date / vendor_id and applications are frozen after insert. Correction = void + new payment. Voided rows remain and contribute zero to paid/outstanding.
- **Optional metadata:** `method` / `reference` / `notes` may be updated on `recorded` payments only (`updateVendorPaymentMetadata`). Voided payments are fully frozen.

## Permissions

Reuse existing `ap.read` / `ap.manage`. No new permission keys required for MVP.

## Audit actions (Lead to register if not already)

- `ap.payment_recorded`
- `ap.payment_voided`

## Domain readiness

- `AP_PAYMENTS_PERSISTENCE_READY` in `domain/vendor-payments.ts` — **true** after owner applied `0020_overnight_foundations`.
- Repository: `data/payments.repository.ts` (interface + gated / Drizzle impl). In-memory = **test double only**.
- UI already shows `schemaPending` when `areApPaymentsAvailable()` is false.
- **Test toggle:** `enableApPaymentsPersistenceForTests()` / `disableApPaymentsPersistenceForTests()`, or env `AP_PAYMENTS_PERSISTENCE_READY=true|1` when `NODE_ENV=test` / `VITEST=true`. Production ignores the env alone.

### Owner flip checklist (after migrate — NOT tonight)

1. Apply `drizzle/migrations/0020_overnight_foundations.sql` to the target DB (owner-only; not agent).
2. Confirm tables exist: `ap_payments`, `ap_payment_applications` + unique anchors / composite FKs / vendor guard trigger.
3. Confirm Drizzle schema exports match (`drizzle/schema/ap.ts`).
4. Set `AP_PAYMENTS_PERSISTENCE_READY = true` in `src/modules/ap/domain/vendor-payments.ts`.
5. Smoke: record + void a vendor payment in a non-prod org; verify open AP / cash-flow outstanding decreases and Actual Cost unchanged.
6. Do **not** flip while tables are missing — gated repo + UI block writes.
