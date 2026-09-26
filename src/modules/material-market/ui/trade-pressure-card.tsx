import { ChevronLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { pressableCardLinkClassName } from '@/components/ui/pressable';
import type { TradeSnapshotRow } from '../domain/types';
import { componentLabelKeyForTrade } from '../domain/driver-display';

interface TradePressureCardProps {
  snapshot: TradeSnapshotRow;
  tradeLabel: string;
  directionLabel: string;
  confidenceLabel: string;
  momentumLabel: string;
  localConfirmationLabel: string;
  driverLabel: (key: string) => string;
  detailLabel: string;
  lastUpdatedLabel: string;
  scoreLabel: string;
  monthChangeLabel: string | null;
}

const directionTone: Record<string, string> = {
  strong_down: 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
  down: 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30',
  neutral: 'border-border bg-card',
  up: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
  strong_up: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
};

export function TradePressureCard({
  snapshot,
  tradeLabel,
  directionLabel,
  confidenceLabel,
  momentumLabel,
  localConfirmationLabel,
  driverLabel,
  detailLabel,
  lastUpdatedLabel,
  scoreLabel,
  monthChangeLabel,
}: TradePressureCardProps) {
  const changeFormatted =
    snapshot.pressureScore1mChange != null
      ? `${snapshot.pressureScore1mChange > 0 ? '+' : ''}${snapshot.pressureScore1mChange.toFixed(1)}`
      : null;

  return (
    <Card className={cn('flex flex-col', directionTone[snapshot.pressureDirection] ?? '')}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{tradeLabel}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">{scoreLabel}</p>
          <p className="text-3xl font-semibold tabular-nums">
            {Math.round(snapshot.pressureScore)}
            <span className="text-base font-normal text-muted-foreground"> / 100</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">{directionLabel}</Badge>
          <Badge tone="info">{confidenceLabel}</Badge>
        </div>
        <p>
          <span className="text-muted-foreground">{momentumLabel}</span>
        </p>
        {changeFormatted && monthChangeLabel && (
          <p className="text-muted-foreground">{monthChangeLabel}</p>
        )}
        <div className="space-y-1">
          {snapshot.driversUp.slice(0, 2).map((d) => (
            <p key={`up-${d}`} className="text-emerald-700 dark:text-emerald-400">
              ↑ {driverLabel(componentLabelKeyForTrade(snapshot.trade, d as never))}
            </p>
          ))}
          {snapshot.driversDown.slice(0, 2).map((d) => (
            <p key={`down-${d}`} className="text-orange-700 dark:text-orange-400">
              ↓ {driverLabel(componentLabelKeyForTrade(snapshot.trade, d as never))}
            </p>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{localConfirmationLabel}</p>
        <p className="text-xs text-muted-foreground">{lastUpdatedLabel}</p>
      </CardContent>
      <CardFooter>
        <Link
          href={`/material-market/${snapshot.trade}`}
          className={cn(pressableCardLinkClassName, 'inline-flex items-center gap-1 text-sm font-medium')}
        >
          {detailLabel}
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      </CardFooter>
    </Card>
  );
}
