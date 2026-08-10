# Portal SCHEMA_REQUEST (Agent 5 — overnight wave)

**Status:** Request only — Lead designs additive `0020+`. Do not author SQL here.  
**Do not edit** migrations `0000`–`0019`, journal, or `drizzle/schema/**` from this agent.

## Why

External portal V1 foundation is live (grants, safe projections, candidate intake).
Public login stays **DISABLED**. Durable persistence + explicit share markers are
needed before multi-instance / public auth can be enabled safely.

---

## TABLE `vendor_portal_ap_candidates`

Why: Replace process-local `vendor-portal-candidates.store` so AP bill candidates
survive restarts and never write `ap_bills` / `expenses` directly.

```text
TABLE vendor_portal_ap_candidates
  id uuid PK
  organization_id uuid NOT NULL FK → organizations.id ON DELETE CASCADE
  vendor_id uuid NOT NULL FK → vendors.id ON DELETE CASCADE
  grant_id uuid NOT NULL FK → external_access_grants.id ON DELETE CASCADE
  principal_id uuid NOT NULL FK → external_principals.id ON DELETE CASCADE
  reference text NULL
  currency char(3) NOT NULL
  total_amount numeric NOT NULL
  bill_date date NULL
  notes text NULL
  lines jsonb NOT NULL DEFAULT '[]'
  status text NOT NULL DEFAULT 'candidate'
    CHECK IN ('candidate', 'accepted_for_review', 'rejected')
  mutates_financial_truth boolean NOT NULL DEFAULT false
    CHECK (mutates_financial_truth = false)
  reviewed_at timestamptz NULL
  review_note text NULL
  created_at / updated_at

INDEX (organization_id), (organization_id, vendor_id), (grant_id)
FK same-org: vendor.organization_id = organization_id
             grant.organization_id = organization_id
RLS: tenant by organization_id; service_role write for intake until public auth
```

---

## TABLE `vendor_portal_compliance_candidates`

Why: Durable compliance / document upload candidates (never auto-post artifacts).

```text
TABLE vendor_portal_compliance_candidates
  id uuid PK
  organization_id uuid NOT NULL FK → organizations.id
  vendor_id uuid NOT NULL FK → vendors.id
  grant_id uuid NOT NULL FK → external_access_grants.id
  principal_id uuid NOT NULL FK → external_principals.id
  artifact_kind text NOT NULL CHECK IN ('insurance','license','certification','other')
  name text NOT NULL
  reference_number text NULL
  expires_on date NULL
  notes text NULL
  status text NOT NULL DEFAULT 'candidate'
    CHECK IN ('candidate', 'accepted_for_review', 'rejected')
  mutates_financial_truth boolean NOT NULL DEFAULT false
    CHECK (mutates_financial_truth = false)
  reviewed_at / review_note
  created_at / updated_at

INDEX (organization_id, vendor_id)
RLS: tenant by organization_id
```

---

## COLUMN `document_links.portal_visible` (boolean NOT NULL DEFAULT false)

Why: Customer `documents.read` must expose only **explicitly shared** docs.
V1 interim uses label token `portal-shared` / `portal-shared:*`.

```text
COLUMN document_links.portal_visible boolean NOT NULL DEFAULT false
INDEX (organization_id, owner_type, owner_id) WHERE portal_visible = true
```

Optional later: `portal_shared_at`, `portal_shared_by` (membership id) for audit.

---

## COLUMN `project_milestones.portal_visible` (boolean NOT NULL DEFAULT false)

Why: Mission requires **selected** milestones, not every milestone.
V1 currently exposes non-cancelled milestones when `milestones.read` is granted;
opt-in flag makes selection explicit.

```text
COLUMN project_milestones.portal_visible boolean NOT NULL DEFAULT false
CHECK: notes never required for portal (app strips notes regardless)
```

---

## TABLE `external_portal_sessions` (deferred until public auth)

Why: Safe ExternalPrincipal session store separate from membership sessions.

```text
TABLE external_portal_sessions
  id uuid PK
  principal_id uuid NOT NULL FK → external_principals.id
  grant_id uuid NOT NULL FK → external_access_grants.id
  organization_id uuid NOT NULL FK → organizations.id
  portal_kind text NOT NULL CHECK IN ('customer','vendor')
  expires_at timestamptz NOT NULL
  revoked_at timestamptz NULL
  created_at

FK same-org via grant.organization_id
RLS: principal can only read own session; no membership privilege inheritance
```

**Do not enable** until rate limiting, magic-link/OTP, and revoke propagation are designed.

---

## INDEX / CHECK on existing `external_access_grants` (optional hardening)

```text
INDEX external_access_grants_org_status_idx ON (organization_id, status)
CHECK: scopes jsonb is array (already app-enforced)
```

---

## Hard rules (unchanged)

- ExternalPrincipal ≠ OrganizationMembership
- Candidate ≠ ledger / expense / AP bill truth
- Public login remains DISABLED until Lead approves auth design
- Vendor Payment ≠ Actual Cost; Customer Payment ≠ Actual Cost

## Persistence limitation (overnight)

`0020` defines portal candidate tables. **App wiring (Agent E):** Drizzle repo +
`PORTAL_CANDIDATES_PERSISTENCE_READY` (default **false**). In-memory store is
**TEST DOUBLE ONLY**. Public portal auth remains DISABLED.
