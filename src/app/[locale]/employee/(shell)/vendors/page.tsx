import { getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listVendorsForOrg } from '@/modules/vendors';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { cn } from '@/shared/ui/cn';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  employeeListPanelClass,
  employeeListRowClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeVendorsPage() {
  const t = await getTranslations('employeeApp.vendors');
  const payload = await withOrgContext(async (context) => {
    const canManage = employeeHasPermission(context, PERMISSIONS.VENDORS_MANAGE);
    if (!employeeHasPermission(context, PERMISSIONS.VENDORS_READ)) {
      return { items: [] as Awaited<ReturnType<typeof listVendorsForOrg>>, canManage, noAccess: true };
    }
    const items = await listVendorsForOrg(context, { status: 'active', limit: 50 });
    return { items, canManage, noAccess: false };
  });

  if (payload.noAccess) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Building2}
          title={t('noAccess.title')}
          description={t('noAccess.description')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {payload.canManage ? (
        <Button asChild size="lg" block>
          <Link href="/employee/vendors/new">{t('create')}</Link>
        </Button>
      ) : null}
      <ul className={employeeListPanelClass}>
        {payload.items.map((item) => (
          <li
            key={item.id}
            className={cn(employeeListRowClass, 'flex items-center justify-between gap-3')}
          >
            <span className="text-sm font-medium">{item.name}</span>
            <span className="text-xs text-[var(--pf-text-secondary)]">{item.type}</span>
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
