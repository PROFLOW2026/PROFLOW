import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeHasPermission, isEmployeeAppUser } from './load-employee-app-context';
import { findEmployeeByUserId } from '@/modules/workforce';
import { getAttendanceClockSurface } from '@/modules/workforce/application/attendance';

export interface EmployeeNavItem {
  readonly href: string;
  readonly labelKey: string;
  readonly visible: boolean;
}

export interface EmployeeShellData {
  readonly employeeName: string;
  readonly linked: boolean;
  readonly nav: readonly EmployeeNavItem[];
  readonly clock: Awaited<ReturnType<typeof getAttendanceClockSurface>> | null;
}

export async function getEmployeeShellData(context: OrgContext): Promise<EmployeeShellData> {
  if (!isEmployeeAppUser(context)) {
    return {
      employeeName: '',
      linked: false,
      nav: [],
      clock: null,
    };
  }

  const employee = await findEmployeeByUserId(
    context.db,
    context.organizationId,
    context.userId,
  );

  const nav: EmployeeNavItem[] = [
    { href: '/employee', labelKey: 'employeeApp.nav.home', visible: true },
    {
      href: '/employee/attendance',
      labelKey: 'employeeApp.nav.attendance',
      visible: employeeHasPermission(context, PERMISSIONS.ATTENDANCE_SELF),
    },
    {
      href: '/employee/hours',
      labelKey: 'employeeApp.nav.hours',
      visible: employeeHasPermission(context, PERMISSIONS.TIME_MANAGE),
    },
    {
      href: '/employee/projects',
      labelKey: 'employeeApp.nav.projects',
      visible: employeeHasPermission(context, PERMISSIONS.PROJECTS_READ),
    },
    {
      href: '/employee/tasks',
      labelKey: 'employeeApp.nav.tasks',
      visible:
        employeeHasPermission(context, PERMISSIONS.FIELD_OPS_READ) ||
        employeeHasPermission(context, PERMISSIONS.SERVICE_READ) ||
        employeeHasPermission(context, PERMISSIONS.PLANNING_READ),
    },
    {
      href: '/employee/documents',
      labelKey: 'employeeApp.nav.documents',
      visible: employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ),
    },
  ];

  let clock: EmployeeShellData['clock'] = null;
  if (employee && employeeHasPermission(context, PERMISSIONS.ATTENDANCE_SELF)) {
    clock = await getAttendanceClockSurface(context);
  }

  return {
    employeeName: employee?.name ?? '',
    linked: Boolean(employee),
    nav,
    clock,
  };
}
