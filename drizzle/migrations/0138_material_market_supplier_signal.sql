-- 0138: Material market supplier signal + concrete/cement trade expansion.
-- Migration after 0137. Do not modify migrations 0000–0137.
-- Additive only. No backfill in SQL — tag material_items.trade manually or via admin UI.
--
-- CHANGES:
--   1. material_items.trade     — adds trade categorisation for vendor price supplier signal
--   2. material_market_sources  — extends allowed trade values to include 'concrete'
--   3. material_pressure_snapshots — extends allowed trade values to include 'concrete'
--
-- SUPPLIER SIGNAL RATIONALE:
--   The supplier signal component of trade pressure scores was always null because
--   material_vendor_prices lacked a trade dimension. Adding material_items.trade
--   allows vendor prices to be aggregated by trade category and fed into the score engine.
--   Coverage depends on how many material items users tag with a trade.
--
-- CONCRETE TRADE RATIONALE:
--   Research (trade_feasibility_matrix.csv, score 14/25, LEVEL 2):
--   CBS 201140 (cement index) + CBS 201160 (ready-mix concrete index) are free,
--   regularly updated government series. External driver: energy (Brent via FRED).
--   Plumbing already existed; this adds concrete as the 4th supported trade.
--
-- EUR/ILS NOTE (no schema change needed):
--   The EUR_ILS source row trade column was tagged 'electrical' in the seed data.
--   This is corrected at the application layer in sources/registry.ts (trade: null).
--   The upsertSourceSeed function will update the DB row on next refresh.
--
-- DO NOT APPLY without explicit Owner approval.

-- 1. Add trade column to material_items
ALTER TABLE public.material_items
  ADD COLUMN IF NOT EXISTS trade text;

ALTER TABLE public.material_items
  ADD CONSTRAINT material_items_trade_known
  CHECK (trade IS NULL OR trade IN ('electrical', 'plumbing', 'steel_rebar', 'concrete'));

CREATE INDEX IF NOT EXISTS material_items_trade_idx
  ON public.material_items (trade)
  WHERE trade IS NOT NULL;

-- 2. Extend material_market_sources to allow 'concrete' trade
--    Must drop and recreate the check constraint (Postgres does not support ALTER CHECK).
ALTER TABLE public.material_market_sources
  DROP CONSTRAINT IF EXISTS material_market_sources_trade_known;

ALTER TABLE public.material_market_sources
  ADD CONSTRAINT material_market_sources_trade_known
  CHECK (trade IS NULL OR trade IN ('electrical', 'plumbing', 'steel_rebar', 'concrete'));

-- 3. Extend material_pressure_snapshots to allow 'concrete' trade
ALTER TABLE public.material_pressure_snapshots
  DROP CONSTRAINT IF EXISTS material_pressure_snapshots_trade_known;

ALTER TABLE public.material_pressure_snapshots
  ADD CONSTRAINT material_pressure_snapshots_trade_known
  CHECK (trade IN ('electrical', 'plumbing', 'steel_rebar', 'concrete'));
