#!/usr/bin/env python3
"""
EUR/ILS electrical market linkage research — research-only, no production score changes.

Validates whether EUR/ILS improves explanatory power vs USD/ILS for ERCO wire/cable indices.
Outputs: research/eur_ils_electrical_validation_report.json
"""

from __future__ import annotations

import csv
import io
import json
import math
import statistics
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
DATASET = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\dataset")
OUT_JSON = ROOT / "eur_ils_electrical_validation_report.json"
OUT_MD = ROOT / "eur_ils_electrical_validation_report.md"

FAMILIES = ("COPPER_WIRE", "N2XY_COPPER_CABLE")
LAGS = (0, 1, 2, 3)
RESPONSE_DAYS = (30, 60, 90)
STABLE_THRESHOLD = 1.0

FRED = {
    "COPPER_USD": "PCOPPUSDM",
    "USD_ILS": "CCUSMA02ILM618N",
    "EUR_USD": "EXUSEU",
}

BOI_EUR_ILS_URL = (
    "https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/"
    "BOI.STATISTICS/EXR/1.0/RER_EUR_ILS?format=csv&startperiod=2016-01&endperiod=2026-08"
)

FX_BASKETS: dict[str, tuple[float, float]] = {
    "100_EUR": (1.0, 0.0),
    "75_EUR_25_USD": (0.75, 0.25),
    "50_EUR_50_USD": (0.5, 0.5),
    "25_EUR_75_USD": (0.25, 0.75),
    "100_USD": (0.0, 1.0),
}


def fetch_url(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "ProjectFlow-Research/1.0"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read().decode("utf-8")


def fetch_fred_monthly(series_id: str, start_ym: str = "2016-01") -> dict[str, float]:
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    text = fetch_url(url)
    reader = csv.DictReader(io.StringIO(text))
    col = reader.fieldnames[1] if reader.fieldnames else "VALUE"
    out: dict[str, float] = {}
    for row in reader:
        val = row[col]
        if val in (".", "", None):
            continue
        ym = row[reader.fieldnames[0]][:7]
        if ym < start_ym:
            continue
        out[ym] = float(val)
    return out


def fetch_boi_eur_ils_monthly() -> dict[str, float]:
    text = fetch_url(BOI_EUR_ILS_URL)
    reader = csv.DictReader(io.StringIO(text))
    buckets: dict[str, list[float]] = defaultdict(list)
    for row in reader:
        buckets[row["TIME_PERIOD"][:7]].append(float(row["OBS_VALUE"]))
    return {ym: statistics.mean(vals) for ym, vals in buckets.items()}


def derive_eur_ils_fred(usd_ils: dict[str, float], eur_usd: dict[str, float]) -> dict[str, float]:
    """ILS per EUR = (ILS/USD) × (USD/EUR). EXUSEU is USD per 1 EUR."""
    months = sorted(set(usd_ils) & set(eur_usd))
    return {ym: usd_ils[ym] * eur_usd[ym] for ym in months}


def build_copper_ils(copper_usd: dict[str, float], fx: dict[str, float]) -> dict[str, float]:
    months = sorted(set(copper_usd) & set(fx))
    return {ym: copper_usd[ym] * fx[ym] for ym in months}


def build_copper_eur(copper_usd: dict[str, float], eur_usd: dict[str, float]) -> dict[str, float]:
    """Copper in EUR/MT = COPPER_USD / EXUSEU (USD/EUR)."""
    months = sorted(set(copper_usd) & set(eur_usd))
    return {ym: copper_usd[ym] / eur_usd[ym] for ym in months}


def build_import_fx_basket(
    eur_ils: dict[str, float], usd_ils: dict[str, float], eur_w: float, usd_w: float
) -> dict[str, float]:
    months = sorted(set(eur_ils) & set(usd_ils))
    total = eur_w + usd_w
    if total == 0:
        return {}
    ew, uw = eur_w / total, usd_w / total
    return {ym: ew * eur_ils[ym] + uw * usd_ils[ym] for ym in months}


def pct_change_map(values: dict[str, float]) -> dict[str, float]:
    months = sorted(values)
    out: dict[str, float] = {}
    for i in range(1, len(months)):
        prev, cur = months[i - 1], months[i]
        if values[prev] == 0:
            continue
        out[cur] = (values[cur] / values[prev] - 1) * 100
    return out


def pearson(x: list[float], y: list[float]) -> float | None:
    if len(x) < 4 or len(x) != len(y):
        return None
    mx, my = statistics.mean(x), statistics.mean(y)
    num = sum((a - mx) * (b - my) for a, b in zip(x, y))
    den_x = math.sqrt(sum((a - mx) ** 2 for a in x))
    den_y = math.sqrt(sum((b - my) ** 2 for b in y))
    if den_x == 0 or den_y == 0:
        return None
    return num / (den_x * den_y)


def spearman(x: list[float], y: list[float]) -> float | None:
    if len(x) < 4:
        return None
    rx = sorted(range(len(x)), key=lambda i: x[i])
    ry = sorted(range(len(y)), key=lambda i: y[i])
    rank_x = [0] * len(x)
    rank_y = [0] * len(y)
    for r, i in enumerate(rx):
        rank_x[i] = r
    for r, i in enumerate(ry):
        rank_y[i] = r
    return pearson(rank_x, rank_y)


def direction_label(pct: float | None) -> str:
    if pct is None or abs(pct) < STABLE_THRESHOLD:
        return "STABLE"
    return "UP" if pct > 0 else "DOWN"


def direction_agreement(driver_pct: dict[str, float], target_pct: dict[str, float], lag: int) -> dict[str, Any]:
    months = sorted(set(driver_pct) & set(target_pct))
    agree = total = 0
    for i, ym in enumerate(months):
        if i - lag < 0:
            continue
        lag_ym = months[i - lag]
        d = direction_label(driver_pct.get(lag_ym))
        t = direction_label(target_pct.get(ym))
        if d == "STABLE" or t == "STABLE":
            continue
        total += 1
        if d == t:
            agree += 1
    return {
        "agreement_pct": round(100 * agree / total, 2) if total else None,
        "directional_pairs": total,
    }


def lag_correlation(
    driver_pct: dict[str, float],
    target_pct: dict[str, float],
    lag: int,
    period_filter: tuple[str, str] | None = None,
) -> dict[str, Any]:
    months = sorted(set(driver_pct) & set(target_pct))
    xs, ys = [], []
    for i, ym in enumerate(months):
        if period_filter and not (period_filter[0] <= ym <= period_filter[1]):
            continue
        if i - lag < 0:
            continue
        lag_ym = months[i - lag]
        xs.append(driver_pct[lag_ym])
        ys.append(target_pct[ym])
    p = pearson(xs, ys) if xs else None
    s = spearman(xs, ys) if xs else None
    return {
        "lag_months": lag,
        "sample_count": len(xs),
        "pearson": round(p, 4) if p is not None else None,
        "spearman": round(s, 4) if s is not None else None,
        **direction_agreement(driver_pct, target_pct, lag),
    }


def best_lag(driver_pct: dict[str, float], target_pct: dict[str, float], period: tuple[str, str] | None = None):
    results = [lag_correlation(driver_pct, target_pct, lag, period) for lag in LAGS]
    scored = [r for r in results if r["pearson"] is not None]
    if not scored:
        return None, results
    best = max(scored, key=lambda r: abs(r["pearson"]))
    return best, results


def load_family_pct() -> dict[str, dict[str, float]]:
    path = DATASET / "material_family_monthly_index.csv"
    fam_pct: dict[str, dict[str, float]] = {f: {} for f in FAMILIES}
    prev_idx: dict[str, float] = {}
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            fam, ym = row["product_market_family"], row["year_month"]
            if fam not in fam_pct:
                continue
            idx = float(row["index_value"])
            med = row.get("median_percent_change", "")
            if med not in ("", "0", "0.0"):
                fam_pct[fam][ym] = float(med)
            elif fam in prev_idx and prev_idx[fam] > 0:
                fam_pct[fam][ym] = (idx / prev_idx[fam] - 1) * 100
            else:
                fam_pct[fam][ym] = 0.0
            prev_idx[fam] = idx
    return fam_pct


def collapse_check(copper_ils_a: dict[str, float], copper_ils_b: dict[str, float]) -> dict[str, Any]:
    months = sorted(set(copper_ils_a) & set(copper_ils_b))[-24:]
    if not months:
        return {"max_abs_pct_diff": None, "collapses": False}
    diffs = [abs(copper_ils_a[m] - copper_ils_b[m]) / copper_ils_b[m] * 100 for m in months if copper_ils_b[m]]
    max_diff = max(diffs) if diffs else 0
    return {"max_abs_pct_diff": round(max_diff, 6), "collapses": max_diff < 0.01}


def walk_forward_stability(driver_pct: dict[str, float], target_pct: dict[str, float], lag: int) -> dict[str, Any]:
    months = sorted(set(driver_pct) & set(target_pct))
    if len(months) < 24:
        return {"folds": 0, "mean_abs_pearson": None}
    fold_size = 12
    scores = []
    for start in range(12, len(months) - fold_size + 1, 6):
        window = months[start : start + fold_size]
        pf = (window[0], window[-1])
        r = lag_correlation(driver_pct, target_pct, lag, pf)
        if r["pearson"] is not None:
            scores.append(abs(r["pearson"]))
    return {
        "folds": len(scores),
        "mean_abs_pearson": round(statistics.mean(scores), 4) if scores else None,
    }


def main() -> None:
    copper_usd = fetch_fred_monthly(FRED["COPPER_USD"])
    usd_ils = fetch_fred_monthly(FRED["USD_ILS"])
    eur_usd = fetch_fred_monthly(FRED["EUR_USD"])
    boi_eur_ils = fetch_boi_eur_ils_monthly()
    fred_eur_ils = derive_eur_ils_fred(usd_ils, eur_usd)

    boi_months = sorted(set(boi_eur_ils) & set(fred_eur_ils))
    boi_err = [
        abs(fred_eur_ils[m] - boi_eur_ils[m]) / boi_eur_ils[m] * 100 for m in boi_months[-36:]
    ]

    eur_ils = boi_eur_ils  # authoritative for research
    copper_ils = build_copper_ils(copper_usd, usd_ils)
    copper_eur = build_copper_eur(copper_usd, eur_usd)
    copper_ils_via_eur = build_copper_ils(copper_eur, eur_ils)

    drivers: dict[str, dict[str, float]] = {
        "EUR_ILS": pct_change_map(eur_ils),
        "USD_ILS": pct_change_map(usd_ils),
        "COPPER_USD": pct_change_map(copper_usd),
        "COPPER_ILS": pct_change_map(copper_ils),
        "COPPER_EUR": pct_change_map(copper_eur),
    }
    for name, (ew, uw) in FX_BASKETS.items():
        basket = build_import_fx_basket(eur_ils, usd_ils, ew, uw)
        drivers[f"IMPORT_FX_{name}"] = pct_change_map(basket)

    fam_pct = load_family_pct()
    family_results: dict[str, Any] = {}

    for fam in FAMILIES:
        target = fam_pct[fam]
        fam_out: dict[str, Any] = {}
        for driver_name, driver_pct in drivers.items():
            best, all_lags = best_lag(driver_pct, target)
            fam_out[driver_name] = {
                "best_lag": best,
                "all_lags": all_lags,
                "2020_2022": best_lag(driver_pct, target, ("2020-01", "2022-12"))[0],
                "2023_latest": best_lag(driver_pct, target, ("2023-01", "2026-12"))[0],
            }
        family_results[fam] = fam_out

    # COPPER_EUR × EUR_ILS collapse verification
    collapse = collapse_check(copper_ils_via_eur, copper_ils)

    # Compare EUR vs USD for each family
    comparisons: dict[str, Any] = {}
    for fam in FAMILIES:
        eur_best = family_results[fam]["EUR_ILS"]["best_lag"]
        usd_best = family_results[fam]["USD_ILS"]["best_lag"]
        copper_ils_best = family_results[fam]["COPPER_ILS"]["best_lag"]
        comparisons[fam] = {
            "eur_better_than_usd_ils": (
                eur_best is not None
                and usd_best is not None
                and abs(eur_best["pearson"]) > abs(usd_best["pearson"])
            ),
            "eur_better_than_copper_ils": (
                eur_best is not None
                and copper_ils_best is not None
                and abs(eur_best["pearson"]) > abs(copper_ils_best["pearson"])
            ),
        }

    basket_vs_usd: dict[str, bool] = {}
    for fam in FAMILIES:
        usd_p = family_results[fam]["USD_ILS"]["best_lag"]
        usd_abs = abs(usd_p["pearson"]) if usd_p and usd_p["pearson"] is not None else 0
        for bname in FX_BASKETS:
            bp = family_results[fam][f"IMPORT_FX_{bname}"]["best_lag"]
            b_abs = abs(bp["pearson"]) if bp and bp["pearson"] is not None else 0
            basket_vs_usd[f"{fam}_{bname}"] = b_abs > usd_abs

    # Regime analysis
    regime: dict[str, Any] = {}
    for fam in FAMILIES:
        e20 = family_results[fam]["EUR_ILS"]["2020_2022"]
        e23 = family_results[fam]["EUR_ILS"]["2023_latest"]
        u20 = family_results[fam]["USD_ILS"]["2020_2022"]
        u23 = family_results[fam]["USD_ILS"]["2023_latest"]
        regime[fam] = {
            "eur_2020_2022_pearson": e20["pearson"] if e20 else None,
            "eur_2023_latest_pearson": e23["pearson"] if e23 else None,
            "usd_2020_2022_pearson": u20["pearson"] if u20 else None,
            "usd_2023_latest_pearson": u23["pearson"] if u23 else None,
            "eur_strengthens_recent": (
                e20 and e23 and e20["pearson"] is not None and e23["pearson"] is not None
                and abs(e23["pearson"]) > abs(e20["pearson"])
            ),
        }

    wf_eur_cw = walk_forward_stability(drivers["EUR_ILS"], fam_pct["COPPER_WIRE"], 1)
    wf_usd_cw = walk_forward_stability(drivers["USD_ILS"], fam_pct["COPPER_WIRE"], 1)
    wf_eur_n2 = walk_forward_stability(drivers["EUR_ILS"], fam_pct["N2XY_COPPER_CABLE"], 1)
    wf_usd_n2 = walk_forward_stability(drivers["USD_ILS"], fam_pct["N2XY_COPPER_CABLE"], 1)

    regime_stability = (
        wf_eur_cw["mean_abs_pearson"] is not None
        and wf_usd_cw["mean_abs_pearson"] is not None
        and wf_eur_n2["mean_abs_pearson"] is not None
        and wf_usd_n2["mean_abs_pearson"] is not None
        and (wf_eur_cw["mean_abs_pearson"] + wf_eur_n2["mean_abs_pearson"])
        > (wf_usd_cw["mean_abs_pearson"] + wf_usd_n2["mean_abs_pearson"])
    )

    # Acceptance: require multi-criterion improvement; correlation alone is insufficient.
    meaningful_criteria = 0
    cw23 = family_results["COPPER_WIRE"]["EUR_ILS"]["2023_latest"]
    n223 = family_results["N2XY_COPPER_CABLE"]["EUR_ILS"]["2023_latest"]
    cw_cils23 = family_results["COPPER_WIRE"]["COPPER_ILS"]["2023_latest"]
    n2_cils23 = family_results["N2XY_COPPER_CABLE"]["COPPER_ILS"]["2023_latest"]

    recent_eur_beats_usd = (
        cw23 and cw23.get("pearson") is not None
        and family_results["COPPER_WIRE"]["USD_ILS"]["2023_latest"]
        and abs(cw23["pearson"]) > abs(family_results["COPPER_WIRE"]["USD_ILS"]["2023_latest"]["pearson"] or 0)
        and n223 and n223.get("pearson") is not None
        and family_results["N2XY_COPPER_CABLE"]["USD_ILS"]["2023_latest"]
        and abs(n223["pearson"]) > abs(family_results["N2XY_COPPER_CABLE"]["USD_ILS"]["2023_latest"]["pearson"] or 0)
    )
    if recent_eur_beats_usd:
        meaningful_criteria += 1

    eur_beats_copper_ils_recent = (
        cw23 and cw_cils23
        and cw23.get("pearson") is not None
        and cw_cils23.get("pearson") is not None
        and abs(cw23["pearson"]) > abs(cw_cils23["pearson"])
        and n223 and n2_cils23
        and n223.get("pearson") is not None
        and n2_cils23.get("pearson") is not None
        and abs(n223["pearson"]) > abs(n2_cils23["pearson"])
    )
    if eur_beats_copper_ils_recent:
        meaningful_criteria += 1

    positive_full_sample = (
        family_results["COPPER_WIRE"]["EUR_ILS"]["best_lag"]
        and family_results["N2XY_COPPER_CABLE"]["EUR_ILS"]["best_lag"]
        and (family_results["COPPER_WIRE"]["EUR_ILS"]["best_lag"]["pearson"] or 0) > 0
        and (family_results["N2XY_COPPER_CABLE"]["EUR_ILS"]["best_lag"]["pearson"] or 0) > 0
    )
    if positive_full_sample:
        meaningful_criteria += 1

    if regime_stability:
        meaningful_criteria += 1

    if regime["COPPER_WIRE"].get("eur_strengthens_recent") and regime["N2XY_COPPER_CABLE"].get("eur_strengthens_recent"):
        meaningful_criteria += 1

    production_change = meaningful_criteria >= 3 and eur_beats_copper_ils_recent and positive_full_sample

    report: dict[str, Any] = {
        "eur_ils_source": {
            "code": "EUR_ILS",
            "provider": "Bank of Israel (BOI SDMX)",
            "series": "RER_EUR_ILS",
            "units": "ILS per EUR",
            "frequency": "daily aggregated to monthly mean",
            "historical_range": f"{min(boi_eur_ils)} to {max(boi_eur_ils)}",
            "source_url": BOI_EUR_ILS_URL,
            "free_public": True,
            "fred_cross_check": {
                "formula": "USD_ILS × EXUSEU (FRED CCUSMA02ILM618N × EXUSEU)",
                "mean_abs_pct_error_vs_boi_last36m": round(statistics.mean(boi_err), 4),
            },
        },
        "copper_eur_formula": "COPPER_EUR = COPPER_USD / EXUSEU (EUR per metric ton)",
        "copper_eur_x_eur_ils_collapse": collapse,
        "family_results": family_results,
        "comparisons": comparisons,
        "basket_vs_usd": basket_vs_usd,
        "regime": regime,
        "walk_forward": {
            "EUR_ILS_COPPER_WIRE": wf_eur_cw,
            "USD_ILS_COPPER_WIRE": wf_usd_cw,
            "EUR_ILS_N2XY": wf_eur_n2,
            "USD_ILS_N2XY": wf_usd_n2,
        },
        "supplier_currency_regime": {
            "current_origin": "Greece (known)",
            "older_origin": "Turkey (known)",
            "payment_currency": "UNKNOWN",
            "transition_date": "UNKNOWN",
        },
        "production_methodology_changed": production_change,
        "recommended_methodology_version": "V1.1" if production_change else "V1",
        "meaningful_criteria_met": meaningful_criteria,
    }

    OUT_JSON.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    cw_best = family_results["COPPER_WIRE"]["EUR_ILS"]["best_lag"]
    n2_best = family_results["N2XY_COPPER_CABLE"]["EUR_ILS"]["best_lag"]
    md = f"""# EUR/ILS Electrical Validation Report

## Source
- **EUR_ILS**: BOI SDMX `RER_EUR_ILS` (ILS per EUR), monthly mean 2016-01 → latest
- FRED cross-check: USD_ILS × EXUSEU, mean error vs BOI {statistics.mean(boi_err):.4f}%

## COPPER_EUR collapse
- COPPER_EUR × EUR_ILS vs COPPER_USD × USD_ILS max diff: {collapse['max_abs_pct_diff']}% — collapses: {collapse['collapses']}

## COPPER_WIRE
- Best EUR lag: {cw_best}
- EUR better than USD_ILS: {comparisons['COPPER_WIRE']['eur_better_than_usd_ils']}

## N2XY_COPPER_CABLE
- Best EUR lag: {n2_best}
- EUR better than USD_ILS: {comparisons['N2XY_COPPER_CABLE']['eur_better_than_usd_ils']}

## Production decision
- **Change methodology**: {production_change}
- **Criteria met**: {meaningful_criteria}/4
"""
    OUT_MD.write_text(md, encoding="utf-8")
    print(json.dumps({
        "production_change": production_change,
        "cw_eur_best": cw_best,
        "n2_eur_best": n2_best,
        "meaningful_criteria": meaningful_criteria,
    }, indent=2))


if __name__ == "__main__":
    main()
