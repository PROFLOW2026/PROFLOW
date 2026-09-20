-- UWM production hotfix: backfill Owner/Manager UWM permissions and enable work_management module.
-- Migration 0113. Do not modify 0096–0112 (already applied in production).
--
-- Root cause: 0109 seeded permission catalog keys only — existing org roles were never updated.

--------------------------------------------------------------------------------
-- 1. Owner + Manager role permission backfill (all existing organizations)
--------------------------------------------------------------------------------

INSERT INTO public.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.permission_key
FROM public.roles r
CROSS JOIN (
  VALUES
    -- Owner: full UWM management set
    ('owner', 'tasks.read'),
    ('owner', 'tasks.create'),
    ('owner', 'tasks.update'),
    ('owner', 'tasks.delete'),
    ('owner', 'tasks.assign'),
    ('owner', 'tasks.manage_all'),
    ('owner', 'tasks.comment'),
    ('owner', 'tasks.approve'),
    ('owner', 'portfolio.read'),
    ('owner', 'workload.read'),
    ('owner', 'operations.read'),
    ('owner', 'workspaces.manage'),
    ('owner', 'stages.manage'),
    ('owner', 'modules.manage'),
    ('owner', 'labels.manage'),
    ('owner', 'task_templates.manage'),
    ('owner', 'project_templates.manage'),
    ('owner', 'meetings.read'),
    ('owner', 'meetings.manage'),
    -- Manager (Admin): operational UWM — org module toggles stay owner-only
    ('manager', 'tasks.read'),
    ('manager', 'tasks.create'),
    ('manager', 'tasks.update'),
    ('manager', 'tasks.delete'),
    ('manager', 'tasks.assign'),
    ('manager', 'tasks.manage_all'),
    ('manager', 'tasks.comment'),
    ('manager', 'tasks.approve'),
    ('manager', 'portfolio.read'),
    ('manager', 'workload.read'),
    ('manager', 'operations.read'),
    ('manager', 'workspaces.manage'),
    ('manager', 'stages.manage'),
    ('manager', 'labels.manage'),
    ('manager', 'task_templates.manage'),
    ('manager', 'project_templates.manage'),
    ('manager', 'meetings.read'),
    ('manager', 'meetings.manage')
) AS p(role_key, permission_key)
WHERE COALESCE(r.template_key, r.key) = p.role_key
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- 2. Enable work_management module for all existing organizations
--    (explicit ON + first_used_at so nav resolves without waiting for adoption)
--------------------------------------------------------------------------------

INSERT INTO public.organization_module_preferences (
  organization_id,
  module_key,
  enabled,
  first_used_at,
  created_at,
  updated_at
)
SELECT
  o.id,
  'work_management',
  true,
  now(),
  now(),
  now()
FROM public.organizations o
ON CONFLICT (organization_id, module_key) DO UPDATE SET
  enabled = COALESCE(public.organization_module_preferences.enabled, EXCLUDED.enabled),
  first_used_at = COALESCE(
    public.organization_module_preferences.first_used_at,
    EXCLUDED.first_used_at
  ),
  updated_at = now();
