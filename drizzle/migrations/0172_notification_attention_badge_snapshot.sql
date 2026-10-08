-- 0172: Cache last merged notification bell count (persisted + Command Center attention).
-- PREPARED ONLY — Owner applies after review. Purely additive.
--
-- PURPOSE: Shell badge reads this row + persisted unread without running collectAllSources.
-- Updated when listMergedNotificationInbox (or Today inbox) already computed the merge.

CREATE TABLE IF NOT EXISTS public.notification_attention_badge_snapshots (
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  active_attention_count integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_attention_badge_snapshots_count_nonneg
    CHECK (active_attention_count >= 0),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS notification_attention_badge_snapshots_user_idx
  ON public.notification_attention_badge_snapshots (user_id);

ALTER TABLE public.notification_attention_badge_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_attention_badge_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_attention_badge_snapshots_self ON public.notification_attention_badge_snapshots;
CREATE POLICY notification_attention_badge_snapshots_self ON public.notification_attention_badge_snapshots
  FOR ALL TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'notifications.read')
    AND user_id = app.current_user_id()
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'notifications.read')
    AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS notification_attention_badge_snapshots_service ON public.notification_attention_badge_snapshots;
CREATE POLICY notification_attention_badge_snapshots_service ON public.notification_attention_badge_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.notification_attention_badge_snapshots FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_attention_badge_snapshots TO authenticated;
GRANT ALL PRIVILEGES ON public.notification_attention_badge_snapshots TO service_role;
