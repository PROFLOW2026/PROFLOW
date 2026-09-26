'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TradeDetailView } from '../domain/types';
import { buildChangeSummary } from '../domain/explanations';
import { PressureHistoryChart } from './pressure-history-chart';

interface TradeDetailPanelProps {
  detail: TradeDetailView;
}

type HistoryRange = '12' | '24' | 'all';

export function TradeDetailPanel({ detail }: TradeDetailPanelProps) {
  const t = useTranslations('materialMarket');
  const [range, setRange] = useState<HistoryRange>('12');

  const filteredHistory = useMemo(() => {
    if (range === 'all') return detail.history;
    const months = Number.parseInt(range, 10);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return detail.history.filter((h) => h.date >= cutoffStr);
  }, [detail.history, range]);

  const changeSummary = buildChangeSummary({
    trade: detail.trade,
    direction: detail.pressureDirection,
    momentum: detail.pressureMomentum,
    score1mChange: detail.pressureScore1mChange,
    driversUp: detail.driversUp as never[],
    driversDown: detail.driversDown as never[],
    t,
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t(`trades.${detail.trade}`)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-xs text-muted-foreground">{t('scoreLabel')}</p>
              <p className="text-4xl font-semibold tabular-nums">
                {Math.round(detail.pressureScore)}
                <span className="text-lg font-normal text-muted-foreground"> / 100</span>
              </p>
            </div>
            <Badge tone="neutral">{t(`direction.${detail.pressureDirection}`)}</Badge>
            <Badge tone="info">{t(`confidence.${detail.confidence}`)}</Badge>
            <Badge tone="neutral">{t(`momentum.${detail.pressureMomentum}`)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{t(`localConfirmation.${detail.localConfirmation}`)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t('historyTitle')}</CardTitle>
          <div className="flex flex-wrap gap-2">
            {(['12', '24', 'all'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={`rounded-md border px-3 py-1 text-sm ${
                  range === key ? 'border-primary bg-primary/10' : 'border-border'
                }`}
              >
                {t(`historyRange.${key}`)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <PressureHistoryChart data={filteredHistory} ariaLabel={t('historyTitle')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('driversTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {detail.drivers.map((driver) => (
            <div
              key={driver.code}
              className="flex flex-col gap-1 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{t(`drivers.${driver.code}`)}</p>
                {driver.lastObservationDate && (
                  <p className="text-xs text-muted-foreground">
                    {t('lastUpdated', { date: driver.lastObservationDate.slice(0, 7) })}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge tone="neutral">
                  {driver.trend === 'up'
                    ? t('trend.up')
                    : driver.trend === 'down'
                      ? t('trend.down')
                      : t('trend.flat')}
                </Badge>
                {driver.componentScore != null && (
                  <span className="tabular-nums text-muted-foreground">
                    {t('driverImpact', { score: Math.round(driver.componentScore) })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('changeTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{changeSummary}</p>
        </CardContent>
      </Card>

      <details className="rounded-lg border border-border px-4 py-2">
        <summary className="cursor-pointer text-sm font-medium">{t('methodologyTitle')}</summary>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>{t('methodologyBody')}</p>
          <p>{t('methodologyDisclaimer')}</p>
        </div>
      </details>
    </div>
  );
}
