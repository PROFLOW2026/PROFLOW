# Material Market Monitor V1

## Purpose

Owner-side **market pressure monitor** for construction trades: electrical, plumbing, steel/rebar.
Transparent 0–100 indicator of current upward/downward pressure — **not** a price forecast.

## Global data rationale

CBS/FRED series are national/global, not tenant-specific. All organizations share the same public indices.
Read access is gated by org RBAC: `materials.read` via `role_assignments` only. Employee-app grants cannot SELECT these tables.

## What the score means

| Range | Direction |
|-------|-----------|
| 0–20 | Strong downward pressure |
| 21–40 | Downward pressure |
| 41–59 | Neutral |
| 60–79 | Upward pressure |
| 80–100 | Strong upward pressure |

## What it does NOT mean

- No predicted future prices
- No buy/wait signals
- No 30/60/90-day forecasts
- No AI/ML inference

## Active production sources

| Code | Provider | Series |
|------|----------|--------|
| COPPER_USD | FRED | PCOPPUSDM |
| ALUMINIUM_USD | FRED | PALUMUSDM |
| USD_ILS | FRED | CCUSMA02ILM618N |
| OIL_OR_ENERGY | FRED | POILBREUSDM |
| IRON_ORE | FRED | PIORECRUSDM |
| STEEL_SCRAP | FRED | WPS101211 |
| HRC_STEEL | FRED | WPS101704 |
| PVC_POLYMER_PROXY | FRED | WPU063801 |
| CBS_CONDUCTORS | CBS | 201340 |
| CBS_PLUMBING | CBS | 201380 |
| CBS_PLASTIC_PIPES | CBS | 201400 |
| CBS_REBAR | CBS | 201230 |
| COPPER_ILS | Derived | COPPER_USD × USD_ILS |
| CBS_PLUMBING_BLEND | Derived | mean(CBS_PLUMBING, CBS_PLASTIC_PIPES) |

**Not in production:** Golan/Pexgol local PDFs (research-only; flat series excluded). ERCO supplier invoices (no production import).

## Trade weights (V1)

**Electrical:** copper 35%, CBS 25%, FX 10%, aluminium 10%, energy 5%, supplier 15% (supplier excluded when no local data → renormalized)

**Plumbing:** CBS 30%, supplier 30%, polymer 20%, energy 10%, FX 10% (supplier excluded in V1 → renormalized)

**Steel/rebar:** CBS 35%, scrap 20%, iron ore 15%, steel 10%, FX 10%, energy 10%

## Complete-month logic

Only snapshots with **≥60% weighted coverage** are stored and displayed. Partial current-month mixes are excluded. Momentum (1m/3m) is recomputed on the complete-month sequence only.

## Migration

`drizzle/migrations/0132_material_market_monitor.sql` — **requires explicit Owner approval before apply**.

## Bootstrap

```bash
npx tsx scripts/material-market-bootstrap.ts
```

## Parity check (no DB)

```bash
npx tsx scripts/material-market-parity-check.ts
```

## Inspect source failures

```sql
SELECT code, last_observation_date, last_refresh_at, last_error, is_active
FROM material_market_sources
ORDER BY code;
```

## Methodology version

**V1** — matches validated research engine (`material_pressure_methodology.json`).
