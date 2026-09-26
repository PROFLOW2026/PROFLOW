import { getTranslations } from 'next-intl/server';
import { ApBillsOrgListView } from '@/modules/ap/ui/ap-bills-org-list-view';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export default async function EmployeeApPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('employeeApp.ap');
  const access = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    return {
      canRead: employeeHasPermission(context, PERMISSIONS.AP_READ),
      canManage: employeeHasPermission(context, PERMISSIONS.AP_MANAGE),
    };
  });

  return (
    <div className="space-y-4">
      {access.canRead ? (
        <nav className="flex flex-wrap gap-3 text-sm">
          <Link href="/employee/ap/aging" className="underline">
            {t('nav.aging')}
          </Link>
          <Link href="/employee/ap/credits" className="underline">
            {t('nav.credits')}
          </Link>
          {access.canManage ? (
            <Link href="/employee/ap/new" className="underline">
              {t('nav.newBill')}
            </Link>
          ) : null}
        </nav>
      ) : null}
      <ApBillsOrgListView routeBase="/employee/ap" surface="employee" searchParams={searchParams} />
    </div>
  );
}
