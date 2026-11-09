-- Extend automation_rules preset_key CHECK for task_blocked and task_reminder_due scanners.
-- Owner applies via npm run db:migrate after review (not applied by agents).

ALTER TABLE public.automation_rules
  DROP CONSTRAINT IF EXISTS automation_rules_preset_known;

ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_preset_known CHECK (
    preset_key IN (
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
      'task_status_changed_to',
      'task_overdue',
      'task_blocked',
      'task_reminder_due',
      'task_assigned_to',
      'task_created_from_template',
      'task_approval_rejected',
      'task_dependency_resolved',
      'milestone_approaching_days',
      'project_created'
    )
  );
