import {
  HORIZON_WEIGHTS,
  MIN_COVERAGE_FOR_DISPLAY,
  THRESHOLDS_BY_PROFILE,
  TRADE_WEIGHTS,
  type ThresholdPoint,
} from './methodology';
import type {
  LocalConfirmation,
  MaterialTrade,
  MonthlySeries,
  PressureConfidence,
  PressureDirection,
  PressureMomentum,
  SignalProfile,
  TradeComponentKey,
  TradeSnapshotRow,
} from './types';
import { METHODOLOGY_VERSION } from './types';

function piecewiseSignal(pct: number | null, thresholds: readonly ThresholdPoint[]): number | null {
  if (pct === null) return null;
  if (pct <= thresholds[0]![0]) return thresholds[0]![1];
  if (pct >= thresholds[thresholds.length - 1]![0]) return thresholds[thresholds.length - 1]![1];
  for (let i = 0; i < thresholds.length - 1; i++) {
    const [x0, y0] = thresholds[i]!;
    const [x1, y1] = thresholds[i + 1]!;
    if (pct >= x0 && pct <= x1) {
      if (x1 === x0) return y0;
      const t = (pct - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return 0;
}

export function nMonthChange(series: MonthlySeries, ym: string, n: number): number | null {
  const months = Object.keys(series).sort();
  if (!(ym in series)) return null;
  const i = months.indexOf(ym);
  if (i - n < 0) return null;
  const prevKey = months[i - n];
  if (!prevKey) return null;
  const prev = series[prevKey];
  if (prev == null || prev === 0) return null;
  return (series[ym]! / prev - 1) * 100;
}

export function driverSignal(
  series: MonthlySeries,
  ym: string,
  profile: SignalProfile,
): number | null {
  const thresholds = THRESHOLDS_BY_PROFILE[profile];
  const parts: Array<[number, number]> = [];
  for (const [horizon, weight] of Object.entries(HORIZON_WEIGHTS)) {
    const n = Number.parseInt(horizon.replace('m', ''), 10);
    const change = nMonthChange(series, ym, n);
    const signal = piecewiseSignal(change, thresholds);
    if (signal !== null) parts.push([signal, weight]);
  }
  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((sum, [, w]) => sum + w, 0);
  return parts.reduce((sum, [s, w]) => sum + s * w, 0) / totalWeight;
}

export function signalToComponentScore(signal: number | null): number | null {
  if (signal === null) return null;
  return Math.max(0, Math.min(100, 50 + 50 * signal));
}

export function scoreDirection(score: number): PressureDirection {
  if (score <= 20) return 'strong_down';
  if (score <= 40) return 'down';
  if (score <= 59) return 'neutral';
  if (score <= 79) return 'up';
  return 'strong_up';
}

export function trendFromSignal(sig: number | null): 'UP' | 'DOWN' | 'FLAT' {
  if (sig === null) return 'FLAT';
  if (sig >= 0.25) return 'UP';
  if (sig <= -0.25) return 'DOWN';
  return 'FLAT';
}

export function momentumLabel(d1: number | null, d3: number | null): PressureMomentum {
  if (d1 === null) return 'stable';
  if (d1 >= 10) return 'rising_fast';
  if (d1 >= 4) return 'rising';
  if (d1 <= -10) return 'falling_fast';
  if (d1 <= -4) return 'falling';
  if (d3 !== null && Math.abs(d3) >= 8) return d3 > 0 ? 'rising' : 'falling';
  return 'stable';
}

export function computeTradeMonth(
  components: Partial<Record<TradeComponentKey, number | null>>,
  weights: Partial<Record<TradeComponentKey, number>>,
): { score: number; coverage: number; confidence: PressureConfidence } {
  const avail = Object.fromEntries(
    Object.entries(components).filter(([, v]) => v != null),
  ) as Record<string, number>;
  const coverage = Object.keys(avail).reduce((sum, key) => sum + (weights[key as TradeComponentKey] ?? 0), 0);
  let confidence: PressureConfidence;
  if (coverage < MIN_COVERAGE_FOR_DISPLAY) confidence = 'low';
  else if (coverage >= 0.8) confidence = 'high';
  else confidence = 'medium';
  if (coverage < 0.01) return { score: 50, coverage: 0, confidence: 'low' };
  const renorm = Object.fromEntries(
    Object.keys(avail).map((key) => [key, (weights[key as TradeComponentKey] ?? 0) / coverage]),
  );
  const score = Object.entries(avail).reduce(
    (sum, [key, value]) => sum + value * renorm[key]!,
    0,
  );
  return { score, coverage, confidence };
}

export function buildCopperIls(
  copperUsd: MonthlySeries,
  fx: MonthlySeries,
): MonthlySeries {
  const out: MonthlySeries = {};
  for (const ym of Object.keys(copperUsd).sort()) {
    if (ym in fx) out[ym] = copperUsd[ym]! * fx[ym]!;
  }
  return out;
}

/** ILS per EUR = (ILS/USD) × (USD/EUR). Cross-validated against BOI RER_EUR_ILS monthly mean. */
export function buildEurIls(usdIls: MonthlySeries, eurUsd: MonthlySeries): MonthlySeries {
  const out: MonthlySeries = {};
  for (const ym of Object.keys(usdIls).sort()) {
    if (ym in eurUsd) out[ym] = usdIls[ym]! * eurUsd[ym]!;
  }
  return out;
}

/** Copper in EUR/MT = COPPER_USD / EUR_USD. COPPER_EUR × EUR_ILS ≈ COPPER_ILS (same ILS exposure). */
export function buildCopperEur(copperUsd: MonthlySeries, eurUsd: MonthlySeries): MonthlySeries {
  const out: MonthlySeries = {};
  for (const ym of Object.keys(copperUsd).sort()) {
    if (ym in eurUsd && eurUsd[ym]! !== 0) out[ym] = copperUsd[ym]! / eurUsd[ym]!;
  }
  return out;
}

/** Research-only import FX basket level (not a production electrical driver). */
export function buildImportFxBasket(
  eurIls: MonthlySeries,
  usdIls: MonthlySeries,
  eurWeight: number,
  usdWeight: number,
): MonthlySeries {
  const total = eurWeight + usdWeight;
  if (total === 0) return {};
  const ew = eurWeight / total;
  const uw = usdWeight / total;
  const out: MonthlySeries = {};
  for (const ym of Object.keys(eurIls).sort()) {
    if (ym in usdIls) out[ym] = ew * eurIls[ym]! + uw * usdIls[ym]!;
  }
  return out;
}

export function blendCbsPlumbing(
  cbs380: MonthlySeries,
  cbs400: MonthlySeries,
): MonthlySeries {
  const out: MonthlySeries = {};
  const months = new Set([...Object.keys(cbs380), ...Object.keys(cbs400)]);
  for (const ym of [...months].sort()) {
    const vals: number[] = [];
    if (ym in cbs380) vals.push(cbs380[ym]!);
    if (ym in cbs400) vals.push(cbs400[ym]!);
    if (vals.length > 0) out[ym] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return out;
}

export interface DriverSeriesMap {
  COPPER_ILS: MonthlySeries;
  CBS_CONDUCTORS: MonthlySeries;
  USD_ILS: MonthlySeries;
  ALUMINIUM_USD: MonthlySeries;
  OIL_OR_ENERGY: MonthlySeries;
  CBS_PLUMBING_BLEND: MonthlySeries;
  PVC_POLYMER_PROXY: MonthlySeries;
  CBS_REBAR: MonthlySeries;
  STEEL_SCRAP: MonthlySeries;
  IRON_ORE: MonthlySeries;
  HRC_STEEL: MonthlySeries;
}

export function computeAllTradeSnapshots(drivers: DriverSeriesMap): TradeSnapshotRow[] {
  const allMonths = new Set<string>();
  for (const series of Object.values(drivers)) {
    for (const ym of Object.keys(series)) allMonths.add(ym);
  }
  const months = [...allMonths].sort();
  const scoresByTrade: Record<MaterialTrade, Record<string, number>> = {
    electrical: {},
    plumbing: {},
    steel_rebar: {},
  };
  const rows: TradeSnapshotRow[] = [];

  for (const ym of months) {
    const snapshotDate = `${ym}-01`;
    const compSignals = {
      copper: driverSignal(drivers.COPPER_ILS, ym, 'commodity'),
      cbs_electrical: driverSignal(drivers.CBS_CONDUCTORS, ym, 'cbs'),
      fx: driverSignal(drivers.USD_ILS, ym, 'fx'),
      aluminium: driverSignal(drivers.ALUMINIUM_USD, ym, 'commodity'),
      energy: driverSignal(drivers.OIL_OR_ENERGY, ym, 'commodity'),
      cbs_plumbing: driverSignal(drivers.CBS_PLUMBING_BLEND, ym, 'cbs'),
      polymer: driverSignal(drivers.PVC_POLYMER_PROXY, ym, 'commodity'),
      cbs_rebar: driverSignal(drivers.CBS_REBAR, ym, 'cbs'),
      scrap: driverSignal(drivers.STEEL_SCRAP, ym, 'commodity'),
      iron_ore: driverSignal(drivers.IRON_ORE, ym, 'commodity'),
      steel: driverSignal(drivers.HRC_STEEL, ym, 'commodity'),
    };
    const compScores = Object.fromEntries(
      Object.entries(compSignals).map(([k, v]) => [k, signalToComponentScore(v)]),
    ) as Record<string, number | null>;

    const elComp = {
      copper: compScores.copper,
      cbs: compScores.cbs_electrical,
      fx: compScores.fx,
      aluminium: compScores.aluminium,
      energy: compScores.energy,
      supplier: null,
    };
    const plComp = {
      cbs: compScores.cbs_plumbing,
      supplier: null as number | null,
      polymer: compScores.polymer,
      energy: compScores.energy,
      fx: compScores.fx,
    };

    const stComp = {
      cbs: compScores.cbs_rebar,
      scrap: compScores.scrap,
      iron_ore: compScores.iron_ore,
      steel: compScores.steel,
      fx: compScores.fx,
      energy: compScores.energy,
    };

    const el = computeTradeMonth(elComp, TRADE_WEIGHTS.electrical);
    const pl = computeTradeMonth(plComp, TRADE_WEIGHTS.plumbing);
    const st = computeTradeMonth(stComp, TRADE_WEIGHTS.steel_rebar);

    const payloads: Array<{
      trade: MaterialTrade;
      score: number;
      confidence: PressureConfidence;
      coverage: number;
      comps: Partial<Record<TradeComponentKey, number | null>>;
      localSig: number | null;
    }> = [
      {
        trade: 'electrical',
        score: el.score,
        confidence: el.confidence,
        coverage: el.coverage,
        comps: elComp,
        localSig: null,
      },
      {
        trade: 'plumbing',
        score: pl.score,
        confidence: pl.confidence,
        coverage: pl.coverage,
        comps: plComp,
        localSig: null,
      },
      {
        trade: 'steel_rebar',
        score: st.score,
        confidence: st.confidence,
        coverage: st.coverage,
        comps: stComp,
        localSig: compSignals.cbs_rebar,
      },
    ];

    for (const payload of payloads) {
      const { trade, score, confidence, coverage, comps, localSig } = payload;
      scoresByTrade[trade][ym] = score;
      const tradeMonths = Object.keys(scoresByTrade[trade]).sort();
      const i = tradeMonths.indexOf(ym);
      const d1 = i >= 1 ? score - scoresByTrade[trade][tradeMonths[i - 1]!]! : null;
      const d3 = i >= 3 ? score - scoresByTrade[trade][tradeMonths[i - 3]!]! : null;
      const direction = scoreDirection(score);
      const localTrend = trendFromSignal(localSig);
      const pressureTrend = score >= 60 ? 'UP' : score <= 40 ? 'DOWN' : 'NEUTRAL';
      let localConfirmation: LocalConfirmation;
      if (localSig === null) localConfirmation = 'no_local_data';
      else if (localTrend === 'FLAT' || pressureTrend === 'NEUTRAL') localConfirmation = 'not_confirmed';
      else if (
        (localTrend === 'UP' && pressureTrend === 'UP') ||
        (localTrend === 'DOWN' && pressureTrend === 'DOWN')
      ) {
        localConfirmation = localTrend === 'UP' ? 'confirmed_up' : 'confirmed_down';
      } else localConfirmation = 'not_confirmed';

      const { driversUp, driversDown } = topDrivers(trade, comps);

      rows.push({
        trade,
        snapshotDate,
        pressureScore: round2(score),
        pressureDirection: direction,
        confidence,
        pressureScore1mChange: d1 !== null ? round2(d1) : null,
        pressureScore3mChange: d3 !== null ? round2(d3) : null,
        pressureMomentum: momentumLabel(d1, d3),
        localConfirmation,
        weightedDataCoverage: round4(coverage),
        components: comps,
        driversUp,
        driversDown,
        methodologyVersion: METHODOLOGY_VERSION,
      });
    }
  }

  return rows;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function topDrivers(
  trade: MaterialTrade,
  comps: Partial<Record<TradeComponentKey, number | null>>,
  n = 3,
): { driversUp: string[]; driversDown: string[] } {
  const driverKeys: TradeComponentKey[] =
    trade === 'electrical'
      ? ['copper', 'cbs', 'fx', 'aluminium', 'energy', 'supplier']
      : trade === 'plumbing'
        ? ['cbs', 'supplier', 'polymer', 'energy', 'fx']
        : ['cbs', 'scrap', 'iron_ore', 'steel', 'fx', 'energy'];

  const vals = driverKeys
    .map((key) => ({ key, value: comps[key] ?? null }))
    .filter((entry): entry is { key: TradeComponentKey; value: number } => entry.value != null);

  vals.sort((a, b) => b.value - a.value);
  const driversUp = vals.filter((v) => v.value >= 55).slice(0, n).map((v) => v.key);
  const driversDown = [...vals]
    .sort((a, b) => a.value - b.value)
    .filter((v) => v.value <= 45)
    .slice(0, n)
    .map((v) => v.key);
  return { driversUp, driversDown };
}
