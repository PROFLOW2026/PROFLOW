# Material Pressure Engine V1 — Methodology

Generated: 2026-09-26T19:06:07.099260

## Purpose
Transparent **0–100 market pressure indicator** (not a forecast). Answers: *how much upward or downward price pressure exists now?*

## Score mapping
- Component driver signal ∈ [-1, +1] from capped % changes (1m/3m/6m weighted 20/50/30)
- Component score = `50 + 50 × signal` (bounded 0–100)
- Trade pressure = weighted mean of available component scores (weights renormalized if ≥60% coverage)

## Direction bands
| Score | Direction |
|-------|-----------|
| 0–20 | STRONG_DOWN |
| 21–40 | DOWN |
| 41–59 | NEUTRAL |
| 60–79 | UP |
| 80–100 | STRONG_UP |

## Sensitivity profiles
- **Commodities** (copper, oil, scrap, iron ore, polymer proxy): ±10% → ±1.0; piecewise linear
- **FX (USD/ILS)**: ±5% → ±1.0 (lower volatility)
- **CBS indices & supplier lists**: ±3% → ±1.0

## Trade weights
See `material_pressure_methodology.json` for full weight tables.

## Confidence
- HIGH: ≥80% of nominal weight available
- MEDIUM: 60–79%
- LOW: <60% or sparse Golan/ERCO history

## No future leakage
All inputs use data available at or before month *t* only.
