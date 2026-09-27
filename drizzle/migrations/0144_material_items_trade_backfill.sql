-- 0144: Deterministic material_items.trade backfill
--
-- Uses keyword matching on item name (Hebrew + English) to classify existing
-- material_items into trades. ONLY updates rows where trade IS NULL.
-- Existing non-null trade values are never overwritten.
--
-- Conservative approach:
--   - Multiple-trade keywords (e.g. "pipe" can be electrical conduit or plumbing)
--     are disambiguated by checking for trade-specific context words.
--   - When ambiguous → leave as NULL. Do NOT guess.
--
-- Supported trades: electrical, plumbing, steel_rebar, concrete
--
-- After this migration the daily material market ops-worker will
-- automatically pick up the new trade classifications on its next run
-- (loadSupplierSignalsByTrade queries material_vendor_prices JOIN material_items).

-- ── electrical ────────────────────────────────────────────────────────────────
UPDATE public.material_items
SET trade = 'electrical'
WHERE trade IS NULL
  AND (
    -- Hebrew electrical terms
    name ILIKE '%חשמל%'
    OR name ILIKE '%חיווט%'
    OR name ILIKE '%כבל%'           -- cable (also used for steel cable — see exclusion below)
    OR name ILIKE '%מפסק%'          -- switch
    OR name ILIKE '%שקע%'           -- socket/outlet
    OR name ILIKE '%לוח חשמל%'      -- electrical panel
    OR name ILIKE '%ממסר%'          -- relay
    OR name ILIKE '%מסופים%'        -- terminals
    -- English electrical terms
    OR name ILIKE '%electrical%'
    OR name ILIKE '%conduit%'
    OR name ILIKE '%junction box%'
    OR name ILIKE '%circuit breaker%'
    OR name ILIKE '%mcb%'
    OR name ILIKE '%rcd%'
    OR name ILIKE '%switchboard%'
    OR (name ILIKE '%wire%'     AND name NOT ILIKE '%rebar%' AND name NOT ILIKE '%ברזל%')
    OR (name ILIKE '%cable%'    AND name NOT ILIKE '%steel%' AND name NOT ILIKE '%wire rope%')
    -- SKU prefix (common classification convention)
    OR sku ILIKE 'EL-%'
    OR sku ILIKE 'ELEC-%'
  )
  -- Exclude items that are more likely plumbing or steel despite matching above
  AND name NOT ILIKE '%צינור אינסטלציה%'
  AND name NOT ILIKE '%ברזל%';

-- ── plumbing ──────────────────────────────────────────────────────────────────
UPDATE public.material_items
SET trade = 'plumbing'
WHERE trade IS NULL
  AND (
    -- Hebrew plumbing terms
    name ILIKE '%אינסטלציה%'
    OR name ILIKE '%ניקוז%'         -- drainage
    OR name ILIKE '%ביוב%'          -- sewage
    OR name ILIKE '%אמבטיה%'        -- bathtub
    OR name ILIKE '%כיור%'          -- sink
    OR name ILIKE '%אסלה%'          -- toilet
    OR name ILIKE '%ברז%'           -- faucet/tap
    OR name ILIKE '%צינור מים%'     -- water pipe
    OR name ILIKE '%צנרת%'          -- piping
    OR name ILIKE '%pvc%'           -- PVC pipe (most common use is plumbing)
    -- English plumbing terms
    OR name ILIKE '%plumbing%'
    OR name ILIKE '%drain%'
    OR name ILIKE '%valve%'
    OR name ILIKE '%faucet%'
    OR name ILIKE '%toilet%'
    OR name ILIKE '%fitting%'
    OR name ILIKE '%coupling%'
    OR name ILIKE '%elbow%'
    OR name ILIKE '%tee fitting%'
    OR (name ILIKE '%pipe%'
        AND (name ILIKE '%water%' OR name ILIKE '%drain%' OR name ILIKE '%pvc%'
             OR name ILIKE '%ניקוז%' OR name ILIKE '%מים%'))
    OR sku ILIKE 'PL-%'
    OR sku ILIKE 'PLMB-%'
  );

-- ── steel_rebar ───────────────────────────────────────────────────────────────
UPDATE public.material_items
SET trade = 'steel_rebar'
WHERE trade IS NULL
  AND (
    -- Hebrew steel terms
    name ILIKE '%ברזל זיון%'        -- rebar (specific)
    OR name ILIKE '%מוט זיון%'      -- rebar rod
    OR name ILIKE '%רשת ברזל%'      -- steel mesh
    OR name ILIKE '%רשת זיון%'      -- reinforcement mesh
    OR name ILIKE '%זיון%'          -- reinforcement
    OR (name ILIKE '%ברזל%'
        AND (name ILIKE '%זיון%' OR name ILIKE '%מוט%' OR name ILIKE '%רשת%'))
    -- English steel/rebar terms
    OR name ILIKE '%rebar%'
    OR name ILIKE '%reinforcement bar%'
    OR name ILIKE '%re-bar%'
    OR name ILIKE '%reinforcing mesh%'
    OR name ILIKE '%wire mesh%'
    OR name ILIKE '%steel mesh%'
    OR name ILIKE '%welded mesh%'
    OR (name ILIKE '%steel%'
        AND (name ILIKE '%bar%' OR name ILIKE '%rod%' OR name ILIKE '%mesh%'
             OR name ILIKE '%rebar%'))
    OR sku ILIKE 'ST-%'
    OR sku ILIKE 'REBAR-%'
  );

-- ── concrete ─────────────────────────────────────────────────────────────────
UPDATE public.material_items
SET trade = 'concrete'
WHERE trade IS NULL
  AND (
    -- Hebrew concrete/cement terms
    name ILIKE '%בטון%'             -- concrete
    OR name ILIKE '%מלט%'           -- cement
    OR name ILIKE '%מרגמה%'         -- mortar
    OR name ILIKE '%פרמיקס%'        -- ready-mix
    OR name ILIKE '%מוצק%'          -- solid/cured
    -- English concrete/cement terms
    OR name ILIKE '%concrete%'
    OR name ILIKE '%cement%'
    OR name ILIKE '%mortar%'
    OR name ILIKE '%grout%'
    OR name ILIKE '%ready mix%'
    OR name ILIKE '%ready-mix%'
    OR name ILIKE '%readymix%'
    OR sku ILIKE 'CO-%'
    OR sku ILIKE 'CONC-%'
    OR sku ILIKE 'CEM-%'
  );

-- ── Report (informational only — not required for migration success) ──────────
DO $$
DECLARE
  total_items      bigint;
  classified_items bigint;
  elec_items       bigint;
  plmb_items       bigint;
  steel_items      bigint;
  conc_items       bigint;
BEGIN
  SELECT COUNT(*) INTO total_items      FROM public.material_items WHERE archived_at IS NULL;
  SELECT COUNT(*) INTO classified_items FROM public.material_items WHERE archived_at IS NULL AND trade IS NOT NULL;
  SELECT COUNT(*) INTO elec_items       FROM public.material_items WHERE archived_at IS NULL AND trade = 'electrical';
  SELECT COUNT(*) INTO plmb_items       FROM public.material_items WHERE archived_at IS NULL AND trade = 'plumbing';
  SELECT COUNT(*) INTO steel_items      FROM public.material_items WHERE archived_at IS NULL AND trade = 'steel_rebar';
  SELECT COUNT(*) INTO conc_items       FROM public.material_items WHERE archived_at IS NULL AND trade = 'concrete';

  RAISE NOTICE 'material_items backfill complete: total=% classified=% electrical=% plumbing=% steel_rebar=% concrete=% unclassified=%',
    total_items,
    classified_items,
    elec_items,
    plmb_items,
    steel_items,
    conc_items,
    total_items - classified_items;
END $$;
