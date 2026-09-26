# EUR/ILS Electrical Validation Report

## Source
- **EUR_ILS**: BOI SDMX `RER_EUR_ILS` (ILS per EUR), monthly mean 2016-01 → latest
- FRED cross-check: USD_ILS × EXUSEU, mean error vs BOI 0.0898%

## COPPER_EUR collapse
- COPPER_EUR × EUR_ILS vs COPPER_USD × USD_ILS max diff: 0.851899% — collapses: False

## COPPER_WIRE
- Best EUR lag: {'lag_months': 1, 'sample_count': 66, 'pearson': 0.1343, 'spearman': 0.174, 'agreement_pct': 80.0, 'directional_pairs': 5}
- EUR better than USD_ILS: True

## N2XY_COPPER_CABLE
- Best EUR lag: {'lag_months': 1, 'sample_count': 67, 'pearson': -0.2197, 'spearman': 0.2461, 'agreement_pct': 72.73, 'directional_pairs': 11}
- EUR better than USD_ILS: True

## Production decision
- **Change methodology**: False
- **Criteria met**: 3/4
