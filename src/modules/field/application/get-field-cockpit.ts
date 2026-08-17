import {
  listDailyLogsForOrg,
  listInspectionsForOrg,
  listPunchListItemsForOrg,
} from '@/modules/field-ops';
import type {
  DailyLogRecord,
  InspectionRecord,
  PunchListItemRecord,
} from '@/modules/field-ops/domain/types';
import { listProjectsForOrg } from '@/modules/projects';
import type { ProjectListItem } from '@/modules/projects/domain/types';
import { listDispatchBoard, listWorkOrdersForOrg } from '@/modules/service';
import type { DispatchListItem, WorkOrderListItem } from '@/modules/service/domain/types';
import {
  canClockAttendance,
  getAttendanceClockSurface,
  type AttendanceClockSurface,
} from '@/modules/workforce';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  filterDailyLogsForToday,
  filterDispatchForEmployee,
  filterInspectionsForToday,
  filterOpenPunchForEmployee,
  filterWorkOrdersForEmployee,
  takeRecentProjects,
} from '../domain/cockpit';

export interface FieldCockpitCapabilities {
  readonly attendance: boolean;
  readonly service: boolean;
  readonly fieldOps: boolean;
  readonly fieldOpsManage: boolean;
  readonly time: boolean;
  readonly expenses: boolean;
  readonly documents: boolean;
  readonly safety: boolean;
  readonly projects: boolean;
}

export interface FieldCockpitData {
  readonly today: string;
  readonly employeeId: string | null;
  readonly capabilities: FieldCockpitCapabilities;
  readonly attendance: AttendanceClockSurface | null;
  readonly dispatch: readonly DispatchListItem[];
  readonly workOrders: readonly WorkOrderListItem[];
  readonly projects: readonly ProjectListItem[];
  readonly punch: readonly PunchListItemRecord[];
  readonly inspections: readonly InspectionRecord[];
  readonly dailyLogs: readonly DailyLogRecord[];
}

export async function getFieldCockpit(context: OrgContext): Promise<FieldCockpitData> {
  const today = todayInTimeZone(context.organization.timezone);
  const capabilities: FieldCockpitCapabilities = {
    attendance: canClockAttendance(context),
    service:
      hasPermission(context, PERMISSIONS.SERVICE_READ) ||
      hasPermission(context, PERMISSIONS.DISPATCH_MANAGE),
    fieldOps: hasPermission(context, PERMISSIONS.FIELD_OPS_READ),
    fieldOpsManage: hasPermission(context, PERMISSIONS.FIELD_OPS_MANAGE),
    time: hasPermission(context, PERMISSIONS.TIME_MANAGE),
    expenses: hasPermission(context, PERMISSIONS.EXPENSES_CREATE),
    documents: hasPermission(context, PERMISSIONS.DOCUMENTS_READ),
    safety: hasPermission(context, PERMISSIONS.SAFETY_READ),
    projects: hasPermission(context, PERMISSIONS.PROJECTS_READ),
  };

  const attendance = capabilities.attendance
    ? await getAttendanceClockSurface(context).catch(() => null)
    : null;
  const employeeId = attendance?.employeeId ?? null;

  const [dispatchRaw, workOrdersRaw, projectsRaw, punchRaw, inspectionsRaw, logsRaw] =
    await Promise.all([
      capabilities.service
        ? listDispatchBoard(context, {
            window: 'today',
            assigneeEmployeeId: employeeId,
          }).catch(() => [])
        : Promise.resolve([]),
      capabilities.service
        ? listWorkOrdersForOrg(context, {}).catch(() => [])
        : Promise.resolve([]),
      capabilities.projects
        ? listProjectsForOrg(context, {}).catch(() => [])
        : Promise.resolve([]),
      capabilities.fieldOps
        ? listPunchListItemsForOrg(context, {}).catch(() => [])
        : Promise.resolve([]),
      capabilities.fieldOps
        ? listInspectionsForOrg(context, {}).catch(() => [])
        : Promise.resolve([]),
      capabilities.fieldOps
        ? listDailyLogsForOrg(context, { limit: 40 }).catch(() => [])
        : Promise.resolve([]),
    ]);

  return {
    today,
    employeeId,
    capabilities,
    attendance,
    dispatch: filterDispatchForEmployee(dispatchRaw, employeeId).slice(0, 12),
    workOrders: filterWorkOrdersForEmployee(
      workOrdersRaw.filter(
        (row) =>
          row.service?.serviceStatus === 'scheduled' ||
          row.service?.serviceStatus === 'in_progress' ||
          row.service?.serviceStatus === 'waiting' ||
          row.service?.serviceStatus === 'new',
      ),
      employeeId,
    ).slice(0, 12),
    projects: takeRecentProjects(projectsRaw, 8),
    punch: filterOpenPunchForEmployee(punchRaw, employeeId).slice(0, 8),
    inspections: filterInspectionsForToday(inspectionsRaw, today).slice(0, 8),
    dailyLogs: filterDailyLogsForToday(logsRaw, today).slice(0, 8),
  };
}
