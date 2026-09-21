import { getTranslations } from 'next-intl/server';
import { Receipt } from 'lucide-react';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listExpensesForOrg } from '@/modules/expenses/application/queries';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { formatMoneyDisplay } from '@/shared/money';
import { cn } from '@/shared/ui/cn';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  employeeListPanelClass,
  employeeListRowClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeExpensesPage() {
  const t = await getTranslations('employeeApp.expenses');
  const payload = await withOrgContext(async (context) => {
    if (!employeeHasPermission(context, PERMISSIONS.EXPENSES_READ)) {
      return {
        items: [],
        scope: { scopeLimited: true, scopeEmpty: true },
        canCreate: employeeHasPermission(context, PERMISSIONS.EXPENSES_CREATE),
      };
    }
    const list = await listExpensesForOrg(context, { limit: 50 });
    return {
      items: list.items,
      scope: list.scope,
      canCreate: employeeHasPermission(context, PERMISSIONS.EXPENSES_CREATE),
    };
  });

  if (payload.scope.scopeEmpty && payload.items.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Receipt}
          title={t('scopeLimited.title')}
          description={t('scopeLimited.description')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {payload.canCreate ? (
        <Button asChild size="lg" block>
          <Link href="/employee/expenses/new">{t('create')}</Link>
        </Button>
      ) : null}
      <ul className={employeeListPanelClass}>
        {payload.items.map((item) => (
          <li key={item.id} className={cn(employeeListRowClass, 'flex items-center justify-between')}>
            <span>{item.description ?? item.vendorName ?? item.id}</span>
            <span>{formatMoneyDisplay(item.netAmount ?? item.grossAmount)}</span>
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
