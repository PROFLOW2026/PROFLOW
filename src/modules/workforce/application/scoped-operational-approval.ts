/**
 * Project-scoped operational approval (PT-05).
 *
 * Internal project members with `operational.approve` may review pending
 * attendance corrections and submitted project-time rows for that project only.
 * They never receive org-wide attendance.manage / time.approve and must not read
 * employer cost, salary, or margin fields (see workforce-cost-authz).
 */

import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { employeeProjectAssignments, timeEntries } from '@drizzle/schema';
import {
  PROJECT_CAPABILITIES as C,
  expandCapabilities,
  hasProjectCapability,
  isOrgProjectAdmin,
} from '@/modules/project-team';
import { listActiveMembershipsForUser } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, DomainRuleError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { DbExecutor } from '@/shared/db/types';
import { findEmployeeById } from '../data/employees.repository';
import { isManagerRecordedDraftPendingApproval } from '../domain/manager-recorded-time';
import type { TimeEntryRecord } from '../domain/types';

export function hasOrgWideTimeApproval(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.TIME_APPROVE);
}

export function hasOrgWideAttendanceReview(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);
}

/** Project ids where the signed-in user holds operational.approve (active membership). */
export async function listOperationalApproveProjectIds(context: OrgContext): Promise<string[]> {
  if (isOrgProjectAdmin(context)) {
    return [];
  }
  const memberships = await listActiveMembershipsForUser(
    context.db,
    context.organizationId,
    context.userId,
  );
  const projectIds: string[] = [];
  for (const membership of memberships) {
    const held = expandCapabilities(membership.capabilities);
    if (held.has(C.OPERATIONAL_APPROVE)) {
      projectIds.push(membership.projectId);
    }
  }
  return projectIds;
}

export async function hasAnyOperationalApproveScope(context: OrgContext): Promise<boolean> {
  if (hasOrgWideAttendanceReview(context) || hasOrgWideTimeApproval(context)) {
    return true;
  }
  const scoped = await listOperationalApproveProjectIds(context);
  return scoped.length > 0;
}

/** Time approval queue / approve actions without granting org-wide `time.approve`. */
export async function resolveTimeApprovalQueueAccess(context: OrgContext): Promise<{
  readonly orgWide: boolean;
  readonly operationalProjectIds: readonly string[];
}> {
  if (hasOrgWideTimeApproval(context)) {
    return { orgWide: true, operationalProjectIds: [] };
  }
  const operationalProjectIds = await listOperationalApproveProjectIds(context);
  if (operationalProjectIds.length === 0) {
    throw new AuthorizationError(PERMISSIONS.TIME_APPROVE);
  }
  return { orgWide: false, operationalProjectIds };
}

export async function assertCanAccessTimeApprovalQueue(context: OrgContext): Promise<void> {
  await resolveTimeApprovalQueueAccess(context);
}

export async function assertCanAttemptTimesheetApproval(context: OrgContext): Promise<void> {
  await assertCanAccessTimeApprovalQueue(context);
}

export async function resolveTimeApprovalProjectScope(
  context: OrgContext,
): Promise<readonly string[] | 'all'> {
  if (hasOrgWideTimeApproval(context) || isOrgProjectAdmin(context)) {
    return 'all';
  }
  return listOperationalApproveProjectIds(context);
}

/** Project ids where the employee had an active assignment or project time on the date. */
export async function listEmployeeProjectIdsOnWorkDate(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
  workDate: string,
): Promise<string[]> {
  const assignmentRows = await db
    .select({ projectId: employeeProjectAssignments.projectId })
    .from(employeeProjectAssignments)
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.employeeId, employeeId),
        ne(employeeProjectAssignments.status, 'cancelled'),
        sql`daterange(${employeeProjectAssignments.startDate}, coalesce(${employeeProjectAssignments.endDate}, 'infinity'::date), '[]')
          @> ${workDate}::date`,
      ),
    );

  const timeRows = await db
    .select({ projectId: timeEntries.projectId })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.organizationId, organizationId),
        eq(timeEntries.employeeId, employeeId),
        eq(timeEntries.workDate, workDate),
        eq(timeEntries.kind, 'project'),
        isNull(timeEntries.voidedAt),
        isNull(timeEntries.archivedAt),
      ),
    );

  const ids = new Set<string>();
  for (const row of assignmentRows) {
    if (row.projectId) ids.add(row.projectId);
  }
  for (const row of timeRows) {
    if (row.projectId) ids.add(row.projectId);
  }
  return [...ids];
}

async function employeeLinkedToProjectsOnDate(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
  workDate: string,
  projectIds: readonly string[],
): Promise<boolean> {
  if (projectIds.length === 0) return false;

  const [assignment] = await db
    .select({ id: employeeProjectAssignments.id })
    .from(employeeProjectAssignments)
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.employeeId, employeeId),
        inArray(employeeProjectAssignments.projectId, [...projectIds]),
        ne(employeeProjectAssignments.status, 'cancelled'),
        sql`daterange(${employeeProjectAssignments.startDate}, coalesce(${employeeProjectAssignments.endDate}, 'infinity'::date), '[]')
          @> ${workDate}::date`,
      ),
    )
    .limit(1);
  if (assignment) return true;

  const [timeRow] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.organizationId, organizationId),
        eq(timeEntries.employeeId, employeeId),
        eq(timeEntries.workDate, workDate),
        eq(timeEntries.kind, 'project'),
        inArray(timeEntries.projectId, [...projectIds]),
        isNull(timeEntries.voidedAt),
        isNull(timeEntries.archivedAt),
      ),
    )
    .limit(1);
  return Boolean(timeRow);
}

export async function assertCanReviewAttendanceCorrection(
  context: OrgContext,
  input: { readonly employeeId: string; readonly workDate: string },
): Promise<void> {
  if (hasOrgWideAttendanceReview(context)) return;

  const projectIds = await listOperationalApproveProjectIds(context);
  if (projectIds.length === 0) {
    throw new AuthorizationError(PERMISSIONS.ATTENDANCE_MANAGE);
  }

  const linked = await employeeLinkedToProjectsOnDate(
    context.db,
    context.organizationId,
    input.employeeId,
    input.workDate,
    projectIds,
  );
  if (!linked) {
    throw new AuthorizationError('project:operational.approve');
  }
}

export async function canReviewAttendanceCorrection(
  context: OrgContext,
  input: { readonly employeeId: string; readonly workDate: string },
): Promise<boolean> {
  try {
    await assertCanReviewAttendanceCorrection(context, input);
    return true;
  } catch (error) {
    if (error instanceof AuthorizationError) return false;
    throw error;
  }
}

export async function assertCanApproveProjectTimeEntry(
  context: OrgContext,
  entry: Pick<TimeEntryRecord, 'kind' | 'projectId' | 'employeeId'>,
): Promise<void> {
  if (hasOrgWideTimeApproval(context)) return;

  if (entry.kind !== 'project' || !entry.projectId) {
    throw new AuthorizationError(PERMISSIONS.TIME_APPROVE);
  }

  if (!(await hasProjectCapability(context, entry.projectId, C.OPERATIONAL_APPROVE))) {
    throw new AuthorizationError(`project:${C.OPERATIONAL_APPROVE}`);
  }
}

async function employeeUserIdByEmployeeIds(
  context: OrgContext,
  employeeIds: readonly string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  for (const employeeId of employeeIds) {
    if (map.has(employeeId)) continue;
    const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
    map.set(employeeId, employee?.userId ?? null);
  }
  return map;
}

function entryNeedsScopedOperationalApproval(
  entry: Pick<TimeEntryRecord, 'employeeId' | 'approvalStatus' | 'createdByUserId'>,
  employeeUserIds: ReadonlyMap<string, string | null>,
): boolean {
  if (entry.approvalStatus === 'submitted') return true;
  return isManagerRecordedDraftPendingApproval({
    approvalStatus: entry.approvalStatus,
    createdByUserId: entry.createdByUserId,
    employeeUserId: employeeUserIds.get(entry.employeeId) ?? null,
  });
}

export async function assertCanApproveSubmittedTimeEntries(
  context: OrgContext,
  entries: readonly Pick<
    TimeEntryRecord,
    'kind' | 'projectId' | 'employeeId' | 'approvalStatus' | 'createdByUserId'
  >[],
): Promise<void> {
  if (hasOrgWideTimeApproval(context)) return;

  const draftEntries = entries.filter((entry) => entry.approvalStatus === 'draft');
  const employeeUserIds =
    draftEntries.length > 0
      ? await employeeUserIdByEmployeeIds(
          context,
          draftEntries.map((entry) => entry.employeeId),
        )
      : new Map<string, string | null>();

  const scoped = entries.filter((entry) => {
    if (entry.approvalStatus === 'submitted') return true;
    return entryNeedsScopedOperationalApproval(entry, employeeUserIds);
  });
  if (scoped.length === 0) return;

  for (const entry of scoped) {
    await assertCanApproveProjectTimeEntry(context, entry);
  }

  const projectIds = new Set(
    scoped.map((entry) => entry.projectId).filter((id): id is string => typeof id === 'string'),
  );
  if (projectIds.size > 1) {
    throw new DomainRuleError(
      'Scoped operational approvers must approve one project at a time',
      'workforce.errors.scopedOperationalApproveSingleProject',
    );
  }
}
