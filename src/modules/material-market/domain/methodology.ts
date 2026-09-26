import type { MaterialTrade, SignalProfile, TradeComponentKey } from './types';

export type ThresholdPoint = readonly [number, number];

export const COMMODITY_THRESHOLDS: readonly ThresholdPoint[] = [
  [-10, -1],
  [-5, -0.6],
  [-2, -0.25],
  [0, 0],
  [2, 0.25],
  [5, 0.6],
  [10, 1],
];

export const FX_THRESHOLDS: readonly ThresholdPoint[] = [
  [-5, -1],
  [-2.5, -0.6],
  [-1, -0.25],
  [0, 0],
  [1, 0.25],
  [2.5, 0.6],
  [5, 1],
];

export const CBS_THRESHOLDS: readonly ThresholdPoint[] = [
  [-3, -1],
  [-1.5, -0.6],
  [-0.5, -0.25],
  [0, 0],
  [0.5, 0.25],
  [1.5, 0.6],
  [3, 1],
];

export const SUPPLIER_THRESHOLDS = CBS_THRESHOLDS;

export const HORIZON_WEIGHTS = { '1m': 0.2, '3m': 0.5, '6m': 0.3 } as const;

export const TRADE_WEIGHTS: Record<
  MaterialTrade,
  Partial<Record<TradeComponentKey, number>>
> = {
  electrical: {
    copper: 0.35,
    cbs: 0.25,
    fx: 0.1,
    aluminium: 0.1,
    energy: 0.05,
    supplier: 0.15,
  },
  plumbing: {
    cbs: 0.3,
    supplier: 0.3,
    polymer: 0.2,
    energy: 0.1,
    fx: 0.1,
  },
  steel_rebar: {
    cbs: 0.35,
    scrap: 0.2,
    iron_ore: 0.15,
    steel: 0.1,
    fx: 0.1,
    energy: 0.1,
  },
};

export const FRED_SERIES = {
  COPPER_USD: 'PCOPPUSDM',
  ALUMINIUM_USD: 'PALUMUSDM',
  USD_ILS: 'CCUSMA02ILM618N',
  /** USD per 1 EUR — Fed G.5. Used with USD_ILS to derive EUR_ILS (BOI-validated). */
  EUR_USD: 'EXUSEU',
  OIL_OR_ENERGY: 'POILBREUSDM',
  IRON_ORE: 'PIORECRUSDM',
  STEEL_SCRAP: 'WPS101211',
  HRC_STEEL: 'WPS101704',
  PVC_POLYMER_PROXY: 'WPU063801',
} as const;

export const CBS_SERIES = {
  CBS_CONDUCTORS: '201340',
  CBS_PLUMBING: '201380',
  CBS_PLASTIC_PIPES: '201400',
  CBS_REBAR: '201230',
} as const;

export const SIGNAL_PROFILE_BY_COMPONENT: Record<TradeComponentKey, SignalProfile> = {
  copper: 'commodity',
  cbs: 'cbs',
  fx: 'fx',
  aluminium: 'commodity',
  energy: 'commodity',
  supplier: 'supplier',
  polymer: 'commodity',
  scrap: 'commodity',
  iron_ore: 'commodity',
  steel: 'commodity',
};

export const THRESHOLDS_BY_PROFILE: Record<SignalProfile, readonly ThresholdPoint[]> = {
  commodity: COMMODITY_THRESHOLDS,
  fx: FX_THRESHOLDS,
  cbs: CBS_THRESHOLDS,
  supplier: SUPPLIER_THRESHOLDS,
};

export const MIN_COVERAGE_FOR_DISPLAY = 0.6;
