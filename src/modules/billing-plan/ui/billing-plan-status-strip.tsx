import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { textNavLinkClassName } from '@/components/ui/pressable';
import {
  derivePercentFromAmount,
  getBillingPlanDetail,
  listBillingPlansForProject,
} from '@/modules/billing-plan';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { fromNumericString, money, zeroMoney } from '@/shared/money';
import { formatPercent } from '@/shared/money/format';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { cn } from '@/shared/ui/cn';

export interface BillingPlanStatusStripProps {
  readonly projectId: string;
}

/**
 * Lightweight billing-plan status for Project 360 / financials.
 * Renders nothing when no plan exists or the viewer lacks BILLING_READ.
 */
export async function BillingPlanStatusStrip({ projectId }: BillingPlanStatusStripProps) {
  const t = await getTranslations('billingPlan');
  const locale = await getLocale();

  const view = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.BILLING_READ)) return null;
    try {
      const plans = await listBillingPlansForProject(context, { projectId });
      const plan =
        plans.find((row) => row.status === 'active') ??
        plans.find((row) => row.status === 'draft') ??
        plans[0];
      if (!plan) return null;
      return getBillingPlanDetail(context, { planId: plan.id });
    } catch {
      // Migration 0065 / tables may be absent — skip silently.
      return null;
    }
  });

  if (!view) return null;

  const { plan, reconciliation, retentionAccumulated, retentionHeldRemaining, lines, cycles } =
    view;
  const currency = plan.currency;
  const billed = fromNumericString(reconciliation.billedTotal, currency) ?? zeroMoney(currency);
  const planned = fromNumericString(reconciliation.plannedTotal, currency) ?? zeroMoney(currency);
  const unbilled =
    fromNumericString(reconciliation.remainingPlanned, currency) ?? zeroMoney(currency);
  const billedPct = formatPercent(derivePercentFromAmount(planned, billed), locale, {
    maximumFractionDigits: 0,
  });

  const nextLine =
    lines.find((line) => {
      const progress = reconciliation.lines.find((row) => row.planLineId === line.id);
      if (!progress) return true;
      const remaining = fromNumericString(progress.remainingAmount, currency);
      return remaining != null && Number(remaining.amount) > 0;
    }) ?? null;

  const draftCycle = cycles.find((c) => c.status === 'draft' || c.status === 'ready');
  const retention =
    fromNumericString(retentionHeldRemaining, currency) ??
    fromNumericString(retentionAccumulated, currency) ??
    zeroMoney(currency);

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)]/40 px-4 py-3"
      data-testid="billing-plan-status-strip"
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <p className="min-w-0 text-start text-sm font-semibold text-[var(--pf-text-primary)]">
          {t('panel.title')} · {t(`status.${plan.status}`)}
        </p>
        <Link
          href={`/projects/${projectId}?tab=billingPlan`}
          className={cn(textNavLinkClassName, 'text-xs')}
        >
          {plan.name}
        </Link>
      </div>
      <dl className="grid min-w-0 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0 text-start">
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('strip.nextStage')}</dt>
          <dd className="truncate font-medium">{nextLine?.label ?? '—'}</dd>
        </div>
        <div className="min-w-0 text-start">
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('strip.billedPercent')}</dt>
          <dd className="font-medium" dir="ltr">
            {billedPct}
          </dd>
        </div>
        <div className="min-w-0 text-start">
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('strip.unbilled')}</dt>
          <dd className="font-medium">
            <MoneyText value={money(unbilled.amount, currency)} />
          </dd>
        </div>
        <div className="min-w-0 text-start">
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('strip.draftAccount')}</dt>
          <dd className="truncate font-medium">
            {draftCycle ? (
              <>
                {t(`cycleStatus.${draftCycle.status}`)} · {draftCycle.title}
              </>
            ) : (
              t('strip.noDraftAccount')
            )}
          </dd>
        </div>
        <div className="min-w-0 text-start">
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('fields.retention')}</dt>
          <dd className="font-medium">
            <MoneyText value={money(retention.amount, currency)} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
