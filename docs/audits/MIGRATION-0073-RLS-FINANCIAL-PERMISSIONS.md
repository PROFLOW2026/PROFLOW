# Migration 0073 — RLS Permission Gates on Financial Tables (DB-011)

**Status:** AWAITING OWNER APPROVAL — do NOT apply without explicit approval  
**Finding:** DB-011 (High) from DB Schema + RLS Audit  
**Impact:** Any org member (worker role) can `SELECT` from `ap_bills`, `billing_records`, `expenses` directly via the Supabase JS client, bypassing app-layer permission checks.

## Problem

Migration `0012_ap_vendor_portal.sql` created a blanket `is_org_member()` SELECT policy on `ap_bills`:
```sql
-- Current (too permissive):
CREATE POLICY ap_bills_tenant_select ON public.ap_bills
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id));
```

Migration `0001_rls_security.sql` did the same for `billing_records`, `expenses`, `time_entries`, `employees`, etc. — any org member can SELECT all financial records.

The app server-side code (Drizzle ORM via service_role) bypasses this — the risk is direct Supabase JS client queries from the browser.

## Proposed Fix (Migration 0073)

```sql
-- ProjectFlow — DB-011: Tighten RLS SELECT policies on sensitive financial tables
-- to require the matching app-level permission, not just org membership.
--
-- IMPORTANT: service_role always bypasses RLS (BYPASSRLS attribute).
-- Server-side Drizzle queries are unaffected.
-- Only browser-side authenticated queries are restricted.

--------------------------------------------------------------------------------
-- ap_bills — require ap.read
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS ap_bills_tenant_select ON public.ap_bills;
CREATE POLICY ap_bills_tenant_select ON public.ap_bills
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
  );

DROP POLICY IF EXISTS ap_bill_lines_tenant_select ON public.ap_bill_lines;
CREATE POLICY ap_bill_lines_tenant_select ON public.ap_bill_lines
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
  );

DROP POLICY IF EXISTS ap_po_matches_tenant_select ON public.ap_po_matches;
CREATE POLICY ap_po_matches_tenant_select ON public.ap_po_matches
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
  );

DROP POLICY IF EXISTS ap_payments_tenant_select ON public.ap_payments;
CREATE POLICY ap_payments_tenant_select ON public.ap_payments
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
  );

DROP POLICY IF EXISTS ap_payment_applications_tenant_select ON public.ap_payment_applications;
CREATE POLICY ap_payment_applications_tenant_select ON public.ap_payment_applications
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
  );

--------------------------------------------------------------------------------
-- billing_records / payments — require billing.read
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS billing_records_tenant_select ON public.billing_records;
CREATE POLICY billing_records_tenant_select ON public.billing_records
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.read')
  );

DROP POLICY IF EXISTS billing_lines_tenant_select ON public.billing_lines;
CREATE POLICY billing_lines_tenant_select ON public.billing_lines
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.read')
  );

DROP POLICY IF EXISTS payments_tenant_select ON public.payments;
CREATE POLICY payments_tenant_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'billing.read')
  );

--------------------------------------------------------------------------------
-- expenses — require expenses.read
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS expenses_tenant_select ON public.expenses;
CREATE POLICY expenses_tenant_select ON public.expenses
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'expenses.read')
  );

--------------------------------------------------------------------------------
-- employees / rate_versions — already gated in app layer for cost data;
-- basic profile visible to org members for assignment/attendance purposes.
-- Leave as-is (is_org_member) unless owner explicitly wants tighter gate.
--------------------------------------------------------------------------------
```

## Pre-apply Checklist

Before applying this migration, verify:
1. `app.has_org_permission()` function exists in Production (applied since migration 0001)
2. The permission keys (`ap.read`, `billing.read`, `expenses.read`) match `PERMISSIONS` catalog
3. No browser-side Supabase realtime subscriptions on these tables that would break
4. Run integration tests locally after applying to staging first

## Risk Assessment

- **Low risk:** Server-side queries (Drizzle/service_role) are completely unaffected
- **Medium risk:** Any future client-side Supabase queries would need the user to have the permission
- **Mitigates:** Direct browser-based data exfiltration bypassing app permission checks
