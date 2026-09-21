import { getTranslations } from 'next-intl/server';
import { FileText } from 'lucide-react';
import { withOrgContext } from '@/shared/auth/session';
import { listApBillsForOrg } from '@/modules/ap';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { formatMoneyDisplay, money } from '@/shared/money';
import { cn } from '@/shared/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import {
  employeeListPanelClass,
  employeeListRowClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeApPage() {
  const t = await getTranslations('employeeApp.ap');
  const payload = await withOrgContext(async (context) => {
    if (!employeeHasPermission(context, PERMISSIONS.AP_READ)) {
      return { items: [] as Awaited<ReturnType<typeof listApBillsForOrg>>, noAccess: true };
    }
    const items = await listApBillsForOrg(context, { limit: 50 });
    return { items, noAccess: false };
  });

  if (payload.noAccess) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={FileText}
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
              {item.vendorName ?? item.reference ?? item.id.slice(0, 8)}
            </span>
            <span className="shrink-0 text-sm">
              {formatMoneyDisplay(money(item.totalAmount, item.currency))}
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
