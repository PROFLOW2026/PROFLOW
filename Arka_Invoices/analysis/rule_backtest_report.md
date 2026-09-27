# Rule-Based Forecast Backtest

Generated: 2026-09-26T18:43:15.358301

## Methodology

- **Stable threshold:** ±1.5% for UP/DOWN/STABLE classification
- **Signal thresholds tested:** 2.0, 3.0, 5.0%
- **Horizons:** 30d=1mo, 60d=2mo, 90d=3mo forward family index change
- **Walk-forward:** 24mo calibration → pick threshold → 12mo evaluation, rolling
- **No future leakage, no ML, no AI**

## Best Full-History Rules

### N2XY_COPPER_CABLE
- Rule: **RULE_H** (Weighted composite)
- Horizon: **90d** @ threshold **5.0%**
- Direction accuracy: **0.5789** (n=19, MEDIUM_SAMPLE)
- Baseline outperformance: **0.0789**

### COPPER_WIRE
- Rule: **RULE_H** (Weighted composite)
- Horizon: **60d** @ **5.0%**
- Direction accuracy: **0.4706** (n=17)

## Linkage Candidate (RULE_A — COPPER_ILS 2m, N2XY 90d @ 5%)
- Direction accuracy: **0.52** (n=25)
- Baseline outperformance: **0.02**

## 2023+ Regime (N2XY)
- **RULE_A** acc=0.4 n=15

## Walk-Forward
- N2XY mean acc: **0.3448** (60 folds)
- COPPER_WIRE mean acc: **0.1541**

## Verdict

| Metric | Value |
|--------|-------|
| Practical value | **INCONCLUSIVE** |
| Overfitting risk | **HIGH** |
| Ready for simple forecast MVP | **NO** |
