# External Market Data & Linkage Report

Generated: 2026-09-26T18:39:52.668847

## Sources (free, no API key)

| Driver | Series | Range |
|--------|--------|-------|
| COPPER_USD | PCOPPUSDM | 2016-01-01 to 2026-07-01 |
| ALUMINIUM_USD | PALUMUSDM | 2016-01-01 – 2026-07-01 |
| USD_ILS | CCUSMA02ILM618N | 2016-01-01 to 2026-08-01 |
| OIL_OR_ENERGY | POILBREUSDM (Brent) | 2016-01-01 to 2026-07-01 |
| ISRAEL_CONSTRUCTION_INPUT_INDEX | CBS 200010 | 2018-05-01 to 2026-08-01 |
| COPPER_ILS | derived | COPPER_USD × USD_ILS |

Raw files preserved under `market_data/raw/`.

## Overlap

- External months loaded: **128**
- ERCO overlap months (N2XY): **68**

## Best Lag Correlations

### COPPER_WIRE
- Driver: **ISRAEL_CONSTRUCTION_INPUT_INDEX** lag **2** months
- Pearson: **0.311** | Direction agreement: **1.0**

### N2XY_COPPER_CABLE
- Driver: **COPPER_ILS** lag **2** months
- Pearson: **0.1976** | Direction agreement: **0.9394**

**COPPER_ILS better than COPPER_USD:** YES

## Event Response (N2XY, copper ±3%, 0–30d window)

- After copper **UP**: median supplier change = 2.8334
- After copper **DOWN**: median supplier change = -2.5316
- **Asymmetric response:** YES

## Verdict

- **Historical linkage:** WEAK
- **Data quality:** HIGH
- **Ready for forecast backtest:** NO
- **No paid data / no AI:** YES

See `analysis/lag_analysis.csv`, `dataset/material_event_response.csv`, `dataset/family_market_linkage.csv`.
