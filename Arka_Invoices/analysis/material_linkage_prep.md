# Material Market Linkage Preparation

Generated: 2026-09-26T18:34:11.992858

## Scope

V1 forecasting universe focuses on **copper wires**, **N2XY copper cables**, and **aluminium cables** with usable price history. Tools, breakers, panels, and accessories remain outside the core universe.

## Material Classification

| Driver | Products |
|--------|----------|
| COPPER | 73 |
| COPPER_PVC | 30 |
| ALUMINIUM | 5 |
| ALUMINIUM_PVC | 0 |
| PVC | 21 |
| OTHER | 296 |
| UNKNOWN | 1116 |

## Core Forecasting Universe

- **Total core products:** 64
- COPPER_WIRE in core: 31
- N2XY_COPPER_CABLE in core: 33
- ALUMINIUM_CABLE in core: 0

Exclusion reasons for non-core products are recorded in `material_product_map.csv` → `core_exclusion_reason`.

## Family Price Index Methodology

1. For each core SKU, sort usable price observations by date.
2. Compute observation-to-observation **percent change** (never mix absolute ₪/m across sections).
3. Classify gap since prior purchase: **FRESH** (≤45d), **MODERATE** (46–120d), **STALE** (>120d).
4. Only **FRESH** and **MODERATE** events feed the family index (stale treated cautiously).
5. Per family-month: **median** percent change across contributing SKUs.
6. Chain into cumulative index (first month = 100). Months without events hold the last index level — this is index-level carry, **not** SKU price forward-fill.

## Family Index Status

| Family | Status |
|--------|--------|
| COPPER_WIRE | READY |
| N2XY_COPPER_CABLE | READY |
| ALUMINIUM_CABLE | NOT READY |

## Supplier Price Events

- **Events:** 2058
- **Date range:** 2017-10-03 → 2025-03-27

## External Driver Schema

Empty schema-ready file: `dataset/external_market_drivers.csv`

Required drivers (free sources to be loaded later):

| Driver | Frequency |
|--------|-----------|
| COPPER_USD | daily |
| ALUMINIUM_USD | daily |
| USD_ILS | daily |
| OIL_OR_ENERGY | daily |
| ISRAEL_CONSTRUCTION_INPUT_INDEX | monthly |

## Lag Analysis Framework (prepared, not executed)

Test lags: 0, 7, 14, 21, 30, 45, 60, 90 days.

Research question: *When copper changes today, after how long does ERCO pricing tend to change?*

Daily drivers → align on event date minus lag. Monthly index → join on `year_month`.

## Forecast Targets (schema only — no labels computed)

- `30D_DIRECTION`, `60D_DIRECTION`, `90D_DIRECTION` → DOWN / STABLE / UP
- `family_price_change_30d`, `_60d`, `_90d` → percent (computed only at intentional backtest stage)

## Outputs

| File | Description |
|------|-------------|
| `dataset/material_product_map.csv` | Full material/family classification |
| `dataset/core_forecasting_products.csv` | V1 universe subset |
| `dataset/material_family_monthly_index.csv` | Chained family movement indices |
| `dataset/supplier_price_change_events.csv` | Pairwise supplier price changes |
| `dataset/external_market_drivers.csv` | Empty schema for free market data |

**No forecasting. No external fetch. No AI. No paid data.**
