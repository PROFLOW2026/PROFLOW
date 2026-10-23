import type { ReactNode } from 'react';
import { BillingNetPrimaryDisplay } from '@/components/patterns/billing-net-primary-display';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { mergeDashboardDetailNotes, type DashboardKpiDetailContent } from '../domain/dashboard-kpi-detail';
import { DashboardKpiDetailTrigger } from './dashboard-kpi-detail-trigger';
import type { mapDashboardKpiDetailTriggerCopy } from './dashboard-kpi-detail-copy';

export interface DashboardKpiCardProps {
  readonly title: string;
  readonly money?: { amount: string; currency: string };
  readonly grossMoney?: { amount: string; currency: string };
  readonly netLabel?: string;
  readonly grossLabel?: string;
  readonly value?: string;
  readonly hint?: string;
  readonly footer?: ReactNode;
  readonly detail?: DashboardKpiDetailContent;
  readonly detailCopy?: ReturnType<typeof mapDashboardKpiDetailTriggerCopy>;
  readonly unavailable?: boolean;
  readonly unavailableLabel?: string;
  readonly unavailableHint?: string;
  /** Explanatory notes. They open from «פירוט» and stay off the card face. */
  readonly detailNotes?: readonly string[];
  readonly colorizeResult?: boolean;
}

/** Shared dashboard KPI card chrome — header separator, typography, and detail trigger placement. */
export function DashboardKpiCard({
  title,
  money,
  grossMoney,
  netLabel,
  grossLabel,
  value,
  hint,
  footer,
  detail,
  detailCopy,
  unavailable,
  unavailableLabel,
  unavailableHint,
  detailNotes,
  colorizeResult = false,
}: DashboardKpiCardProps) {
  const resolvedDetail = mergeDashboardDetailNotes(detail, title, [
    hint,
    unavailable ? unavailableHint : undefined,
    ...(detailNotes ?? []),
  ]);
  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader className="pb-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <CardTitle className="break-words text-xs font-medium text-[var(--pf-text-secondary)]">
            {title}
          </CardTitle>
          {resolvedDetail && detailCopy ? (
            <DashboardKpiDetailTrigger detail={resolvedDetail} copy={detailCopy} />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-1">
        {unavailable ? (
          <>
            <span className="text-lg font-semibold text-[var(--pf-status-warning-fg,var(--pf-text-primary))]">
              {unavailableLabel}
            </span>
          </>
        ) : money && grossMoney && grossLabel ? (
          <BillingNetPrimaryDisplay
            netAmount={money}
            grossAmount={grossMoney}
            netLabel={netLabel}
            grossLabel={grossLabel}
            netClassName="text-lg"
            colorizeResult={colorizeResult}
          />
        ) : money ? (
          <div className="min-w-0 max-w-full overflow-x-auto">
            <MoneyText value={money} className="text-lg font-semibold" colorizeResult={colorizeResult} />
          </div>
        ) : (
          <span className="text-lg font-semibold">{value ?? '—'}</span>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}
