-- 0188: Task collaboration — mentions, notification prefs/deliveries, calendar feed tokens (P04–P07).
-- Pending journal (Gate B). File: drizzle/migrations/ — not applied by db:migrate until journal + Owner approval.

CREATE TABLE IF NOT EXISTS public.task_comment_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  task_comment_id uuid NOT NULL REFERENCES public.task_comments (id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_comment_mentions_comment_user_uq UNIQUE (task_comment_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS task_comment_mentions_org_user_idx
  ON public.task_comment_mentions (organization_id, mentioned_user_id);

ALTER TABLE public.task_comment_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comment_mentions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_comment_mentions_select ON public.task_comment_mentions;
CREATE POLICY task_comment_mentions_select ON public.task_comment_mentions
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1
      FROM public.task_comments tc
      WHERE tc.id = task_comment_id
        AND app.uwm_user_can_read_task_id(tc.task_id)
    )
  );

DROP POLICY IF EXISTS task_comment_mentions_insert ON public.task_comment_mentions;
CREATE POLICY task_comment_mentions_insert ON public.task_comment_mentions
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1
      FROM public.task_comments tc
      WHERE tc.id = task_comment_id
        AND app.uwm_user_can_comment_task_id(tc.task_id)
    )
  );

REVOKE UPDATE, DELETE ON public.task_comment_mentions FROM authenticated;
REVOKE ALL ON public.task_comment_mentions FROM service_role;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  channel text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_channel_known CHECK (channel IN ('email', 'push')),
  CONSTRAINT notification_preferences_org_user_channel_uq UNIQUE (organization_id, user_id, channel)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_preferences_self_select ON public.notification_preferences;
CREATE POLICY notification_preferences_self_select ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS notification_preferences_self_write ON public.notification_preferences;
CREATE POLICY notification_preferences_self_write ON public.notification_preferences
  FOR ALL TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND user_id = app.current_user_id()
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS notification_preferences_service_select ON public.notification_preferences;
CREATE POLICY notification_preferences_service_select ON public.notification_preferences
  FOR SELECT TO service_role
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.notification_preferences FROM service_role;

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  notification_id uuid NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_channel_known CHECK (channel IN ('email', 'push')),
  CONSTRAINT notification_deliveries_status_known CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  CONSTRAINT notification_deliveries_notification_channel_uq UNIQUE (notification_id, channel),
  CONSTRAINT notification_deliveries_notification_org_fk
    FOREIGN KEY (notification_id, organization_id)
    REFERENCES public.notifications (id, organization_id)
    ON DELETE CASCADE
);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_deliveries_recipient_select ON public.notification_deliveries;
CREATE POLICY notification_deliveries_recipient_select ON public.notification_deliveries
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.id = notification_id
        AND n.organization_id = organization_id
        AND n.recipient_user_id = app.current_user_id()
    )
  );

DROP POLICY IF EXISTS notification_deliveries_service_select ON public.notification_deliveries;
CREATE POLICY notification_deliveries_service_select ON public.notification_deliveries
  FOR SELECT TO service_role
  USING (true);

DROP POLICY IF EXISTS notification_deliveries_service_insert ON public.notification_deliveries;
CREATE POLICY notification_deliveries_service_insert ON public.notification_deliveries
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS notification_deliveries_service_update ON public.notification_deliveries;
CREATE POLICY notification_deliveries_service_update ON public.notification_deliveries
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE DELETE ON public.notification_deliveries FROM service_role;

REVOKE INSERT, UPDATE, DELETE ON public.notification_deliveries FROM authenticated;

CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_feed_tokens_token_hash_uq UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS calendar_feed_tokens_org_user_active_idx
  ON public.calendar_feed_tokens (organization_id, user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_feed_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_feed_tokens_self_select ON public.calendar_feed_tokens;
CREATE POLICY calendar_feed_tokens_self_select ON public.calendar_feed_tokens
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS calendar_feed_tokens_self_insert ON public.calendar_feed_tokens;
CREATE POLICY calendar_feed_tokens_self_insert ON public.calendar_feed_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS calendar_feed_tokens_self_update ON public.calendar_feed_tokens;
CREATE POLICY calendar_feed_tokens_self_update ON public.calendar_feed_tokens
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND user_id = app.current_user_id()
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS calendar_feed_tokens_service_select ON public.calendar_feed_tokens;
CREATE POLICY calendar_feed_tokens_service_select ON public.calendar_feed_tokens
  FOR SELECT TO service_role
  USING (true);

DROP POLICY IF EXISTS calendar_feed_tokens_service_update ON public.calendar_feed_tokens;
CREATE POLICY calendar_feed_tokens_service_update ON public.calendar_feed_tokens
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE DELETE ON public.calendar_feed_tokens FROM authenticated, service_role;
REVOKE INSERT ON public.calendar_feed_tokens FROM service_role;
