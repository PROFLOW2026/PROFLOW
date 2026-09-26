import type { DbExecutor } from '@/shared/db/types';
import {
  buildCopperIls,
  blendCbsPlumbing,
  computeAllTradeSnapshots,
  type DriverSeriesMap,
} from '../domain/pressure-engine';
import { finalizeCompleteSnapshots } from '../domain/complete-snapshot';
import type { TradeSnapshotRow } from '../domain/types';
import { loadSeriesByCodes } from '../data/repositories';

const BASE_CODES = [
  'COPPER_USD',
  'ALUMINIUM_USD',
  'USD_ILS',
  'OIL_OR_ENERGY',
  'IRON_ORE',
  'STEEL_SCRAP',
  'HRC_STEEL',
  'PVC_POLYMER_PROXY',
  'CBS_CONDUCTORS',
  'CBS_PLUMBING',
  'CBS_PLASTIC_PIPES',
  'CBS_REBAR',
] as const;

export async function buildDriverMapFromDb(db: DbExecutor): Promise<DriverSeriesMap> {
  const raw = await loadSeriesByCodes(db, [...BASE_CODES]);
  const copperIls = buildCopperIls(raw.COPPER_USD ?? {}, raw.USD_ILS ?? {});
  const plumbingBlend = blendCbsPlumbing(raw.CBS_PLUMBING ?? {}, raw.CBS_PLASTIC_PIPES ?? {});

  return {
    COPPER_ILS: copperIls,
    CBS_CONDUCTORS: raw.CBS_CONDUCTORS ?? {},
    USD_ILS: raw.USD_ILS ?? {},
    ALUMINIUM_USD: raw.ALUMINIUM_USD ?? {},
    OIL_OR_ENERGY: raw.OIL_OR_ENERGY ?? {},
    CBS_PLUMBING_BLEND: plumbingBlend,
    PVC_POLYMER_PROXY: raw.PVC_POLYMER_PROXY ?? {},
    CBS_REBAR: raw.CBS_REBAR ?? {},
    STEEL_SCRAP: raw.STEEL_SCRAP ?? {},
    IRON_ORE: raw.IRON_ORE ?? {},
    HRC_STEEL: raw.HRC_STEEL ?? {},
  };
}

export async function computeSnapshotsFromDb(db: DbExecutor): Promise<TradeSnapshotRow[]> {
  const drivers = await buildDriverMapFromDb(db);
  const raw = computeAllTradeSnapshots(drivers);
  return finalizeCompleteSnapshots(raw);
}
