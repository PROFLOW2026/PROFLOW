-- 0169: Developer / GC layer - notifications for external principals + domain-event consumer retries.
-- PREPARED ONLY - Owner applies after the Final Gate review. Depends on 0155 (domain_events,
-- external principal helpers). Does not touch public.notifications or any earlier object.
--
-- PURPOSE
--   1. external_notifications: in-app notifications for contractor principals (never org members).
--      A principal reads and marks read ONLY its own rows. Rows are written by the service-role
--      domain-event consumer; clients can never insert or delete.
--   2. domain_event_retries: per-event retry schedule (exponential backoff) for the consumer.
--      domain_events.processed_at / attempts / last_error stay the canonical processing state.
--
-- COMPATIBILITY: purely additive (two new tables). The deployed app ignores them.

--------------------------------------------------------------------------------
-- 1. external_notifications
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.external_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  principal_id uuid NOT NULL REFERENCES public.external_principals (id) ON DELETE CASCADE,
  project_id uuid,
  vendor_id uuid,
  subcontract_agreement_id uuid,
  event_type text NOT NULL,
  -- any-of ext.* capabilities the event required; readers re-check them against current grants
  required_capabilities text[] NOT NULL DEFAULT '{}'::text[],
  copy_key text NOT NULL,
  entity_type text,
  entity_id uuid,
  severity text NOT NULL DEFAULT 'info',
  deep_link text,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  occurrences integer NOT NULL DEFAULT 1,
  last_event_id uuid,
  last_occurred_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_notifications_severity_known CHECK (severity IN ('info', 'warning', 'urgent')),
  CONSTRAINT external_notifications_event_type_shape
    CHECK (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  CONSTRAINT external_notifications_copy_key_shape CHECK (copy_key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT external_notifications_occurrences_positive CHECK (occurrences >= 1),
  CONSTRAINT external_notifications_deep_link_portal
    CHECK (deep_link IS NULL OR deep_link LIKE '/contractor%')
);

ALTER TABLE public.external_notifications DROP CONSTRAINT IF EXISTS external_notifications_project_org_fk;
ALTER TABLE public.external_notifications
  ADD CONSTRAINT external_notifications_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS external_notifications_id_organization_id_uq
  ON public.external_notifications (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS external_notifications_principal_dedupe_uq
  ON public.external_notifications (organization_id, principal_id, dedupe_key);
CREATE INDEX IF NOT EXISTS external_notifications_principal_feed_idx
  ON public.external_notifications (principal_id, last_occurred_at DESC)
  WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS external_notifications_principal_unread_idx
  ON public.external_notifications (principal_id)
  WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS external_notifications_entity_idx
  ON public.external_notifications (organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS external_notifications_org_dedupe_idx
  ON public.external_notifications (organization_id, dedupe_key)
  WHERE dismissed_at IS NULL;

ALTER TABLE public.external_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_notifications FORCE ROW LEVEL SECURITY;

-- A principal sees only its own notifications. Org members never read them (internal users have
-- public.notifications); app.external_principal_id() is NULL for every internal user.
DROP POLICY IF EXISTS external_notifications_principal_select ON public.external_notifications;
CREATE POLICY external_notifications_principal_select ON public.external_notifications
  FOR SELECT TO authenticated
  USING (principal_id = app.external_principal_id());

DROP POLICY IF EXISTS external_notifications_principal_update ON public.external_notifications;
CREATE POLICY external_notifications_principal_update ON public.external_notifications
  FOR UPDATE TO authenticated
  USING (principal_id = app.external_principal_id())
  WITH CHECK (principal_id = app.external_principal_id());

DROP POLICY IF EXISTS external_notifications_service_all ON public.external_notifications;
CREATE POLICY external_notifications_service_all ON public.external_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Clients may only flip read/dismiss state (column privileges); no INSERT / DELETE.
REVOKE ALL ON public.external_notifications FROM authenticated;
GRANT SELECT ON public.external_notifications TO authenticated;
GRANT UPDATE (read_at, dismissed_at, updated_at) ON public.external_notifications TO authenticated;
GRANT ALL PRIVILEGES ON public.external_notifications TO service_role;

--------------------------------------------------------------------------------
-- 2. domain_event_retries (consumer backoff schedule; service role only)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.domain_event_retries (
  event_id uuid PRIMARY KEY REFERENCES public.domain_events (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  next_attempt_at timestamptz NOT NULL,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS domain_event_retries_next_attempt_idx
  ON public.domain_event_retries (next_attempt_at);

ALTER TABLE public.domain_event_retries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_event_retries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS domain_event_retries_service_all ON public.domain_event_retries;
CREATE POLICY domain_event_retries_service_all ON public.domain_event_retries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.domain_event_retries FROM authenticated;
GRANT ALL PRIVILEGES ON public.domain_event_retries TO service_role;
