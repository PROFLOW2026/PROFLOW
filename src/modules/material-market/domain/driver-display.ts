import type { TradeComponentKey } from './types';

/** Internal source codes → i18n key suffix under materialMarket.drivers */
export const SOURCE_CODE_LABEL_KEYS: Record<string, string> = {
  COPPER_ILS: 'copperIls',
  COPPER_USD: 'copperUsd',
  USD_ILS: 'usdIls',
  ALUMINIUM_USD: 'aluminium',
  OIL_OR_ENERGY: 'energy',
  CBS_CONDUCTORS: 'cbsElectrical',
  CBS_PLUMBING: 'cbsPlumbing',
  CBS_PLASTIC_PIPES: 'cbsPlasticPipes',
  CBS_PLUMBING_BLEND: 'cbsPlumbing',
  CBS_REBAR: 'cbsSteelRebar',
  STEEL_SCRAP: 'scrap',
  IRON_ORE: 'ironOre',
  HRC_STEEL: 'hrc',
  PVC_POLYMER_PROXY: 'polymer',
};

export const COMPONENT_LABEL_KEYS: Record<TradeComponentKey, string> = {
  copper: 'copperIls',
  cbs: 'cbsElectrical',
  fx: 'usdIls',
  aluminium: 'aluminium',
  energy: 'energy',
  supplier: 'localSupplier',
  polymer: 'polymer',
  scrap: 'scrap',
  iron_ore: 'ironOre',
  steel: 'hrc',
};

export function componentLabelKeyForTrade(
  trade: 'electrical' | 'plumbing' | 'steel_rebar',
  component: TradeComponentKey,
): string {
  if (trade === 'plumbing' && component === 'cbs') return 'cbsPlumbing';
  if (trade === 'steel_rebar' && component === 'cbs') return 'cbsSteelRebar';
  return COMPONENT_LABEL_KEYS[component];
}
