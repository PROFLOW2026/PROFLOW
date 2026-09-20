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
  readonly organizationName: string;
  readonly linked: boolean;
  readonly nav: readonly EmployeeNavItem[];
  readonly clock: Awaited<ReturnType<typeof getAttendanceClockSurface>> | null;
}

/** Employee bottom nav — visibility driven only by effective grants (+ always home). */
export function buildEmployeeNavItems(context: OrgContext): EmployeeNavItem[] {
  const canAttendance = employeeHasPermission(context, PERMISSIONS.ATTENDANCE_SELF);
  const canHours = employeeHasPermission(context, PERMISSIONS.TIME_MANAGE);

  return [
    { href: '/employee', labelKey: 'employeeApp.nav.home', visible: true },
    {
      href: '/employee/time',
      labelKey: 'employeeApp.nav.timeAndAttendance',
      visible: canAttendance || canHours,
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
        employeeHasPermission(context, PERMISSIONS.TASKS_READ) ||
        employeeHasPermission(context, PERMISSIONS.FIELD_OPS_READ) ||
        employeeHasPermission(context, PERMISSIONS.SERVICE_READ) ||
        employeeHasPermission(context, PERMISSIONS.PLANNING_READ),
    },
    {
      href: '/employee/meetings',
      labelKey: 'employeeApp.nav.meetings',
      visible: employeeHasPermission(context, PERMISSIONS.MEETINGS_READ),
    },
    {
      href: '/employee/documents',
      labelKey: 'employeeApp.nav.documents',
      visible: employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ),
    },
  ];
}

export async function getEmployeeShellData(context: OrgContext): Promise<EmployeeShellData> {
  if (!isEmployeeAppUser(context)) {
    return {
      employeeName: '',
      organizationName: '',
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

  const nav = buildEmployeeNavItems(context);

  let clock: EmployeeShellData['clock'] = null;
  if (employee && employeeHasPermission(context, PERMISSIONS.ATTENDANCE_SELF)) {
    clock = await getAttendanceClockSurface(context);
  }

  return {
    employeeName: employee?.name ?? '',
    organizationName: context.organization.name,
    linked: Boolean(employee),
    nav,
    clock,
  };
}
