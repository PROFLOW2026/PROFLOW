import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates/dates';
import {
  listDailyLogs,
  listInspections,
  listPunchListItems,
} from '../data/field-ops.repository';
import type { DailyLogRecord, InspectionRecord, PunchListItemRecord } from '../domain/types';

export interface ProjectFieldOpsSummary {
  readonly openPunchCount: number;
  readonly latestLog: Pick<DailyLogRecord, 'id' | 'logDate' | 'summary'> | null;
  readonly upcomingInspections: readonly Pick<
    InspectionRecord,
    'id' | 'title' | 'scheduledOn' | 'status'
  >[];
}

export function countOpenPunchItems(
  items: readonly Pick<PunchListItemRecord, 'status'>[],
): number {
  return items.filter((item) => item.status === 'open' || item.status === 'in_progress').length;
}

export function selectUpcomingInspections(
  inspections: readonly Pick<InspectionRecord, 'id' | 'title' | 'scheduledOn' | 'status'>[],
  today: string,
  limit = 3,
): ProjectFieldOpsSummary['upcomingInspections'] {
  return inspections
    .filter(
      (item) =>
        (item.status === 'scheduled' || item.status === 'in_progress') &&
        (item.scheduledOn === null || item.scheduledOn >= today),
    )
    .sort((a, b) => {
      if (!a.scheduledOn && !b.scheduledOn) return 0;
      if (!a.scheduledOn) return 1;
      if (!b.scheduledOn) return -1;
      return a.scheduledOn.localeCompare(b.scheduledOn);
    })
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      title: item.title,
      scheduledOn: item.scheduledOn,
      status: item.status,
    }));
}

/** Overview counts for Project Workspace — progressive complexity friendly. */
export async function getProjectFieldOpsSummary(
  context: OrgContext,
  projectId: string,
): Promise<ProjectFieldOpsSummary> {
  assertPermission(context, PERMISSIONS.FIELD_OPS_READ);

  const [logs, punchItems, inspections] = await Promise.all([
    listDailyLogs(context.db, context.organizationId, projectId),
    listPunchListItems(context.db, context.organizationId, projectId),
    listInspections(context.db, context.organizationId, projectId),
  ]);

  const openPunchCount = countOpenPunchItems(punchItems);

  const latest = logs[0];
  const latestLog = latest
    ? { id: latest.id, logDate: latest.logDate, summary: latest.summary }
    : null;

  const today = todayInTimeZone(context.organization.timezone);
  const upcomingInspections = selectUpcomingInspections(inspections, today);

  return { openPunchCount, latestLog, upcomingInspections };
}
