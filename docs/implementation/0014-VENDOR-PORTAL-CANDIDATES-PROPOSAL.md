# 0014 Proposal — Durable vendor portal candidates

**Status:** Proposal only — **do not author SQL** until Lead allocates the number.  
**Blocked without schema:** AP bill + compliance upload candidates currently live in a **process-local** store (`vendor-portal-candidates.store.ts`). Restarts and multi-instance deploys lose queued candidates.

## Why 0014 (not reuse 0012/0013)

- `0012_ap_vendor_portal` — AP bills + grants (applied locally; freeze closed)
- `0013_document_owner_types` — document owner enum expansion (allocated)
- Next free Lead number for durable portal intake: **`0014_vendor_portal_candidates`**  
  (OCR may also request `0014_ocr_foundations` — Lead must pick one series / rename)

## Recommended tables (illustrative)

```text
vendor_portal_ap_candidates
  id, organization_id, vendor_id, grant_id, principal_id
  reference, currency, total_amount, bill_date, notes
  lines jsonb
  status: candidate | accepted | rejected  -- never posts ap_bills automatically
  mutates_financial_truth: false (constant / check)
  created_at, updated_at
  RLS: tenant by organization_id

vendor_portal_compliance_candidates
  id, organization_id, vendor_id, grant_id, principal_id
  artifact_kind, name, reference_number, expires_on, notes
  status: candidate | accepted | rejected  -- never posts compliance_artifacts automatically
  mutates_financial_truth: false
  created_at, updated_at
  RLS: tenant by organization_id
```

## Hard rules (unchanged)

- ExternalPrincipal ≠ Membership
- Candidate ≠ ledger / compliance truth
- Accept path is **internal-only** and must create canonical rows via existing AP / compliance use cases
- No notifications (doc 26 deferred)
- No public portal login required for this persistence step

## Until approved

Keep process-local store + admin grant-scoped intake UI. Semantics already freeze-safe.
