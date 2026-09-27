import 'server-only';
import type { DbExecutor } from '@/shared/db/types';
import type { DriverContribution, MaterialTrade, TradeDetailView, TradeComponentKey } from '../domain/types';
import { driverSignal, signalToComponentScore, type SupplierSignals } from '../domain/pressure-engine';
import { SIGNAL_PROFILE_BY_COMPONENT, TRADE_WEIGHTS } from '../domain/methodology';
import {
  loadLatestSnapshotsForTrades,
  loadSeriesByCodes,
  loadSnapshotHistory,
  loadSupplierSignalsByTrade,
} from '../data/repositories';
import { SOURCE_CODE_LABEL_KEYS } from '../domain/driver-display';

const DRIVER_CODES_BY_COMPONENT: Record<
  MaterialTrade,
  Partial<Record<TradeComponentKey, string>>
> = {
  electrical: {
    copper: 'COPPER_ILS',
    cbs: 'CBS_CONDUCTORS',
    fx: 'USD_ILS',
    aluminium: 'ALUMINIUM_USD',
    energy: 'OIL_OR_ENERGY',
  },
  plumbing: {
    cbs: 'CBS_PLUMBING_BLEND',
    polymer: 'PVC_POLYMER_PROXY',
    energy: 'OIL_OR_ENERGY',
    fx: 'USD_ILS',
  },
  steel_rebar: {
    cbs: 'CBS_REBAR',
    scrap: 'STEEL_SCRAP',
    iron_ore: 'IRON_ORE',
    steel: 'HRC_STEEL',
    fx: 'USD_ILS',
    energy: 'OIL_OR_ENERGY',
  },
  concrete: {
    cbs: 'CBS_CONCRETE_BLEND',
    energy: 'OIL_OR_ENERGY',
    fx: 'USD_ILS',
  },
};

export async function loadTradeDetail(
  db: DbExecutor,
  trade: MaterialTrade,
  historyMonths: 12 | 24 | 'all',
): Promise<TradeDetailView | null> {
  const latestMap = await loadLatestSnapshotsForTrades(db, [trade]);
  const snapshot = latestMap.get(trade);
  if (!snapshot) return null;

  const history = await loadSnapshotHistory(db, trade, historyMonths);
  const codes = Object.values(DRIVER_CODES_BY_COMPONENT[trade]).filter(Boolean) as string[];
  const [seriesMap, supplierSignals] = await Promise.all([
    loadSeriesByCodes(db, codes),
    TRADE_WEIGHTS[trade].supplier != null
      ? loadSupplierSignalsByTrade(db)
      : Promise.resolve({} as SupplierSignals),
  ]);
  const ym = snapshot.snapshotDate.slice(0, 7);

  const drivers: DriverContribution[] = [];
  for (const [component, code] of Object.entries(DRIVER_CODES_BY_COMPONENT[trade])) {
    if (!code) continue;
    const series = seriesMap[code] ?? {};
    const profile = SIGNAL_PROFILE_BY_COMPONENT[component as TradeComponentKey];
    const signal = driverSignal(series, ym, profile);
    const componentScore =
      snapshot.components[component as TradeComponentKey] ?? signalToComponentScore(signal);
    const months = Object.keys(series).sort();
    const lastObs = months.at(-1) ?? null;
    drivers.push({
      code: SOURCE_CODE_LABEL_KEYS[code] ?? code,
      signal,
      componentScore,
      trend: signal === null ? 'flat' : signal >= 0.25 ? 'up' : signal <= -0.25 ? 'down' : 'flat',
      lastObservationDate: lastObs ? `${lastObs}-01` : null,
    });
  }

  const supplierSeries = supplierSignals[trade];
  if (supplierSeries && Object.keys(supplierSeries).length > 0) {
    const supplierMonths = Object.keys(supplierSeries).sort();
    const signal = driverSignal(supplierSeries, ym, 'supplier');
    drivers.push({
      code: 'localSupplier',
      signal,
      componentScore: snapshot.components.supplier ?? signalToComponentScore(signal),
      trend: signal === null ? 'flat' : signal >= 0.25 ? 'up' : signal <= -0.25 ? 'down' : 'flat',
      lastObservationDate: supplierMonths.at(-1) ? `${supplierMonths.at(-1)}-01` : null,
      observationMonthCount: supplierMonths.length,
    });
  }

  return {
    ...snapshot,
    history,
    drivers,
    changeSummary: '',
  };
}
