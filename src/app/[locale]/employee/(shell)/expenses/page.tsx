import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAccessibleExpenses } from '@/modules/employee-app/application/employee-operational';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { formatMoneyDisplay } from '@/shared/money';
import { Button } from '@/components/ui/button';

export default async function EmployeeExpensesPage() {
  const t = await getTranslations('employeeApp.expenses');
  const payload = await withOrgContext(async (context) => ({
    items: await listEmployeeAccessibleExpenses(context),
    canCreate: employeeHasPermission(context, PERMISSIONS.EXPENSES_CREATE),
  }));

  return (
    <div className="space-y-4">
      {payload.canCreate ? (
        <Button asChild size="lg" block>
          <Link href="/employee/expenses/new">{t('create')}</Link>
        </Button>
      ) : null}
      <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
        {payload.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
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
