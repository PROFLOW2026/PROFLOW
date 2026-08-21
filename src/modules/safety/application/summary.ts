import { isAccessibleProjectId, resolveAccessibleProjectIds } from '@/modules/projects';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates/dates';
import { isOpenSafetyRecordStatus, isOpenSafetyActionStatus } from '../domain/status';
import { isCorrectiveActionOverdue, listOverdueSafetyActions } from '../domain/overdue';
import type { SafetyRecordType, SafetySeverity, SafetySummary } from '../domain/types';
import { SAFETY_RECORD_TYPES, SAFETY_SEVERITIES } from '../domain/types';
import {
  listCorrectiveActionsForOrg,
  listOverdueCorrectiveActions,
  listSafetyRecords,
} from '../data/safety.repository';

function emptyBySeverity(): Record<SafetySeverity, number> {
  return { low: 0, medium: 0, high: 0, critical: 0 };
}

function emptyByType(): Record<SafetyRecordType, number> {
  return {
    incident: 0,
    near_miss: 0,
    accident: 0,
    hazard: 0,
    observation: 0,
    toolbox_talk: 0,
    ppe_issue: 0,
  };
}

export async function getSafetySummaryForOrg(context: OrgContext): Promise<SafetySummary> {
  assertPermission(context, PERMISSIONS.SAFETY_READ);
  const today = todayInTimeZone(context.organization.timezone);
  const [allowed, records, overdueActions] = await Promise.all([
    resolveAccessibleProjectIds(context),
    listSafetyRecords(context.db, context.organizationId, { limit: 5_000 }),
    listOverdueCorrectiveActions(context.db, context.organizationId, today),
  ]);
  const visibleRecords = records.filter((row) => isAccessibleProjectId(allowed, row.projectId));
  const visibleRecordIds = new Set(visibleRecords.map((row) => row.id));
  const visibleOverdue = overdueActions.filter(
    (row) => visibleRecordIds.has(row.safetyRecordId),
  );

  const bySeverity = emptyBySeverity();
  const byType = emptyByType();
  const projectCounts = new Map<string, number>();
  let openRecords = 0;

  for (const record of visibleRecords) {
    if (isOpenSafetyRecordStatus(record.status)) openRecords += 1;
    if (SAFETY_SEVERITIES.includes(record.severity)) bySeverity[record.severity] += 1;
    if (SAFETY_RECORD_TYPES.includes(record.recordType)) byType[record.recordType] += 1;
    if (record.projectId) {
      projectCounts.set(record.projectId, (projectCounts.get(record.projectId) ?? 0) + 1);
    }
  }

  return {
    openRecords,
    overdueActions: visibleOverdue.length,
    bySeverity,
    byType,
    byProject: [...projectCounts.entries()].map(([projectId, count]) => ({ projectId, count })),
  };
}

/** Loads org actions then applies the domain overdue helper (scanner-friendly). */
export async function loadOverdueSafetyActionsForOrg(context: OrgContext) {
  assertPermission(context, PERMISSIONS.SAFETY_READ);
  const today = todayInTimeZone(context.organization.timezone);
  const actions = await listCorrectiveActionsForOrg(context.db, context.organizationId);
  return listOverdueSafetyActions(actions, today, context.organizationId);
}

/** Open corrective actions on accessible projects (batch-loaded, no per-record N+1). */
export async function listOpenSafetyActionsForOrg(context: OrgContext) {
  assertPermission(context, PERMISSIONS.SAFETY_READ);
  const [allowed, records, actions] = await Promise.all([
    resolveAccessibleProjectIds(context),
    listSafetyRecords(context.db, context.organizationId, { limit: 5_000 }),
    listCorrectiveActionsForOrg(context.db, context.organizationId),
  ]);
  const visibleRecordIds = new Set(
    records.filter((row) => isAccessibleProjectId(allowed, row.projectId)).map((row) => row.id),
  );
  return actions.filter(
    (action) =>
      isOpenSafetyActionStatus(action.status) && visibleRecordIds.has(action.safetyRecordId),
  );
}

export { isCorrectiveActionOverdue, listOverdueSafetyActions };
