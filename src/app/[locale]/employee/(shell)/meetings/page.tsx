import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { buildEmployeeMeetingListPayload } from '@/modules/employee-app/application/build-employee-meeting-list-payload';
import { EmployeeMeetingListView } from '@/modules/employee-app/ui/employee-meeting-list-view';
import { employeeListPanelClass } from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeMeetingsPage() {
  const t = await getTranslations('employeeApp.meetings');

  const payload = await withOrgContext(async (context) => {
    if (!employeeHasPermission(context, PERMISSIONS.MEETINGS_READ)) return null;
    return buildEmployeeMeetingListPayload(context);
  });

  if (!payload) {
    return (
      <ul className={employeeListPanelClass}>
        <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">{t('empty')}</li>
      </ul>
    );
  }

  return (
    <Suspense fallback={null}>
      <EmployeeMeetingListView
        meetings={payload.meetings}
        today={payload.today}
        now={payload.now}
        projectOptions={payload.projectOptions}
      />
    </Suspense>
  );
}
