-- 0213_boq_nodes_acl_restore_after_0205.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without separate Owner approval.
--
-- PURPOSE
--   Migration 0205 ended with:
--     GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
--   That re-opened every public relation (404 in Production), including objects that earlier
--   migrations had explicitly REVOKE'd for money isolation, append-only audit, sequences,
--   outboxes, and credential-adjacent tables.
--
--   This additive migration restores those proven historical privilege policies.
--   Schema `app` was not affected by 0205 (empty authenticated grants there).
--   Tables whose own migrations intentionally GRANT to authenticated (expenses, employees,
--   vendors, contracts with RLS, etc.) are left unchanged — redundant SIU is not a policy
--   violation when the intended grant already included those privileges.
--
-- DATA MUTATION = none
-- SCHEMA MUTATION = privilege (GRANT/REVOKE) only
-- IDEMPOTENT = safe to re-run

--------------------------------------------------------------------------------
-- A) BOQ raw money tables + secure views (0035 / 0042)
--------------------------------------------------------------------------------

REVOKE ALL ON TABLE public.boq_nodes FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_nodes FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_nodes FROM anon;
--> statement-breakpoint
GRANT ALL ON TABLE public.boq_nodes TO service_role;
--> statement-breakpoint

-- Progress / change-allocation: column-level SELECT without money (0035), no full-table SELECT.
REVOKE ALL ON TABLE public.boq_progress_lines FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_progress_lines FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_progress_lines FROM anon;
--> statement-breakpoint
GRANT SELECT (
  id, organization_id, batch_id, boq_node_id, measured_quantity,
  previous_approved_quantity, approved_quantity, currency, notes, created_at, updated_at
) ON public.boq_progress_lines TO authenticated;
--> statement-breakpoint
GRANT ALL ON TABLE public.boq_progress_lines TO service_role;
--> statement-breakpoint

REVOKE ALL ON TABLE public.boq_change_allocations FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_change_allocations FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_change_allocations FROM anon;
--> statement-breakpoint
GRANT SELECT (
  id, organization_id, project_id, boq_id, change_order_id, boq_node_id, allocation_kind,
  quantity_delta, currency, notes, reverses_allocation_id, created_via, created_by_user_id, created_at
) ON public.boq_change_allocations TO authenticated;
--> statement-breakpoint
GRANT ALL ON TABLE public.boq_change_allocations TO service_role;
--> statement-breakpoint

-- Subcontractor lines: IUD allowed, no table SELECT (0035); money via *_secure views.
REVOKE SELECT ON TABLE public.boq_subcontractor_schedule_lines FROM authenticated;
--> statement-breakpoint
REVOKE SELECT ON TABLE public.boq_subcontractor_schedule_lines FROM anon;
--> statement-breakpoint
GRANT INSERT, UPDATE, DELETE ON TABLE public.boq_subcontractor_schedule_lines TO authenticated;
--> statement-breakpoint

REVOKE SELECT ON TABLE public.boq_subcontractor_valuation_lines FROM authenticated;
--> statement-breakpoint
REVOKE SELECT ON TABLE public.boq_subcontractor_valuation_lines FROM anon;
--> statement-breakpoint
GRANT INSERT, UPDATE, DELETE ON TABLE public.boq_subcontractor_valuation_lines TO authenticated;
--> statement-breakpoint

-- Secure views: SELECT only for product clients.
REVOKE ALL ON TABLE public.boq_nodes_secure FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_nodes_secure FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_nodes_secure FROM anon;
--> statement-breakpoint
GRANT SELECT ON TABLE public.boq_nodes_secure TO authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE public.boq_nodes_secure TO service_role;
--> statement-breakpoint

REVOKE ALL ON TABLE public.boq_progress_lines_secure FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_progress_lines_secure FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_progress_lines_secure FROM anon;
--> statement-breakpoint
GRANT SELECT ON TABLE public.boq_progress_lines_secure TO authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE public.boq_progress_lines_secure TO service_role;
--> statement-breakpoint

REVOKE ALL ON TABLE public.boq_change_allocations_secure FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_change_allocations_secure FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_change_allocations_secure FROM anon;
--> statement-breakpoint
GRANT SELECT ON TABLE public.boq_change_allocations_secure TO authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE public.boq_change_allocations_secure TO service_role;
--> statement-breakpoint

REVOKE ALL ON TABLE public.boq_subcontractor_schedule_lines_secure FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_subcontractor_schedule_lines_secure FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_subcontractor_schedule_lines_secure FROM anon;
--> statement-breakpoint
GRANT SELECT ON TABLE public.boq_subcontractor_schedule_lines_secure TO authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE public.boq_subcontractor_schedule_lines_secure TO service_role;
--> statement-breakpoint

REVOKE ALL ON TABLE public.boq_subcontractor_valuation_lines_secure FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_subcontractor_valuation_lines_secure FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.boq_subcontractor_valuation_lines_secure FROM anon;
--> statement-breakpoint
GRANT SELECT ON TABLE public.boq_subcontractor_valuation_lines_secure TO authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE public.boq_subcontractor_valuation_lines_secure TO service_role;
--> statement-breakpoint

REVOKE ALL ON TABLE public.subcontract_agreement_money_secure FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE public.subcontract_agreement_money_secure FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.subcontract_agreement_money_secure FROM anon;
--> statement-breakpoint
GRANT SELECT ON TABLE public.subcontract_agreement_money_secure TO authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE public.subcontract_agreement_money_secure TO service_role;
--> statement-breakpoint

--------------------------------------------------------------------------------
-- B) Catalog / audit / notifications (0001, 0047, 0058)
--------------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON TABLE public.permissions FROM authenticated;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE public.permissions FROM anon;
--> statement-breakpoint

REVOKE UPDATE, DELETE ON TABLE public.audit_events FROM authenticated;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON TABLE public.audit_events FROM anon;
--> statement-breakpoint

REVOKE INSERT, DELETE ON TABLE public.notifications FROM authenticated;
--> statement-breakpoint
REVOKE INSERT, DELETE ON TABLE public.notifications FROM anon;
--> statement-breakpoint

REVOKE INSERT, UPDATE, DELETE ON TABLE public.automation_runs FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.integration_entity_mappings FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.integration_sync_jobs FROM authenticated;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON TABLE public.assistant_messages FROM authenticated;
--> statement-breakpoint

--------------------------------------------------------------------------------
-- C) Inventory / cost / closeout (0044, 0056, 0069)
--------------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON TABLE public.inventory_location_balances FROM authenticated;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE public.project_closeouts FROM authenticated;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE public.project_closeout_events FROM authenticated;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE public.expense_managerial_schedule_lines FROM authenticated;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE public.recurring_draft_amount_versions FROM authenticated;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE public.general_cost_months FROM authenticated;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE public.general_cost_month_allocations FROM authenticated;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE public.general_cost_month_sources FROM authenticated;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE public.inventory_cost_layers FROM authenticated;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE public.inventory_cost_consumptions FROM authenticated;
--> statement-breakpoint

--------------------------------------------------------------------------------
-- D) Communications / sequences / store / outbox (0057, 0156, 0159, 0163, 0168, 0169)
--------------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON TABLE public.outbound_communication_attempts FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.external_sign_in_attempts FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.external_sign_in_attempts FROM anon;
--> statement-breakpoint
REVOKE ALL ON TABLE public.subcontract_claim_sequences FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.rfi_submittal_sequences FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.subcontract_agreements_store FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.subcontract_agreements_store FROM anon;
--> statement-breakpoint

REVOKE ALL ON TABLE public.external_notifications FROM authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE public.external_notifications TO authenticated;
--> statement-breakpoint
GRANT UPDATE (read_at, dismissed_at, updated_at) ON TABLE public.external_notifications TO authenticated;
--> statement-breakpoint

REVOKE ALL ON TABLE public.domain_event_retries FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.domain_event_retries FROM anon;
--> statement-breakpoint

--------------------------------------------------------------------------------
-- E) Connected projects / badges / installments / collaboration (0172–0199)
--------------------------------------------------------------------------------

REVOKE ALL ON TABLE public.notification_attention_badge_snapshots FROM authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_attention_badge_snapshots TO authenticated;
--> statement-breakpoint

REVOKE ALL ON TABLE public.engagement_connection_invitations FROM authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE public.engagement_connection_invitations TO authenticated;
--> statement-breakpoint

REVOKE ALL ON TABLE public.connected_project_mappings FROM authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE public.connected_project_mappings TO authenticated;
--> statement-breakpoint

REVOKE ALL ON TABLE public.cross_org_sync_outbox FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.cross_org_sync_outbox FROM anon;
--> statement-breakpoint

REVOKE ALL ON TABLE public.connected_claim_cash_projections FROM authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE public.connected_claim_cash_projections TO authenticated;
--> statement-breakpoint

REVOKE ALL ON TABLE public.expense_installment_payments FROM authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.expense_installment_payments TO authenticated;
--> statement-breakpoint

REVOKE DELETE ON TABLE public.statutory_document_share_links FROM authenticated;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON TABLE public.task_comment_mentions FROM authenticated;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE public.notification_deliveries FROM authenticated;
--> statement-breakpoint
REVOKE DELETE ON TABLE public.calendar_feed_tokens FROM authenticated;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE public.connected_contract_value_projections FROM authenticated;
--> statement-breakpoint
REVOKE DELETE ON TABLE public.duplicate_warning_acknowledgements FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.auth_rate_limits FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.auth_rate_limits FROM anon;
--> statement-breakpoint

--------------------------------------------------------------------------------
-- F) Draft RPC EXECUTE (0045 intent; close anon hole observed on Production)
--------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION app.boq_mutate_draft_node(uuid, text, uuid, jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.boq_mutate_draft_node(uuid, text, uuid, jsonb) FROM anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.boq_mutate_draft_node(uuid, text, uuid, jsonb) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.boq_mutate_draft_node(uuid, text, uuid, jsonb) TO service_role;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.boq_reverse_allocations_for_change_order(uuid, uuid, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.boq_reverse_allocations_for_change_order(uuid, uuid, text) FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.boq_reverse_allocations_for_change_order(uuid, uuid, text) FROM anon;
