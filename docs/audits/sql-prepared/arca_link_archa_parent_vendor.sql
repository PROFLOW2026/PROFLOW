-- PREPARED ONLY — NOT APPLIED. Owner approval required before execution.
-- Links archived vendor «ארכה» to canonical «ארכה בע"מ» via parent_vendor_id (metadata only; no expense rows moved).
-- Org: 8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec

UPDATE vendors
SET parent_vendor_id = '67540aa1-81cb-4903-a55b-483a4c7685c3'::uuid,
    updated_at = now()
WHERE organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'::uuid
  AND id = '9056eb27-a43d-462b-9b9f-2afc3d813bb1'::uuid
  AND parent_vendor_id IS NULL;
