import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeHasPermission, isEmployeeAppUser } from './load-employee-app-context';
import { findEmployeeByUserId } from '@/modules/workforce';
import { getAttendanceClockSurface } from '@/modules/workforce/application/attendance';

export type EmployeeNavGroup = 'planner' | 'management';

export interface EmployeeNavItem {
  readonly href: string;
  readonly labelKey: string;
  readonly visible: boolean;
  readonly group?: EmployeeNavGroup;
}

/** Employee app routes grouped under Management / Office navigation. */
export const EMPLOYEE_MANAGEMENT_NAV_HREFS = [
  '/employee/clients',
  '/employee/billing',
  '/employee/contracts',
  '/employee/expenses',
  '/employee/vendors',
  '/employee/ap',
  '/employee/procurement',
  '/employee/changes',
  '/employee/quotes',
] as const;

export function hasEmployeeManagementNav(context: OrgContext): boolean {
  return buildEmployeeNavItems(context).some(
    (item) => item.visible && item.group === 'management',
  );
}

export interface EmployeeShellData {
  readonly employeeName: string;
  readonly organizationName: string;
  readonly linked: boolean;
  readonly nav: readonly EmployeeNavItem[];
  readonly clock: Awaited<ReturnType<typeof getAttendanceClockSurface>> | null;
}

/** Employee nav — visibility driven only by effective grants (+ always home). */
export function buildEmployeeNavItems(context: OrgContext): EmployeeNavItem[] {
  const canAttendance = employeeHasPermission(context, PERMISSIONS.ATTENDANCE_SELF);
  const canHours = employeeHasPermission(context, PERMISSIONS.TIME_MANAGE);
  const canTeamAttendance =
    employeeHasPermission(context, PERMISSIONS.ATTENDANCE_READ) ||
    employeeHasPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);
  const canTeam =
    employeeHasPermission(context, PERMISSIONS.WORKFORCE_READ) || canTeamAttendance;
  const canForms =
    employeeHasPermission(context, PERMISSIONS.FORMS_READ) ||
    employeeHasPermission(context, PERMISSIONS.FORMS_SUBMIT);
  const canExpenses =
    employeeHasPermission(context, PERMISSIONS.EXPENSES_READ) ||
    employeeHasPermission(context, PERMISSIONS.EXPENSES_CREATE);

  return [
    { href: '/employee', labelKey: 'employeeApp.nav.home', visible: true, group: 'planner' },
    {
      href: '/employee/time',
      labelKey: 'employeeApp.nav.timeAndAttendance',
      visible: canAttendance || canHours || canTeamAttendance || employeeHasPermission(context, PERMISSIONS.TIME_APPROVE),
      group: 'planner',
    },
    {
      href: '/employee/projects',
      labelKey: 'employeeApp.nav.projects',
      visible: employeeHasPermission(context, PERMISSIONS.PROJECTS_READ),
      group: 'planner',
    },
    {
      href: '/employee/tasks',
      labelKey: 'employeeApp.nav.tasks',
      visible:
        employeeHasPermission(context, PERMISSIONS.TASKS_READ) ||
        employeeHasPermission(context, PERMISSIONS.TASKS_CREATE) ||
        employeeHasPermission(context, PERMISSIONS.FIELD_OPS_READ) ||
        employeeHasPermission(context, PERMISSIONS.SERVICE_READ) ||
        employeeHasPermission(context, PERMISSIONS.PLANNING_READ),
      group: 'planner',
    },
    {
      href: '/employee/team',
      labelKey: 'employeeApp.nav.team',
      visible: canTeam,
      group: 'planner',
    },
    {
      href: '/employee/meetings',
      labelKey: 'employeeApp.nav.meetings',
      visible: employeeHasPermission(context, PERMISSIONS.MEETINGS_READ),
      group: 'planner',
    },
    {
      href: '/employee/documents',
      labelKey: 'employeeApp.nav.documents',
      visible: employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ),
      group: 'planner',
    },
    {
      href: '/employee/forms',
      labelKey: 'employeeApp.nav.forms',
      visible: canForms,
      group: 'planner',
    },
    {
      href: '/employee/clients',
      labelKey: 'employeeApp.nav.clients',
      visible: employeeHasPermission(context, PERMISSIONS.CLIENTS_READ),
      group: 'management',
    },
    {
      href: '/employee/billing',
      labelKey: 'employeeApp.nav.billing',
      visible: employeeHasPermission(context, PERMISSIONS.BILLING_READ),
      group: 'management',
    },
    {
      href: '/employee/contracts',
      labelKey: 'employeeApp.nav.contracts',
      visible: employeeHasPermission(context, PERMISSIONS.CONTRACTS_READ),
      group: 'management',
    },
    {
      href: '/employee/expenses',
      labelKey: 'employeeApp.nav.expenses',
      visible: canExpenses,
      group: 'management',
    },
    {
      href: '/employee/vendors',
      labelKey: 'employeeApp.nav.vendors',
      visible: employeeHasPermission(context, PERMISSIONS.VENDORS_READ),
      group: 'management',
    },
    {
      href: '/employee/ap',
      labelKey: 'employeeApp.nav.ap',
      visible: employeeHasPermission(context, PERMISSIONS.AP_READ),
      group: 'management',
    },
    {
      href: '/employee/procurement',
      labelKey: 'employeeApp.nav.procurement',
      visible: employeeHasPermission(context, PERMISSIONS.PROCUREMENT_READ),
      group: 'management',
    },
    {
      href: '/employee/changes',
      labelKey: 'employeeApp.nav.changes',
      visible: employeeHasPermission(context, PERMISSIONS.CHANGES_READ),
      group: 'management',
    },
    {
      href: '/employee/quotes',
      labelKey: 'employeeApp.nav.quotes',
      visible: employeeHasPermission(context, PERMISSIONS.QUOTES_READ),
      group: 'management',
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
