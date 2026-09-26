export const MATERIAL_TRADES = ['electrical', 'plumbing', 'steel_rebar'] as const;
export type MaterialTrade = (typeof MATERIAL_TRADES)[number];

export const PRESSURE_DIRECTIONS = [
  'strong_down',
  'down',
  'neutral',
  'up',
  'strong_up',
] as const;
export type PressureDirection = (typeof PRESSURE_DIRECTIONS)[number];

export const PRESSURE_CONFIDENCE = ['low', 'medium', 'high'] as const;
export type PressureConfidence = (typeof PRESSURE_CONFIDENCE)[number];

export const PRESSURE_MOMENTUM = [
  'rising_fast',
  'rising',
  'stable',
  'falling',
  'falling_fast',
] as const;
export type PressureMomentum = (typeof PRESSURE_MOMENTUM)[number];

export const LOCAL_CONFIRMATION = [
  'confirmed_up',
  'confirmed_down',
  'not_confirmed',
  'no_local_data',
] as const;
export type LocalConfirmation = (typeof LOCAL_CONFIRMATION)[number];

export type SignalProfile = 'commodity' | 'fx' | 'cbs' | 'supplier';

/** Monthly series keyed by YYYY-MM. */
export type MonthlySeries = Record<string, number>;

export const METHODOLOGY_VERSION = 'V1';
export const HISTORY_START = '2016-01';

export type TradeComponentKey =
  | 'copper'
  | 'cbs'
  | 'fx'
  | 'aluminium'
  | 'energy'
  | 'supplier'
  | 'polymer'
  | 'scrap'
  | 'iron_ore'
  | 'steel';

export interface TradeSnapshotRow {
  trade: MaterialTrade;
  snapshotDate: string;
  pressureScore: number;
  pressureDirection: PressureDirection;
  confidence: PressureConfidence;
  pressureScore1mChange: number | null;
  pressureScore3mChange: number | null;
  pressureMomentum: PressureMomentum;
  localConfirmation: LocalConfirmation;
  weightedDataCoverage: number;
  components: Partial<Record<TradeComponentKey, number | null>>;
  driversUp: string[];
  driversDown: string[];
  methodologyVersion: string;
}

export interface DriverContribution {
  code: string;
  signal: number | null;
  componentScore: number | null;
  trend: 'up' | 'down' | 'flat';
  lastObservationDate: string | null;
}

export interface TradeDetailView extends TradeSnapshotRow {
  history: Array<{ date: string; score: number }>;
  drivers: DriverContribution[];
  changeSummary: string;
}

export interface DashboardCard extends TradeSnapshotRow {
  tradeLabelKey: MaterialTrade;
}
