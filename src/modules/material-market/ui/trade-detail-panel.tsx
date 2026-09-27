'use client';

import { useEffect, useMemo, useState } from 'react';
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

  const { filteredHistory, historyDomainStart, historyDomainEnd } = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const cutoffForMonths = (months: number) => {
      const cutoff = new Date(today);
      cutoff.setMonth(cutoff.getMonth() - months);
      return cutoff.toISOString().slice(0, 10);
    };

    if (range === 'all') {
      const sorted = [...detail.history].sort((a, b) => a.date.localeCompare(b.date));
      return {
        filteredHistory: sorted,
        historyDomainStart: sorted[0]?.date,
        historyDomainEnd: todayStr,
      };
    }

    const months = Number.parseInt(range, 10);
    const cutoffStr = cutoffForMonths(months);
    return {
      filteredHistory: detail.history.filter((h) => h.date >= cutoffStr),
      historyDomainStart: cutoffStr,
      historyDomainEnd: todayStr,
    };
  }, [detail.history, range]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const today = new Date();
    const cutoff24 = new Date(today);
    cutoff24.setMonth(cutoff24.getMonth() - 24);
    const cutoff24Str = cutoff24.toISOString().slice(0, 10);
    const count24 = detail.history.filter((h) => h.date >= cutoff24Str).length;
    const countAll = detail.history.length;
    console.debug('[PressureHistoryChart] point counts', { count24, countAll, range });
    if (countAll < count24) {
      console.warn('[PressureHistoryChart] ALL point count < 24-month point count', {
        countAll,
        count24,
      });
    }
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
          <PressureHistoryChart
            data={filteredHistory}
            ariaLabel={t('historyTitle')}
            range={range}
            domainStart={historyDomainStart}
            domainEnd={historyDomainEnd}
          />
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
                {driver.code === 'localSupplier' && driver.observationMonthCount != null && (
                  <p className="text-xs text-muted-foreground">
                    {t('supplierCoverage', { months: driver.observationMonthCount })}
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
