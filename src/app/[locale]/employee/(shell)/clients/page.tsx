import { getTranslations } from 'next-intl/server';
import { Users } from 'lucide-react';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listClientsForOrg } from '@/modules/clients';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { cn } from '@/shared/ui/cn';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  employeeListPanelClass,
  employeeListRowClass,
  employeeListRowLinkClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeClientsPage() {
  const t = await getTranslations('employeeApp.clients');
  const payload = await withOrgContext(async (context) => {
    const canManage = employeeHasPermission(context, PERMISSIONS.CLIENTS_MANAGE);
    if (!employeeHasPermission(context, PERMISSIONS.CLIENTS_READ)) {
      return { items: [] as Awaited<ReturnType<typeof listClientsForOrg>>, canManage, noAccess: true };
    }
    const items = await listClientsForOrg(context, { status: 'active', limit: 50 });
    return { items, canManage, noAccess: false };
  });

  if (payload.noAccess) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Users}
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
          <Link href="/employee/clients/new">{t('create')}</Link>
        </Button>
      ) : null}
      <ul className={employeeListPanelClass}>
        {payload.items.map((item) => (
          <li key={item.id}>
            <Link href={`/employee/clients/${item.id}`} className={employeeListRowLinkClass}>
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{item.name}</span>
                <span className="text-xs text-[var(--pf-text-secondary)]">{item.status}</span>
              </span>
            </Link>
          </li>
        ))}
        {payload.items.length === 0 ? (
          <li className={cn(employeeListRowClass, 'text-center text-sm text-[var(--pf-text-secondary)]')}>
            {t('empty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
