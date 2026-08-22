import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { hasAnyPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  WorkforceSubNavClient,
  type WorkforceSubNavTab,
  type WorkforceTab,
} from './workforce-sub-nav-client';

interface WorkforceSubNavProps {
  readonly active: WorkforceTab;
}

/** Local workforce tab strip - shell More nav is owned by Agent 8. */
export async function WorkforceSubNav({ active }: WorkforceSubNavProps) {
  const t = await getTranslations('workforce');
  const { showEmployees, showAttendance, showApprovals, showTimesheets } = await withOrgContext(
    async (context) => ({
      showEmployees: hasPermission(context, PERMISSIONS.WORKFORCE_READ),
      showAttendance: hasAnyPermission(context, [
        PERMISSIONS.ATTENDANCE_READ,
        PERMISSIONS.ATTENDANCE_SELF,
        PERMISSIONS.ATTENDANCE_MANAGE,
      ]),
      showApprovals: hasPermission(context, PERMISSIONS.TIME_APPROVE),
      showTimesheets: hasAnyPermission(context, [
        PERMISSIONS.WORKFORCE_READ,
        PERMISSIONS.TIME_MANAGE,
        PERMISSIONS.TIME_APPROVE,
      ]),
    }),
  );

  const tabs: WorkforceSubNavTab[] = [];
  if (showEmployees) {
    tabs.push({
      value: 'employees',
      href: '/workforce/employees',
      label: t('nav.employees'),
    });
  }
  tabs.push({
    value: 'time',
    href: '/workforce/time',
    label: t('nav.time'),
  });
  if (showTimesheets) {
    tabs.push({
      value: 'timesheets',
      href: '/workforce/timesheets',
      label: t('nav.timesheets'),
    });
  }
  if (showAttendance) {
    tabs.push({
      value: 'attendance',
      href: '/workforce/attendance',
      label: t('nav.attendance'),
    });
  }
  if (showApprovals) {
    tabs.push({
      value: 'approvals',
      href: '/workforce/time/approvals',
      label: t('nav.approvals'),
    });
  }

  return <WorkforceSubNavClient active={active} tabs={tabs} />;
}

export type { WorkforceTab };
