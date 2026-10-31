-- 0194: Owner EXLFY — link archived «ארכה» to canonical «ארכה בע"מ» via parent_vendor_id (metadata only).
-- Does not move expenses, payments, or delete vendor rows. Idempotent: only sets parent when NULL.

DO $$
DECLARE
  v_org uuid := '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
  v_canonical uuid := '67540aa1-81cb-4903-a55b-483a4c7685c3';
  v_alias uuid := '9056eb27-a43d-462b-9b9f-2afc3d813bb1';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org) THEN
    RAISE NOTICE '0194 skipped: organization not present';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vendors WHERE id = v_canonical AND organization_id = v_org
  ) THEN
    RAISE NOTICE '0194 skipped: canonical vendor not present';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vendors WHERE id = v_alias AND organization_id = v_org
  ) THEN
    RAISE NOTICE '0194 skipped: alias vendor not present';
    RETURN;
  END IF;

  IF v_canonical = v_alias THEN
    RAISE NOTICE '0194 skipped: canonical and alias ids must differ';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM vendors
     WHERE id = v_alias
       AND organization_id = v_org
       AND parent_vendor_id IS NOT NULL
       AND parent_vendor_id <> v_canonical
  ) THEN
    RAISE NOTICE '0194 skipped: alias vendor already linked to a different parent';
    RETURN;
  END IF;

  UPDATE vendors
     SET parent_vendor_id = v_canonical,
         updated_at = now()
   WHERE id = v_alias
     AND organization_id = v_org
     AND parent_vendor_id IS NULL;
END $$;
