import { getTranslations } from 'next-intl/server';
import { ScrollText } from 'lucide-react';
import { withOrgContext } from '@/shared/auth/session';
import { listOrgContracts } from '@/modules/projects';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { formatMoneyDisplay, money } from '@/shared/money';
import { cn } from '@/shared/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import {
  employeeListPanelClass,
  employeeListRowClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeContractsPage() {
  const t = await getTranslations('employeeApp.contracts');
  const payload = await withOrgContext(async (context) => {
    if (!employeeHasPermission(context, PERMISSIONS.CONTRACTS_READ)) {
      return { items: [] as Awaited<ReturnType<typeof listOrgContracts>>, noAccess: true };
    }
    const items = await listOrgContracts(context, { limit: 50 });
    return { items, noAccess: false };
  });

  if (payload.noAccess) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={ScrollText}
          title={t('noAccess.title')}
          description={t('noAccess.description')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className={employeeListPanelClass}>
        {payload.items.map((item) => (
          <li
            key={item.id}
            className={cn(employeeListRowClass, 'flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between')}
          >
            <span className="min-w-0 truncate text-sm font-medium">
              {item.name ?? item.contractNumber ?? item.projectName}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-sm text-[var(--pf-text-secondary)]">
              <span>{item.clientName ?? item.projectName}</span>
              <span>
                {item.currentAmount
                  ? formatMoneyDisplay(money(item.currentAmount, item.currency))
                  : item.status}
              </span>
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
