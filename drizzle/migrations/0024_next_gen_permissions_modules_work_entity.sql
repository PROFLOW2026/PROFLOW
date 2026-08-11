-- 0024_next_gen_permissions_modules_work_entity
-- Additive only. Does NOT edit 0000–0023.
-- UNAPPLIED draft — DO NOT run against owner Supabase until owner approves.
--
-- Next-gen foundations:
--   1) New permission catalog keys
--   2) Extend projects.work_kind with work_order (same economic entity)
--   3) Role template backfill for new permissions

--------------------------------------------------------------------------------
-- Permissions
--------------------------------------------------------------------------------

INSERT INTO public.permissions (key, category, description) VALUES
  ('quotes.read', 'commercial', 'View estimates and quotes'),
  ('quotes.manage', 'commercial', 'Create and manage estimates and quotes'),
  ('service.read', 'projects', 'View work orders and service jobs'),
  ('service.manage', 'projects', 'Create and manage work orders and service jobs'),
  ('dispatch.manage', 'projects', 'Assign and schedule daily dispatch'),
  ('approvals.read', 'administration', 'View approval requests'),
  ('approvals.manage', 'administration', 'Configure approval rules'),
  ('approvals.decide', 'administration', 'Approve or reject pending requests'),
  ('month_close.read', 'financials', 'View month-close status and completeness'),
  ('month_close.manage', 'financials', 'Close months and record post-close corrections'),
  ('budgets.read', 'financials', 'View project/job budgets and variance'),
  ('budgets.manage', 'financials', 'Create and revise project/job budgets'),
  ('forms.read', 'projects', 'View field forms and submissions'),
  ('forms.submit', 'projects', 'Fill and submit field forms'),
  ('forms.manage', 'projects', 'Manage form templates (not required to submit)'),
  ('command_center.read', 'organization', 'View owner command center actionable items')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

--------------------------------------------------------------------------------
-- work_kind: project | job | work_order (one financial foundation)
--------------------------------------------------------------------------------

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_work_kind_known;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_work_kind_known
  CHECK (work_kind IN ('project', 'job', 'work_order'));

--------------------------------------------------------------------------------
-- Role permission backfill (existing orgs)
--------------------------------------------------------------------------------

INSERT INTO public.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.permission_key
FROM public.roles r
CROSS JOIN (
  VALUES
    ('owner', 'quotes.read'),
    ('owner', 'quotes.manage'),
    ('owner', 'service.read'),
    ('owner', 'service.manage'),
    ('owner', 'dispatch.manage'),
    ('owner', 'approvals.read'),
    ('owner', 'approvals.manage'),
    ('owner', 'approvals.decide'),
    ('owner', 'month_close.read'),
    ('owner', 'month_close.manage'),
    ('owner', 'budgets.read'),
    ('owner', 'budgets.manage'),
    ('owner', 'forms.read'),
    ('owner', 'forms.submit'),
    ('owner', 'forms.manage'),
    ('owner', 'command_center.read'),
    ('manager', 'quotes.read'),
    ('manager', 'quotes.manage'),
    ('manager', 'service.read'),
    ('manager', 'service.manage'),
    ('manager', 'dispatch.manage'),
    ('manager', 'approvals.read'),
    ('manager', 'approvals.decide'),
    ('manager', 'month_close.read'),
    ('manager', 'budgets.read'),
    ('manager', 'budgets.manage'),
    ('manager', 'forms.read'),
    ('manager', 'forms.submit'),
    ('manager', 'forms.manage'),
    ('manager', 'command_center.read'),
    ('worker', 'service.read'),
    ('worker', 'forms.read'),
    ('worker', 'forms.submit'),
    ('finance', 'quotes.read'),
    ('finance', 'approvals.read'),
    ('finance', 'approvals.decide'),
    ('finance', 'month_close.read'),
    ('finance', 'month_close.manage'),
    ('finance', 'budgets.read'),
    ('finance', 'budgets.manage'),
    ('finance', 'command_center.read')
) AS p(role_key, permission_key)
WHERE COALESCE(r.template_key, r.key) = p.role_key
ON CONFLICT DO NOTHING;
