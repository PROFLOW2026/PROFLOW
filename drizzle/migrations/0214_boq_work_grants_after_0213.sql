-- 0214_boq_work_grants_after_0213.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without separate Owner approval.
--
-- PURPOSE
--   0213 revoked the 0205 blanket GRANT, and also removed privileges that 0035 had kept:
--     * boq_progress_lines and boq_change_allocations lost INSERT, UPDATE, DELETE
--       (0001 default privileges; 0035 revoked SELECT only).
--     * boq_subcontractor_schedule_lines and boq_subcontractor_valuation_lines lost the
--       safe column SELECT list, so INSERT ... RETURNING id fails.
--   This migration restores that post-0035 / pre-0205 policy. It does not restore
--   full-table SELECT and does not grant the protected money columns.
--
--   boq_change_allocations direct DML stays blocked by the 0035 RLS policies
--   (WITH CHECK false). Canonical writes remain the SECURITY DEFINER RPCs.
--
-- DATA MUTATION = none
-- SCHEMA MUTATION = privilege (GRANT/REVOKE) only
-- IDEMPOTENT = safe to re-run
-- DOES NOT MODIFY 0205 OR 0213

--------------------------------------------------------------------------------
-- boq_progress_lines
-- Safe SELECT: 0035 lines 1623–1627. Money excluded: unit_price_snapshot, period_amount.
--------------------------------------------------------------------------------

REVOKE SELECT ON TABLE public.boq_progress_lines FROM authenticated;
--> statement-breakpoint
GRANT SELECT (
  id, organization_id, batch_id, boq_node_id, measured_quantity,
  previous_approved_quantity, approved_quantity, currency, notes, created_at, updated_at
) ON TABLE public.boq_progress_lines TO authenticated;
--> statement-breakpoint
GRANT INSERT, UPDATE, DELETE ON TABLE public.boq_progress_lines TO authenticated;
--> statement-breakpoint

--------------------------------------------------------------------------------
-- boq_change_allocations
-- Safe SELECT: 0035 lines 1629–1633. Direct writes stay RLS-denied.
--------------------------------------------------------------------------------

REVOKE SELECT ON TABLE public.boq_change_allocations FROM authenticated;
--> statement-breakpoint
GRANT SELECT (
  id, organization_id, project_id, boq_id, change_order_id, boq_node_id, allocation_kind,
  quantity_delta, currency, notes, reverses_allocation_id, created_via, created_by_user_id, created_at
) ON TABLE public.boq_change_allocations TO authenticated;
--> statement-breakpoint
GRANT INSERT, UPDATE, DELETE ON TABLE public.boq_change_allocations TO authenticated;
--> statement-breakpoint

--------------------------------------------------------------------------------
-- boq_subcontractor_schedule_lines
-- Safe SELECT: 0035 lines 2510–2514. Money excluded: unit_rate, amount.
-- INSERT, UPDATE, DELETE were already re-granted by 0213.
--------------------------------------------------------------------------------

REVOKE SELECT ON TABLE public.boq_subcontractor_schedule_lines FROM authenticated;
--> statement-breakpoint
GRANT SELECT (
  id, organization_id, schedule_id, boq_node_id, unit, agreed_quantity,
  currency, notes, sort_order, created_at, updated_at
) ON TABLE public.boq_subcontractor_schedule_lines TO authenticated;
--> statement-breakpoint
GRANT INSERT, UPDATE, DELETE ON TABLE public.boq_subcontractor_schedule_lines TO authenticated;
--> statement-breakpoint

--------------------------------------------------------------------------------
-- boq_subcontractor_valuation_lines
-- Safe SELECT: 0035 lines 2518–2523. Money excluded: unit_rate_snapshot, period_amount.
--------------------------------------------------------------------------------

REVOKE SELECT ON TABLE public.boq_subcontractor_valuation_lines FROM authenticated;
--> statement-breakpoint
GRANT SELECT (
  id, organization_id, valuation_id, schedule_line_id,
  previous_approved_quantity, approved_quantity,
  currency, notes, created_at, updated_at
) ON TABLE public.boq_subcontractor_valuation_lines TO authenticated;
--> statement-breakpoint
GRANT INSERT, UPDATE, DELETE ON TABLE public.boq_subcontractor_valuation_lines TO authenticated;
