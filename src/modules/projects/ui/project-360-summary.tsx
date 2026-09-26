import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { withOrgContext } from '@/shared/auth/session';
import { businessDate, formatBusinessDate, isBusinessDate } from '@/shared/dates';
import type { MoneyValue } from '@/shared/money';
import { NotFoundError } from '@/shared/errors';
import { MarginTrendList } from '@/modules/budgets/ui/margin-trend-list';
import {
  getProject360Summary,
  type Project360Summary as Project360SummaryData,
} from '@/modules/projects/application/get-project-360-summary';

export function Project360SummaryFallback() {
  return (
    <div
      className="min-h-24 animate-pulse rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)]"
      aria-hidden
    />
  );
}

/**
 * Project 360 header. Renders composed financials and task progress.
 * Does not add commitments into ETC or recompute profit.
 */
export async function Project360Summary({ projectId }: { projectId: string }) {
  let summary: Project360SummaryData | null = null;
  try {
    summary = await withOrgContext((context) => getProject360Summary(context, projectId));
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }

  const [t, trend, locale] = await Promise.all([
    getTranslations('projects.workspace.summary360'),
    getTranslations('budgets.trend'),
    getLocale(),
  ]);

  const money = summary.money;
  const work = summary.work;
  const milestoneDate =
    work.nextMilestone?.targetDate && isBusinessDate(work.nextMilestone.targetDate)
      ? formatBusinessDate(businessDate(work.nextMilestone.targetDate), locale, 'medium')
      : null;

  return (
    <section
      aria-label={t('title')}
      className="grid min-w-0 gap-4 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {money?.commercial ? (
        <Group title={t('commercial')}>
          <MoneyMetric label={t('currentContractValue')} value={money.commercial.currentContractValue} />
          <MoneyMetric label={t('approvedAdditions')} value={money.commercial.approvedAdditions} />
          <MoneyMetric label={t('approvedReductions')} value={money.commercial.approvedReductions} />
          <MoneyMetric
            label={t('pendingChanges')}
            value={money.commercial.pendingChanges}
            hint={t('pendingNotInContract')}
          />
        </Group>
      ) : null}

      {money?.billing ? (
        <Group title={t('billing')}>
          <MoneyMetric label={t('billed')} value={money.billing.billed} />
          <MoneyMetric
            label={t('remainingToBill')}
            value={money.billing.remainingToBill}
            emptyLabel={t('unavailable')}
          />
          <MoneyMetric label={t('collected')} value={money.billing.collected} />
          <MoneyMetric label={t('outstanding')} value={money.billing.outstanding} />
        </Group>
      ) : null}

      {money ? (
        <Group title={t('cost')}>
          <MoneyMetric label={t('actual')} value={money.cost.actual} />
          <MoneyMetric label={t('openCommitments')} value={money.cost.openCommitments} />
          <MoneyMetric label={t('expectedRemaining')} value={money.cost.expectedRemainingCost} />
          <MoneyMetric label={t('forecastFinal')} value={money.cost.forecastFinalCost} />
        </Group>
      ) : null}

      {money?.profit ? (
        <Group title={t('profit')}>
          <MoneyMetric label={t('actualProfit')} value={money.profit.actualProfit} colorizeNegative />
          <MoneyMetric label={t('forecastProfit')} value={money.profit.forecastProfit} colorizeNegative />
          <TextMetric
            label={t('margin')}
            value={money.profit.marginPercent != null ? `${money.profit.marginPercent}%` : t('unavailable')}
          />
        </Group>
      ) : money?.priceNotSet ? (
        <Group title={t('profit')}>
          <TextMetric label={t('profit')} value={t('priceNotSet')} />
        </Group>
      ) : null}

      {summary.marginTrend.length > 0 ? (
        <div className="min-w-0 md:col-span-2 xl:col-span-3">
          <MarginTrendList
            rows={summary.marginTrend}
            labels={{
              title: trend('title'),
              hint: trend('hint'),
              month: trend('month'),
              actualMargin: trend('actualMargin'),
              forecastMargin: trend('forecastMargin'),
              actualCost: trend('actualCost'),
              forecastCost: trend('forecastCost'),
              contractValue: trend('contractValue'),
              unavailable: trend('unavailable'),
            }}
          />
        </div>
      ) : null}

      <Group title={t('work')}>
        <TextMetric
          label={t('progress')}
          value={work.progressPercent != null ? `${work.progressPercent}%` : t('unavailable')}
        />
        {work.overdueTaskCount != null ? (
          <TextMetric label={t('overdueTasks')} value={String(work.overdueTaskCount)} />
        ) : null}
        {work.blockedTaskCount != null ? (
          <TextMetric label={t('blockedTasks')} value={String(work.blockedTaskCount)} />
        ) : null}
        <TextMetric
          label={t('nextMilestone')}
          value={
            work.nextMilestone
              ? milestoneDate
                ? `${work.nextMilestone.name} · ${milestoneDate}`
                : work.nextMilestone.name
              : t('noNextMilestone')
          }
        />
      </Group>
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
        {title}
      </h2>
      <dl className="flex flex-col gap-2">{children}</dl>
    </div>
  );
}

function MoneyMetric({
  label,
  value,
  hint,
  emptyLabel,
  colorizeNegative = false,
}: {
  label: string;
  value: MoneyValue | null;
  hint?: string;
  emptyLabel?: string;
  colorizeNegative?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--pf-text-muted)]">{label}</dt>
      <dd className="min-w-0 max-w-full overflow-x-auto text-sm font-semibold">
        {value ? (
          <MoneyText value={value} colorizeNegative={colorizeNegative} />
        ) : (
          <span className="font-normal text-[var(--pf-text-muted)]">{emptyLabel ?? '—'}</span>
        )}
      </dd>
      {hint ? <p className="text-xs text-[var(--pf-text-muted)]">{hint}</p> : null}
    </div>
  );
}

function TextMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--pf-text-muted)]">{label}</dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  );
}
