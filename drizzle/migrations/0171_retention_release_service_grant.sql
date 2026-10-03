-- 0171: service_role may use the retention-release latch.
--
-- app.retention_release_in_progress is an internal latch. Migration 0030 revoked it from
-- PUBLIC, authenticated, and anon. app.retention_source_invariants() is SECURITY INVOKER and
-- reads the latch when a posted bill or billing record changes held remaining. The service-role
-- path (trusted writes, not an end-user session) must keep that read. authenticated and anon
-- stay revoked.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, DELETE ON TABLE app.retention_release_in_progress TO service_role;
  END IF;
END $$;
