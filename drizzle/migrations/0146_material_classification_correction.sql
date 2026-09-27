-- 0146: Correct over-broad material_items.trade classifications from migration 0144
--
-- Migration 0144 contained three patterns that are not confident enough:
--
--   1. PVC → plumbing without plumbing-specific context
--      Problem: "צינור PVC חשמל" (electrical conduit) would be mis-classified as plumbing.
--      Fix: reset any PVC-only plumbing classification that lacks water/drainage/plumbing context.
--
--   2. Hebrew "מוצק" alone → concrete
--      Problem: "מוצק" means "solid" in Hebrew and is used for many non-concrete items.
--      Fix: reset unless a real concrete/cement keyword is also present.
--
--   3. Wire/cable items classified as electrical when they are steel lifting products
--      Problem: "wire rope", "כבל פלדה", "חבל הרמה" are rigging/steel, not electrical.
--      Fix: reset to NULL; these items remain unclassified.
--
-- Only affects rows that were set by migration 0144 (trade IS NOT NULL).
-- Never affects user-manually-set trade values (the condition structure is the same).
-- Idempotent: re-running produces the same outcome.
--
-- Principle: confident classification only. Ambiguous item → trade = NULL. Never guess.

-- ── 1. PVC without plumbing context ──────────────────────────────────────────
UPDATE public.material_items
SET trade = NULL
WHERE trade = 'plumbing'
  AND name ILIKE '%pvc%'
  AND NOT (
       name ILIKE '%מים%'           -- water
    OR name ILIKE '%ניקוז%'         -- drainage
    OR name ILIKE '%ביוב%'          -- sewage
    OR name ILIKE '%אינסטלציה%'     -- plumbing (Hebrew)
    OR name ILIKE '%plumbing%'
    OR name ILIKE '%water%'
    OR name ILIKE '%drain%'
    OR name ILIKE '%waste%'
    OR name ILIKE '%sewage%'
    OR name ILIKE '%sewer%'
  );

-- ── 2. Hebrew "מוצק" alone without concrete context ───────────────────────────
UPDATE public.material_items
SET trade = NULL
WHERE trade = 'concrete'
  AND name ILIKE '%מוצק%'
  AND NOT (
       name ILIKE '%בטון%'          -- concrete
    OR name ILIKE '%מלט%'           -- cement
    OR name ILIKE '%מרגמה%'         -- mortar
    OR name ILIKE '%פרמיקס%'        -- ready-mix
    OR name ILIKE '%concrete%'
    OR name ILIKE '%cement%'
    OR name ILIKE '%mortar%'
    OR name ILIKE '%grout%'
    OR name ILIKE '%ready%mix%'
  );

-- ── 3. Steel wire/lifting cable mis-classified as electrical ─────────────────
UPDATE public.material_items
SET trade = NULL
WHERE trade = 'electrical'
  AND (
       name ILIKE '%wire rope%'
    OR name ILIKE '%cable sling%'
    OR name ILIKE '%lifting cable%'
    OR name ILIKE '%steel wire%'
    OR name ILIKE '%כבל פלדה%'      -- steel cable
    OR name ILIKE '%חבל פלדה%'      -- steel rope
    OR name ILIKE '%חבל הרמה%'      -- lifting rope
    OR name ILIKE '%wire rope%'
  );

-- Informational report
DO $$
DECLARE
  total_items      bigint;
  classified_items bigint;
BEGIN
  SELECT COUNT(*) INTO total_items      FROM public.material_items WHERE archived_at IS NULL;
  SELECT COUNT(*) INTO classified_items FROM public.material_items WHERE archived_at IS NULL AND trade IS NOT NULL;
  RAISE NOTICE 'After 0146 correction: total=% classified=% unclassified=%',
    total_items, classified_items, total_items - classified_items;
END $$;
