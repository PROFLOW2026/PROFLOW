import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { businessDate, isBefore, todayInTimeZone } from '@/shared/dates';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertAnyPermission, assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { findEmployeeById } from '../data/employees.repository';
import { findProjectById, listActiveProjects } from '../data/project-refs.repository';
import {
  cancelEmployeeProjectAssignmentById,
  endEmployeeProjectAssignmentById,
  findActiveAssignmentConflict,
  findEmployeeProjectAssignmentById,
  insertEmployeeProjectAssignment,
  listActiveAssignedEmployeeIds,
  listEmployeeAssignmentHistory,
  listFormalEmployeeProjects,
  listFormalProjectTeam,
  listProjectAssignmentHistory,
  updateEmployeeProjectAssignmentById,
} from '../data/project-team.repository';
import type {
  EmployeeProjectAssignmentRecord,
  EmployeeProjectLink,
  ProjectTeamMemberSummary,
} from '../domain/types';
import {
  addProjectTeamMemberSchema,
  cancelProjectTeamAssignmentSchema,
  removeProjectTeamMemberSchema,
  updateProjectTeamAssignmentSchema,
  type AddProjectTeamMemberInput,
  type CancelProjectTeamAssignmentInput,
  type RemoveProjectTeamMemberInput,
  type UpdateProjectTeamAssignmentInput,
} from '../validation/schemas';

/**
 * Formal project team from `employee_project_assignments` (active spans).
 * Assignment alone never creates labor Actual - only time entries do.
 */
export async function listProjectTeamMembers(
  context: OrgContext,
  projectId: string,
): Promise<ProjectTeamMemberSummary[]> {
  assertAnyPermission(context, [PERMISSIONS.WORKFORCE_READ, PERMISSIONS.PROJECTS_READ]);
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  return listFormalProjectTeam(context.db, context.organizationId, projectId);
}

/** Projects formally assigned to an employee (hours are secondary display only). */
export async function listEmployeeProjectLinks(
  context: OrgContext,
  employeeId: string,
): Promise<EmployeeProjectLink[]> {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);
  const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!employee) throw new NotFoundError('Employee');
  return listFormalEmployeeProjects(context.db, context.organizationId, employeeId);
}

/**
 * Add an employee to a project team as a temporal assignment.
 * Defaults start_date to today (org timezone), end_date null, status active.
 * Does not write time entries, labor cost snapshots, or expense Actuals.
 */
export async function addProjectTeamMember(
  context: OrgContext,
  rawInput: AddProjectTeamMemberInput,
): Promise<EmployeeProjectAssignmentRecord> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);

  const parsed = addProjectTeamMemberSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const project = await findProjectById(context.db, context.organizationId, parsed.data.projectId);
  if (!project) throw new NotFoundError('Project');

  const employee = await findEmployeeById(context.db, context.organizationId, parsed.data.employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');

  const startDate = parsed.data.startDate ?? todayInTimeZone(context.organization.timezone);
  const endDate = parsed.data.endDate ?? null;

  const existing = await findActiveAssignmentConflict(
    context.db,
    context.organizationId,
    parsed.data.projectId,
    parsed.data.employeeId,
    startDate,
    endDate,
  );
  if (existing) {
    throw new ConflictError(
      'Employee is already on this project team',
      'workforce.errors.duplicateTeamMember',
    );
  }

  const assignment = await insertEmployeeProjectAssignment(context.db, {
    organizationId: context.organizationId,
    projectId: parsed.data.projectId,
    employeeId: parsed.data.employeeId,
    startDate,
    endDate,
    role: parsed.data.role ?? null,
    plannedAllocationPercent: parsed.data.plannedAllocationPercent ?? null,
    notes: parsed.data.notes ?? null,
    status: 'active',
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_TEAM_MEMBER_ADDED,
    entityType: 'employee_project_assignment',
    entityId: assignment.id,
    after: {
      projectId: assignment.projectId,
      employeeId: assignment.employeeId,
      role: assignment.role,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
      status: assignment.status,
    },
  });

  return assignment;
}

/**
 * End a formal assignment (סיים שיוך). Sets end_date + status completed.
 * Does not delete historical time entries or change labor Actual.
 */
export async function removeProjectTeamMember(
  context: OrgContext,
  rawInput: RemoveProjectTeamMemberInput,
): Promise<EmployeeProjectAssignmentRecord> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);

  const parsed = removeProjectTeamMemberSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findEmployeeProjectAssignmentById(
    context.db,
    context.organizationId,
    parsed.data.membershipId,
  );
  if (!existing || existing.status !== 'active') throw new NotFoundError('Team member');

  const endDate = existing.endDate ?? todayInTimeZone(context.organization.timezone);
  const removed = await endEmployeeProjectAssignmentById(
    context.db,
    context.organizationId,
    parsed.data.membershipId,
    endDate,
  );
  if (!removed) throw new NotFoundError('Team member');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_TEAM_MEMBER_REMOVED,
    entityType: 'employee_project_assignment',
    entityId: removed.id,
    before: {
      projectId: removed.projectId,
      employeeId: removed.employeeId,
      role: removed.role,
      startDate: existing.startDate,
      endDate: existing.endDate,
      status: existing.status,
    },
    after: {
      status: removed.status,
      endDate: removed.endDate,
    },
  });

  return removed;
}

/**
 * Edit active assignment dates/role for current or future spans.
 * Does not rewrite history of completed/cancelled rows; never touches Actual.
 */
export async function updateProjectTeamAssignment(
  context: OrgContext,
  rawInput: UpdateProjectTeamAssignmentInput,
): Promise<EmployeeProjectAssignmentRecord> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);

  const parsed = updateProjectTeamAssignmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findEmployeeProjectAssignmentById(
    context.db,
    context.organizationId,
    parsed.data.membershipId,
  );
  if (!existing || existing.status !== 'active') throw new NotFoundError('Team member');

  const today = todayInTimeZone(context.organization.timezone);
  const nextStart = parsed.data.startDate ?? existing.startDate;
  const nextEnd =
    parsed.data.endDate !== undefined ? parsed.data.endDate : existing.endDate;

  if (parsed.data.startDate !== undefined) {
    const existingStart = businessDate(existing.startDate);
    // Past-started assignments: keep start immutable (safe current/future edits only).
    if (isBefore(existingStart, businessDate(today)) && parsed.data.startDate !== existing.startDate) {
      throw new ValidationError([
        {
          path: 'startDate',
          message: 'Cannot change start date after the assignment has begun.',
        },
      ]);
    }
  }

  if (nextEnd && isBefore(businessDate(nextEnd), businessDate(nextStart))) {
    throw new ValidationError([
      { path: 'endDate', message: 'End date must be on or after start date.' },
    ]);
  }

  const conflict = await findActiveAssignmentConflict(
    context.db,
    context.organizationId,
    existing.projectId,
    existing.employeeId,
    nextStart,
    nextEnd,
    existing.id,
  );
  if (conflict) {
    throw new ConflictError(
      'Employee is already on this project team',
      'workforce.errors.duplicateTeamMember',
    );
  }

  const updated = await updateEmployeeProjectAssignmentById(
    context.db,
    context.organizationId,
    parsed.data.membershipId,
    {
      ...(parsed.data.startDate !== undefined ? { startDate: parsed.data.startDate } : {}),
      ...(parsed.data.endDate !== undefined ? { endDate: parsed.data.endDate } : {}),
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
      ...(parsed.data.plannedAllocationPercent !== undefined
        ? { plannedAllocationPercent: parsed.data.plannedAllocationPercent }
        : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    },
  );
  if (!updated) throw new NotFoundError('Team member');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_TEAM_ASSIGNMENT_UPDATED,
    entityType: 'employee_project_assignment',
    entityId: updated.id,
    before: {
      startDate: existing.startDate,
      endDate: existing.endDate,
      role: existing.role,
      plannedAllocationPercent: existing.plannedAllocationPercent,
      notes: existing.notes,
      status: existing.status,
    },
    after: {
      startDate: updated.startDate,
      endDate: updated.endDate,
      role: updated.role,
      plannedAllocationPercent: updated.plannedAllocationPercent,
      notes: updated.notes,
      status: updated.status,
    },
  });

  return updated;
}

/**
 * Cancel a mistaken active assignment (status cancelled).
 * Does not delete time entries or change labor Actual.
 */
export async function cancelProjectTeamAssignment(
  context: OrgContext,
  rawInput: CancelProjectTeamAssignmentInput,
): Promise<EmployeeProjectAssignmentRecord> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);

  const parsed = cancelProjectTeamAssignmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findEmployeeProjectAssignmentById(
    context.db,
    context.organizationId,
    parsed.data.membershipId,
  );
  if (!existing || existing.status !== 'active') throw new NotFoundError('Team member');

  const cancelled = await cancelEmployeeProjectAssignmentById(
    context.db,
    context.organizationId,
    parsed.data.membershipId,
  );
  if (!cancelled) throw new NotFoundError('Team member');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_TEAM_ASSIGNMENT_CANCELLED,
    entityType: 'employee_project_assignment',
    entityId: cancelled.id,
    before: {
      projectId: existing.projectId,
      employeeId: existing.employeeId,
      status: existing.status,
      startDate: existing.startDate,
      endDate: existing.endDate,
    },
    after: {
      status: cancelled.status,
    },
  });

  return cancelled;
}

/** Employee IDs with active assignments on a project (for time-entry picker ordering). */
export async function listAssignedEmployeeIdsForProject(
  context: OrgContext,
  projectId: string,
): Promise<string[]> {
  assertAnyPermission(context, [
    PERMISSIONS.WORKFORCE_READ,
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.TIME_MANAGE,
  ]);
  return listActiveAssignedEmployeeIds(context.db, context.organizationId, projectId);
}

/** Active projects available for employee → assign (Flow A). */
export async function listAssignableProjects(
  context: OrgContext,
): Promise<{ id: string; name: string }[]> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);
  return listActiveProjects(context.db, context.organizationId);
}

/** Ended / historical assignments for a project (history toggle). */
export async function listProjectTeamHistory(
  context: OrgContext,
  projectId: string,
): Promise<ProjectTeamMemberSummary[]> {
  assertAnyPermission(context, [PERMISSIONS.WORKFORCE_READ, PERMISSIONS.PROJECTS_READ]);
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  return listProjectAssignmentHistory(context.db, context.organizationId, projectId);
}

/** Ended / historical שיוכים for an employee. */
export async function listEmployeeAssignmentHistoryLinks(
  context: OrgContext,
  employeeId: string,
): Promise<EmployeeProjectLink[]> {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);
  const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!employee) throw new NotFoundError('Employee');
  return listEmployeeAssignmentHistory(context.db, context.organizationId, employeeId);
}
