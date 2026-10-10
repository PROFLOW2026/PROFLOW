-- Replaces 0156_dg_external_identity guard on external_principals (BEFORE UPDATE).
--
-- 0156 blocked contractor changes to: principal_kind, auth_user_id, username_normalized,
-- email, home_organization_id.
--
-- 0178 intentionally allows username_normalized + email to change so
-- updateHomeContractorPrincipal() can persist username after Supabase auth email sync.
-- Still immutable for contractors: principal_kind, auth_user_id, home_organization_id.
-- Portal rows (principal_kind <> 'contractor') are unchanged — this trigger never fired for them in 0156 either.
--
-- App layer: EXTERNAL_ACCESS_MANAGE + home org + uniqueness + auth rollback on DB failure.

CREATE OR REPLACE FUNCTION app.external_principals_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF OLD.principal_kind = 'contractor' AND (
    NEW.principal_kind IS DISTINCT FROM OLD.principal_kind
    OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
    OR NEW.home_organization_id IS DISTINCT FROM OLD.home_organization_id
  ) THEN
    RAISE EXCEPTION 'external contractor identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;
