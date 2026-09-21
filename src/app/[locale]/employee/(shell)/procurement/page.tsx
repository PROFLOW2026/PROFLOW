import { getTranslations } from 'next-intl/server';
import { ShoppingCart } from 'lucide-react';
import { withOrgContext } from '@/shared/auth/session';
import { listPurchaseOrdersWithCommittedForOrg } from '@/modules/procurement';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { formatMoneyDisplay, money } from '@/shared/money';
import { cn } from '@/shared/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import {
  employeeListPanelClass,
  employeeListRowClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeProcurementPage() {
  const t = await getTranslations('employeeApp.procurement');
  const payload = await withOrgContext(async (context) => {
    if (!employeeHasPermission(context, PERMISSIONS.PROCUREMENT_READ)) {
      return {
        items: [] as Awaited<ReturnType<typeof listPurchaseOrdersWithCommittedForOrg>>,
        noAccess: true,
      };
    }
    const items = await listPurchaseOrdersWithCommittedForOrg(context, undefined, { limit: 50 });
    return { items, noAccess: false };
  });

  if (payload.noAccess) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={ShoppingCart}
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
            className={cn(employeeListRowClass, 'flex items-center justify-between gap-3')}
          >
            <span className="min-w-0 truncate text-sm">
              {item.reference?.trim() || t('noReference')}
              <span className="ml-2 text-xs text-[var(--pf-text-secondary)]">{item.status}</span>
            </span>
            <span className="shrink-0 text-sm">
              {formatMoneyDisplay(money(item.committedAmount, item.currency))}
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
