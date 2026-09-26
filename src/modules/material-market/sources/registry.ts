import { CBS_SERIES, FRED_SERIES } from '../domain/methodology';
import { createCbsAdapter } from './cbs-adapter';
import { createFredAdapter } from './fred-adapter';
import type { MaterialMarketSourceAdapter } from './types';

export interface SourceSeedRow {
  code: string;
  nameHe: string;
  trade: 'electrical' | 'plumbing' | 'steel_rebar' | null;
  sourceType: 'fred' | 'cbs' | 'derived';
  sourceName: string;
  sourceSeriesId: string | null;
  sourceUrl: string | null;
  frequency: string;
  unit: string | null;
  currency: string | null;
  isActive: boolean;
  isDerived: boolean;
}

/** Production-active sources only. Research-only local supplier series are not seeded. */
export const SOURCE_SEED: SourceSeedRow[] = [
  {
    code: 'COPPER_USD',
    nameHe: 'נחושת עולמית',
    trade: 'electrical',
    sourceType: 'fred',
    sourceName: 'FRED',
    sourceSeriesId: FRED_SERIES.COPPER_USD,
    sourceUrl: 'https://fred.stlouisfed.org/series/PCOPPUSDM',
    frequency: 'monthly',
    unit: 'USD/metric ton',
    currency: 'USD',
    isActive: true,
    isDerived: false,
  },
  {
    code: 'ALUMINIUM_USD',
    nameHe: 'אלומיניום',
    trade: 'electrical',
    sourceType: 'fred',
    sourceName: 'FRED',
    sourceSeriesId: FRED_SERIES.ALUMINIUM_USD,
    sourceUrl: 'https://fred.stlouisfed.org/series/PALUMUSDM',
    frequency: 'monthly',
    unit: 'USD/metric ton',
    currency: 'USD',
    isActive: true,
    isDerived: false,
  },
  {
    code: 'USD_ILS',
    nameHe: 'דולר / שקל',
    trade: null,
    sourceType: 'fred',
    sourceName: 'FRED',
    sourceSeriesId: FRED_SERIES.USD_ILS,
    sourceUrl: 'https://fred.stlouisfed.org/series/CCUSMA02ILM618N',
    frequency: 'monthly',
    unit: 'ILS per USD',
    currency: 'ILS',
    isActive: true,
    isDerived: false,
  },
  {
    code: 'OIL_OR_ENERGY',
    nameHe: 'אנרגיה / נפט',
    trade: null,
    sourceType: 'fred',
    sourceName: 'FRED',
    sourceSeriesId: FRED_SERIES.OIL_OR_ENERGY,
    sourceUrl: 'https://fred.stlouisfed.org/series/POILBREUSDM',
    frequency: 'monthly',
    unit: 'USD/barrel',
    currency: 'USD',
    isActive: true,
    isDerived: false,
  },
  {
    code: 'IRON_ORE',
    nameHe: 'עפרות ברזל',
    trade: 'steel_rebar',
    sourceType: 'fred',
    sourceName: 'FRED',
    sourceSeriesId: FRED_SERIES.IRON_ORE,
    sourceUrl: 'https://fred.stlouisfed.org/series/PIORECRUSDM',
    frequency: 'monthly',
    unit: 'index',
    currency: 'USD',
    isActive: true,
    isDerived: false,
  },
  {
    code: 'STEEL_SCRAP',
    nameHe: 'גרוטאות פלדה',
    trade: 'steel_rebar',
    sourceType: 'fred',
    sourceName: 'FRED',
    sourceSeriesId: FRED_SERIES.STEEL_SCRAP,
    sourceUrl: 'https://fred.stlouisfed.org/series/WPS101211',
    frequency: 'monthly',
    unit: 'index',
    currency: 'USD',
    isActive: true,
    isDerived: false,
  },
  {
    code: 'HRC_STEEL',
    nameHe: 'פלדה עולמית',
    trade: 'steel_rebar',
    sourceType: 'fred',
    sourceName: 'FRED',
    sourceSeriesId: FRED_SERIES.HRC_STEEL,
    sourceUrl: 'https://fred.stlouisfed.org/series/WPS101704',
    frequency: 'monthly',
    unit: 'index',
    currency: 'USD',
    isActive: true,
    isDerived: false,
  },
  {
    code: 'PVC_POLYMER_PROXY',
    nameHe: 'פולימר (פרוקסי)',
    trade: 'plumbing',
    sourceType: 'fred',
    sourceName: 'FRED',
    sourceSeriesId: FRED_SERIES.PVC_POLYMER_PROXY,
    sourceUrl: 'https://fred.stlouisfed.org/series/WPU063801',
    frequency: 'monthly',
    unit: 'index',
    currency: 'USD',
    isActive: true,
    isDerived: false,
  },
  {
    code: 'CBS_CONDUCTORS',
    nameHe: 'מדד מוליכים בישראל',
    trade: 'electrical',
    sourceType: 'cbs',
    sourceName: 'CBS',
    sourceSeriesId: CBS_SERIES.CBS_CONDUCTORS,
    sourceUrl: 'https://www.cbs.gov.il/he/publications/Pages/2016/price-index-conductors.aspx',
    frequency: 'monthly',
    unit: 'index',
    currency: 'ILS',
    isActive: true,
    isDerived: false,
  },
  {
    code: 'CBS_PLUMBING',
    nameHe: 'מדד אינסטלציה בישראל',
    trade: 'plumbing',
    sourceType: 'cbs',
    sourceName: 'CBS',
    sourceSeriesId: CBS_SERIES.CBS_PLUMBING,
    sourceUrl: 'https://api.cbs.gov.il/index/data/price?id=201380',
    frequency: 'monthly',
    unit: 'index',
    currency: 'ILS',
    isActive: true,
    isDerived: false,
  },
  {
    code: 'CBS_PLASTIC_PIPES',
    nameHe: 'מדד צינורות פластיק',
    trade: 'plumbing',
    sourceType: 'cbs',
    sourceName: 'CBS',
    sourceSeriesId: CBS_SERIES.CBS_PLASTIC_PIPES,
    sourceUrl: 'https://api.cbs.gov.il/index/data/price?id=201400',
    frequency: 'monthly',
    unit: 'index',
    currency: 'ILS',
    isActive: true,
    isDerived: false,
  },
  {
    code: 'CBS_REBAR',
    nameHe: 'מדד ברזל זיון בישראל',
    trade: 'steel_rebar',
    sourceType: 'cbs',
    sourceName: 'CBS',
    sourceSeriesId: CBS_SERIES.CBS_REBAR,
    sourceUrl: 'https://api.cbs.gov.il/index/data/price?id=201230',
    frequency: 'monthly',
    unit: 'index',
    currency: 'ILS',
    isActive: true,
    isDerived: false,
  },
  {
    code: 'COPPER_ILS',
    nameHe: 'נחושת בשקלים',
    trade: 'electrical',
    sourceType: 'derived',
    sourceName: 'ProjectFlow',
    sourceSeriesId: null,
    sourceUrl: null,
    frequency: 'monthly',
    unit: 'ILS/metric ton',
    currency: 'ILS',
    isActive: true,
    isDerived: true,
  },
  {
    code: 'CBS_PLUMBING_BLEND',
    nameHe: 'מדד אינסטלציה בישראל (משולב)',
    trade: 'plumbing',
    sourceType: 'derived',
    sourceName: 'ProjectFlow',
    sourceSeriesId: null,
    sourceUrl: null,
    frequency: 'monthly',
    unit: 'index',
    currency: 'ILS',
    isActive: true,
    isDerived: true,
  },
];

export const ACTIVE_SOURCE_CODES = new Set(SOURCE_SEED.filter((s) => s.isActive).map((s) => s.code));

export function createFetchAdapters(): MaterialMarketSourceAdapter[] {
  const adapters: MaterialMarketSourceAdapter[] = [];
  for (const row of SOURCE_SEED) {
    if (!row.isActive || row.isDerived) continue;
    if (row.sourceType === 'fred' && row.sourceSeriesId) {
      adapters.push(createFredAdapter(row.code, row.sourceSeriesId));
    } else if (row.sourceType === 'cbs' && row.sourceSeriesId) {
      adapters.push(createCbsAdapter(row.code, row.sourceSeriesId));
    }
  }
  return adapters;
}
