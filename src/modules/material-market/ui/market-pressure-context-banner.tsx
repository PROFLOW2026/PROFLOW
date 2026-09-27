import { AlertTriangle, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/shared/ui/cn';
import type { TradeSnapshotRow } from '../domain/types';
import type { MaterialTrade } from '../domain/types';

interface MarketPressureContextBannerProps {
  snapshots: TradeSnapshotRow[];
  /** Optional: only show trades relevant to this procurement context */
  trades?: MaterialTrade[];
  title: string;
  tradeLabels: Record<MaterialTrade, string>;
  pressureLabels: { low: string; medium: string; high: string };
  disclaimerText: string;
}

function pressureColor(score: number): string {
  if (score >= 70) return 'text-red-700 dark:text-red-400';
  if (score >= 40) return 'text-amber-700 dark:text-amber-400';
  return 'text-emerald-700 dark:text-emerald-400';
}

function pressureBg(score: number): string {
  if (score >= 70) return 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20';
  if (score >= 40) return 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20';
  return 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20';
}

function pressureLabel(
  score: number,
  labels: { low: string; medium: string; high: string },
): string {
  if (score >= 70) return labels.high;
  if (score >= 40) return labels.medium;
  return labels.low;
}

function PressureIcon({ score }: { score: number }) {
  if (score >= 70) return <TrendingUp className="size-3.5 shrink-0" aria-hidden />;
  if (score <= 30) return <TrendingDown className="size-3.5 shrink-0" aria-hidden />;
  return <Minus className="size-3.5 shrink-0" aria-hidden />;
}

/**
 * Market pressure context banner for procurement screens.
 *
 * Shows current material market pressure scores alongside procurement lists
 * so users can make informed purchasing decisions.
 */
export function MarketPressureContextBanner({
  snapshots,
  trades,
  title,
  tradeLabels,
  pressureLabels,
  disclaimerText,
}: MarketPressureContextBannerProps) {
  const visible = trades
    ? snapshots.filter((s) => trades.includes(s.trade as MaterialTrade))
    : snapshots;

  if (visible.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <span className="text-xs font-medium text-[var(--pf-text-secondary)]">{title}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {visible.map((snap) => {
          const score = Math.round(snap.pressureScore);
          return (
            <div
              key={snap.trade}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs',
                pressureBg(score),
              )}
            >
              <PressureIcon score={score} />
              <span className="font-medium text-[var(--pf-text-primary)]">
                {tradeLabels[snap.trade as MaterialTrade] ?? snap.trade}
              </span>
              <span className={cn('font-semibold tabular-nums', pressureColor(score))}>
                {score}
                <span className="font-normal opacity-70">/100</span>
              </span>
              <span className={cn('opacity-80', pressureColor(score))}>
                · {pressureLabel(score, pressureLabels)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-[var(--pf-text-muted)] opacity-80">
        {disclaimerText}
      </p>
    </div>
  );
}
