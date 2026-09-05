import { AlertCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import type { HomeDashboardData } from '../application/get-home-dashboard';

export async function HomePendingTimeAlert({
  pendingTime,
  canApproveTime,
}: {
  pendingTime: NonNullable<HomeDashboardData['pendingTime']>;
  canApproveTime: boolean;
}) {
  const t = await getTranslations('dashboard');
  const hours = formatWorkHoursValue(pendingTime.pendingHours);
  const href = canApproveTime ? '/workforce/time/approvals' : '/workforce/time';

  return (
    <section className="min-w-0 max-w-full">
      <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--pf-status-warning-border,var(--pf-border-default))] bg-[var(--pf-status-warning-bg,transparent)] px-3 py-3">
        <p className="flex items-start gap-2 text-sm font-medium">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {t('attention.pendingTime', {
              employees: pendingTime.affectedEmployees,
              hours,
            })}
          </span>
        </p>
        <p className="text-sm">
          <Link href={href} className={textNavLinkClassName} prefetch={false}>
            {t('attention.pendingTimeLink')}
          </Link>
        </p>
      </div>
    </section>
  );
}

export async function HomeLaborReconciliation({
  laborReconciliation,
}: {
  laborReconciliation: NonNullable<HomeDashboardData['laborReconciliation']>;
}) {
  const t = await getTranslations('dashboard');
  const allocated = formatWorkHoursValue(laborReconciliation.allocatedHours);
  const unallocated = formatWorkHoursValue(laborReconciliation.unallocatedHours);
  const total = formatWorkHoursValue(laborReconciliation.totalHours);

  return (
    <section className="min-w-0 max-w-full">
      <h2 className="mb-2 text-sm font-semibold">{t('laborReconciliation.title')}</h2>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('laborReconciliation.hint')}</p>
      <dl className="mt-2 grid min-w-0 grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-md border border-[var(--pf-border-default)] px-3 py-2">
          <dt className="text-xs text-[var(--pf-text-muted)]">
            {t('laborReconciliation.allocated')}
          </dt>
          <dd className="font-medium tabular-nums" dir="ltr">
            {allocated}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--pf-border-default)] px-3 py-2">
          <dt className="text-xs text-[var(--pf-text-muted)]">
            {t('laborReconciliation.unallocated')}
          </dt>
          <dd className="font-medium tabular-nums" dir="ltr">
            {unallocated}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--pf-border-default)] px-3 py-2">
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('laborReconciliation.total')}</dt>
          <dd className="font-medium tabular-nums" dir="ltr">
            {total}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-[var(--pf-text-secondary)]">
        {t('laborReconciliation.equation', { allocated, unallocated, total })}
      </p>
    </section>
  );
}
