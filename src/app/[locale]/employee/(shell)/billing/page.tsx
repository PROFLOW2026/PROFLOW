import { getTranslations } from 'next-intl/server';
import { Wallet } from 'lucide-react';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import {
  listBillingRecords,
  getOrganizationReceivablesSummary,
} from '@/modules/billing';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { formatMoneyDisplay } from '@/shared/money';
import { cn } from '@/shared/ui/cn';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  employeeListPanelClass,
  employeeListRowClass,
  employeePageStackClass,
  employeeStatCardClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeBillingPage() {
  const t = await getTranslations('employeeApp.billing');
  const payload = await withOrgContext(async (context) => {
    const canManage = employeeHasPermission(context, PERMISSIONS.BILLING_MANAGE);
    if (!employeeHasPermission(context, PERMISSIONS.BILLING_READ)) {
      return {
        items: [] as Awaited<ReturnType<typeof listBillingRecords>>,
        summary: null,
        canManage,
        noAccess: true,
      };
    }
    const [items, summary] = await Promise.all([
      listBillingRecords(context, { filter: 'all', limit: 50 }),
      getOrganizationReceivablesSummary(context),
    ]);
    return { items, summary, canManage, noAccess: false };
  });

  if (payload.noAccess) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Wallet}
          title={t('noAccess.title')}
          description={t('noAccess.description')}
        />
      </div>
    );
  }

  return (
    <div className={employeePageStackClass}>
      {payload.canManage ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild size="lg" block>
            <Link href="/employee/billing/new">{t('create')}</Link>
          </Button>
          <Button asChild size="lg" block variant="secondary">
            <Link href="/employee/billing/payments/new">{t('recordPayment')}</Link>
          </Button>
        </div>
      ) : null}

      {payload.summary ? (
        <dl className="grid grid-cols-2 gap-3">
          <div className={employeeStatCardClass}>
            <dt className="text-xs font-medium text-[var(--pf-text-secondary)]">
              {t('summary.outstanding')}
            </dt>
            <dd className="mt-1 text-lg font-bold text-[var(--pf-text-primary)]">
              {formatMoneyDisplay(payload.summary.totalOutstanding)}
            </dd>
          </div>
          <div className={employeeStatCardClass}>
            <dt className="text-xs font-medium text-[var(--pf-text-secondary)]">
              {t('summary.overdue')}
            </dt>
            <dd className="mt-1 text-lg font-bold text-[var(--pf-text-primary)]">
              {formatMoneyDisplay(payload.summary.overdueTotal)}
            </dd>
          </div>
        </dl>
      ) : null}

      <ul className={employeeListPanelClass}>
        {payload.items.map((item) => (
          <li
            key={item.id}
            className={cn(employeeListRowClass, 'flex items-center justify-between gap-3')}
          >
            <span className="min-w-0 truncate text-sm">
              {item.reference ?? item.projectName ?? item.id.slice(0, 8)}
            </span>
            <span className="shrink-0 text-sm">
              {formatMoneyDisplay(item.outstandingAmount)}
            </span>
          </li>
        ))}
        {payload.items.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
            {t('empty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
