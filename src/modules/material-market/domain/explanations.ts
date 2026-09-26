import type { MaterialTrade, PressureDirection, PressureMomentum, TradeComponentKey } from './types';
import { componentLabelKeyForTrade } from './driver-display';

interface ExplanationInput {
  trade: MaterialTrade;
  direction: PressureDirection;
  momentum: PressureMomentum;
  score1mChange: number | null;
  driversUp: TradeComponentKey[];
  driversDown: TradeComponentKey[];
  t: (key: string, values?: Record<string, string | number>) => string;
}

export function buildChangeSummary(input: ExplanationInput): string {
  const { trade, direction, momentum, score1mChange, driversUp, driversDown, t } = input;
  const tradeLabel = t(`trades.${trade}`);

  const momentumPart =
    momentum === 'rising_fast' || momentum === 'rising'
      ? t('explanation.strengthened')
      : momentum === 'falling_fast' || momentum === 'falling'
        ? t('explanation.weakened')
        : t('explanation.stable');

  const directionPart =
    direction === 'neutral'
      ? t('explanation.remainedNeutral')
      : direction === 'up' || direction === 'strong_up'
        ? t('explanation.upward')
        : t('explanation.downward');

  let intro: string;
  if (score1mChange !== null && Math.abs(score1mChange) >= 4) {
    intro = t('explanation.introChanged', { trade: tradeLabel, momentum: momentumPart });
  } else if (direction === 'neutral') {
    intro = t('explanation.introNeutral', { trade: tradeLabel });
  } else {
    intro = t('explanation.introDirection', { trade: tradeLabel, direction: directionPart });
  }

  const upNames = driversUp.slice(0, 2).map((d) => t(`drivers.${componentLabelKeyForTrade(trade, d)}`));
  const downNames = driversDown.slice(0, 2).map((d) => t(`drivers.${componentLabelKeyForTrade(trade, d)}`));

  if (upNames.length > 0 && downNames.length > 0) {
    return `${intro} ${t('explanation.offset', { up: upNames.join(', '), down: downNames.join(', ') })}`;
  }
  if (upNames.length > 0) {
    return `${intro} ${t('explanation.mainUp', { drivers: upNames.join(', ') })}`;
  }
  if (downNames.length > 0) {
    return `${intro} ${t('explanation.mainDown', { drivers: downNames.join(', ') })}`;
  }
  return intro;
}
