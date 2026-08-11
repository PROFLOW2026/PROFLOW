# Portal module (Customer / Vendor collaboration)

## Public portal verdict: **DISABLED**

| Flag | Value |
|------|--------|
| `isExternalPublicAccessEnabled()` | `false` |
| `EXTERNAL_PUBLIC_ACCESS_STATUS` | `disabled` |

**Exact reason:** Public customer/vendor login must not ship until a safe **ExternalPrincipal** session path exists — separate from `OrganizationMembership`, rate-limited, grant-scoped, with revoke propagation and magic-link/OTP design. Enabling `/portal/customer` or `/portal/vendor` without that would fake public auth and risk leaking membership-scoped financial truth.

Public routes hard-redirect to the disabled notice (`src/app/[locale]/portal/**`). Do not flip the flag overnight.

## What is live (internal share architecture)

Admin-mediated foundation under **Settings → Portal** (`portal.manage`):

- **Grants** for customer and vendor ExternalPrincipals (not memberships)
- **Customer-safe projection** — status, schedule dates/progress (via `project.summary`), explicitly shared milestones (`portal_visible`), explicitly shared docs/photos (`portal_visible` / `portal-shared` label), billing status & payments (`billing.outstanding`), customer-facing quotes (`quotes.read`)
- **Vendor-safe projection** — that vendor’s RFQs/POs/candidates/compliance only; no cross-vendor; payment outstanding policy-gated **off**
- **Candidate intake** — quote / AP bill / compliance candidates never write ledger / expense / `ap_bills` truth
- Durable candidate tables when `PORTAL_CANDIDATES_PERSISTENCE_READY` is true

## Never exposed (customer)

Actual / profit / margin / employee cost / overhead / labor rates / vendor private / internal notes / storage paths / supplier cost on quotes.

## Never exposed (vendor)

Other vendors’ data, cost recognition, match variance, profit, org admin, auto-finalized AP.

## Gaps / deferred

- Public ExternalPrincipal auth + `external_portal_sessions`
- Vendor `payment.outstanding` policy enablement (AP payments safe projection)
- Explicit share UX on documents/milestones beyond column/label (ops polish)
- Recurring financial drafts UI is **not** owned here — see ops gap note if schema-only
