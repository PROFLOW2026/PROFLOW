-- Universal Work Management: Extend automation_rules preset_key CHECK for task presets.
-- Migration N+12 (0108). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0107.
--
-- DESIGN NOTE (inspected 0058):
--   automation_rules uses a single `preset_key text` column (+ CHECK constraint named
--   automation_rules_preset_known) to drive rule behavior. There are NO trigger_type or
--   action_type columns in the schema. UWM task presets are added as new preset_key values.
--   Application layer (types.ts AUTOMATION_PRESET_KEYS) is the canonical key list.
--
-- Original preset keys (0058): 13 values
-- New UWM task preset keys (0108): 8 values — MUST match types.ts exactly

ALTER TABLE public.automation_rules
  DROP CONSTRAINT IF EXISTS automation_rules_preset_known;

ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_preset_known CHECK (
    preset_key IN (
      -- ── Existing presets (established in 0058) ────────────────────────────
      'client_balance_overdue',
      'quote_no_followup',
      'vendor_bill_due',
      'timesheet_not_submitted',
      'timesheet_waiting_approval',
      'ocr_waiting_review',
      'forecast_over_budget',
      'forecast_margin_low',
      'warranty_expiring',
      'compliance_expiring',
      'asset_service_due',
      'retention_release_date',
      'closeout_has_blockers',
      -- ── UWM task presets (0108) — exact AUTOMATION_PRESET_KEYS parity ───────
      'task_status_changed_to',
      'task_overdue',
      'task_assigned_to',
      'task_created_from_template',
      'task_approval_rejected',
      'task_dependency_resolved',
      'milestone_approaching_days',
      'project_created'
    )
  );

COMMENT ON TABLE public.automation_rules IS
  'preset_key extended with 8 UWM task presets in 0108. '
  'Keys match src/modules/automations/domain/types.ts AUTOMATION_PRESET_KEYS exactly.';
