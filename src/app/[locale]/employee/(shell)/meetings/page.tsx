import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { buildEmployeeMeetingListPayload } from '@/modules/employee-app/application/build-employee-meeting-list-payload';
import { EmployeeMeetingListView } from '@/modules/employee-app/ui/employee-meeting-list-view';
import { employeeListPanelClass, employeePrimaryButtonClass } from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeMeetingsPage() {
  const [t, tCommon] = await Promise.all([
    getTranslations('employeeApp.meetings'),
    getTranslations('common'),
  ]);

  const payload = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.MEETINGS_READ)) return null;
    return {
      data: await buildEmployeeMeetingListPayload(context),
      canManage: employeeHasPermission(context, PERMISSIONS.MEETINGS_MANAGE),
    };
  });

  if (!payload?.data) {
    return (
      <ul className={employeeListPanelClass}>
        <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">{t('empty')}</li>
      </ul>
    );
  }

  const { data, canManage } = payload;

  return (
    <div className="space-y-4">
      {canManage ? (
        <Link href="/employee/meetings/new" className={employeePrimaryButtonClass}>
          {tCommon('actions.create')}
        </Link>
      ) : null}
      <Suspense fallback={null}>
        <EmployeeMeetingListView
          meetings={data.meetings}
          today={data.today}
          now={data.now}
          projectOptions={data.projectOptions}
        />
      </Suspense>
    </div>
  );
}
