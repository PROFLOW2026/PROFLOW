import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { employeeProjectAssignments, employees, projects, timeEntries } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  EmployeeProjectAssignmentRecord,
  EmployeeProjectAssignmentStatus,
  EmployeeProjectLink,
  ProjectTeamMemberSummary,
} from '../domain/types';

function mapAssignment(
  row: typeof employeeProjectAssignments.$inferSelect,
): EmployeeProjectAssignmentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    employeeId: row.employeeId,
    startDate: row.startDate,
    endDate: row.endDate,
    role: row.role,
    plannedAllocationPercent: row.plannedAllocationPercent,
    notes: row.notes,
    status: row.status as EmployeeProjectAssignmentStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertEmployeeProjectAssignment(
  db: DbExecutor,
  input: {
    organizationId: string;
    projectId: string;
    employeeId: string;
    startDate: string;
    endDate?: string | null;
    role?: string | null;
    plannedAllocationPercent?: string | null;
    notes?: string | null;
    status?: EmployeeProjectAssignmentStatus;
  },
): Promise<EmployeeProjectAssignmentRecord> {
  const [row] = await db
    .insert(employeeProjectAssignments)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      employeeId: input.employeeId,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      role: input.role ?? null,
      plannedAllocationPercent: input.plannedAllocationPercent ?? null,
      notes: input.notes ?? null,
      status: input.status ?? 'active',
    })
    .returning();

  return mapAssignment(row!);
}

/**
 * Soft-end assignment: status `completed` + end_date (preferred over hard-delete).
 * History remains; Actual / time entries are untouched.
 */
export async function endEmployeeProjectAssignmentById(
  db: DbExecutor,
  organizationId: string,
  assignmentId: string,
  endDate: string,
): Promise<EmployeeProjectAssignmentRecord | null> {
  const [row] = await db
    .update(employeeProjectAssignments)
    .set({
      status: 'completed',
      endDate,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(employeeProjectAssignments.id, assignmentId),
        eq(employeeProjectAssignments.organizationId, organizationId),
      ),
    )
    .returning();

  return row ? mapAssignment(row) : null;
}

/** @deprecated Prefer endEmployeeProjectAssignmentById */
export async function cancelEmployeeProjectAssignmentById(
  db: DbExecutor,
  organizationId: string,
  assignmentId: string,
  endDate?: string | null,
): Promise<EmployeeProjectAssignmentRecord | null> {
  if (!endDate) return null;
  return endEmployeeProjectAssignmentById(db, organizationId, assignmentId, endDate);
}

export async function findEmployeeProjectAssignmentById(
  db: DbExecutor,
  organizationId: string,
  assignmentId: string,
): Promise<EmployeeProjectAssignmentRecord | null> {
  const [row] = await db
    .select()
    .from(employeeProjectAssignments)
    .where(
      and(
        eq(employeeProjectAssignments.id, assignmentId),
        eq(employeeProjectAssignments.organizationId, organizationId),
      ),
    )
    .limit(1);

  return row ? mapAssignment(row) : null;
}

/**
 * Active (non-cancelled) assignment for the same employee+project that would
 * conflict with an open-ended add starting on `startDate`.
 */
export async function findActiveAssignmentConflict(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  employeeId: string,
  startDate: string,
  endDate?: string | null,
): Promise<EmployeeProjectAssignmentRecord | null> {
  const endBound = endDate ?? 'infinity';
  const [row] = await db
    .select()
    .from(employeeProjectAssignments)
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.projectId, projectId),
        eq(employeeProjectAssignments.employeeId, employeeId),
        ne(employeeProjectAssignments.status, 'cancelled'),
        sql`daterange(${employeeProjectAssignments.startDate}, coalesce(${employeeProjectAssignments.endDate}, 'infinity'::date), '[]')
            && daterange(${startDate}::date, ${endBound}::date, '[]')`,
      ),
    )
    .limit(1);

  return row ? mapAssignment(row) : null;
}

/** Active assignment employee IDs for a project (time-entry picker ordering). */
export async function listActiveAssignedEmployeeIds(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<string[]> {
  const rows = await db
    .select({ employeeId: employeeProjectAssignments.employeeId })
    .from(employeeProjectAssignments)
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.projectId, projectId),
        eq(employeeProjectAssignments.status, 'active'),
      ),
    );

  return rows.map((row) => row.employeeId);
}

/**
 * Formal team roster for a project (active assignments), with optional logged
 * hours as secondary display. Does not create or read labor Actual beyond
 * summing hours for UI context.
 */
export async function listFormalProjectTeam(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectTeamMemberSummary[]> {
  const members = await db
    .select({
      membershipId: employeeProjectAssignments.id,
      employeeId: employeeProjectAssignments.employeeId,
      employeeName: employees.name,
      jobTitle: employees.jobTitle,
      role: employeeProjectAssignments.role,
      notes: employeeProjectAssignments.notes,
      startDate: employeeProjectAssignments.startDate,
      endDate: employeeProjectAssignments.endDate,
      status: employeeProjectAssignments.status,
    })
    .from(employeeProjectAssignments)
    .innerJoin(employees, eq(employeeProjectAssignments.employeeId, employees.id))
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.projectId, projectId),
        eq(employeeProjectAssignments.status, 'active'),
        isNull(employees.archivedAt),
      ),
    )
    .orderBy(asc(employees.name));

  if (members.length === 0) return [];

  const employeeIds = members.map((member) => member.employeeId);
  const hourRows = await db
    .select({
      employeeId: timeEntries.employeeId,
      totalHours: sql<string>`coalesce(sum(${timeEntries.hours}), 0)::text`,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.organizationId, organizationId),
        eq(timeEntries.projectId, projectId),
        eq(timeEntries.kind, 'project'),
        isNull(timeEntries.archivedAt),
        inArray(timeEntries.employeeId, employeeIds),
      ),
    )
    .groupBy(timeEntries.employeeId);

  const hoursByEmployee = new Map(
    hourRows.map((row) => [row.employeeId, { totalHours: row.totalHours, entryCount: row.entryCount }]),
  );

  return members.map((member) => {
    const hours = hoursByEmployee.get(member.employeeId);
    return {
      membershipId: member.membershipId,
      employeeId: member.employeeId,
      employeeName: member.employeeName,
      jobTitle: member.jobTitle,
      role: member.role,
      notes: member.notes,
      startDate: member.startDate,
      endDate: member.endDate,
      status: member.status as EmployeeProjectAssignmentStatus,
      totalHours: hours?.totalHours ?? '0',
      entryCount: hours?.entryCount ?? 0,
    };
  });
}

/** Active formal assignments for an employee, with optional logged hours as secondary display. */
export async function listFormalEmployeeProjects(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<EmployeeProjectLink[]> {
  const memberships = await db
    .select({
      membershipId: employeeProjectAssignments.id,
      projectId: employeeProjectAssignments.projectId,
      projectName: projects.name,
      role: employeeProjectAssignments.role,
      startDate: employeeProjectAssignments.startDate,
      endDate: employeeProjectAssignments.endDate,
      status: employeeProjectAssignments.status,
    })
    .from(employeeProjectAssignments)
    .innerJoin(projects, eq(employeeProjectAssignments.projectId, projects.id))
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.employeeId, employeeId),
        eq(employeeProjectAssignments.status, 'active'),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(asc(projects.name));

  if (memberships.length === 0) return [];

  const projectIds = memberships.map((row) => row.projectId);
  const hourRows = await db
    .select({
      projectId: timeEntries.projectId,
      totalHours: sql<string>`coalesce(sum(${timeEntries.hours}), 0)::text`,
      entryCount: sql<number>`count(*)::int`,
      lastWorkDate: sql<string>`max(${timeEntries.workDate})::text`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.organizationId, organizationId),
        eq(timeEntries.employeeId, employeeId),
        eq(timeEntries.kind, 'project'),
        isNull(timeEntries.archivedAt),
        inArray(timeEntries.projectId, projectIds),
      ),
    )
    .groupBy(timeEntries.projectId)
    .orderBy(desc(sql`max(${timeEntries.workDate})`));

  const hoursByProject = new Map(
    hourRows
      .filter((row): row is typeof row & { projectId: string } => typeof row.projectId === 'string')
      .map((row) => [
        row.projectId,
        {
          totalHours: row.totalHours,
          entryCount: row.entryCount,
          lastWorkDate: row.lastWorkDate,
        },
      ]),
  );

  return memberships.map((membership) => {
    const hours = hoursByProject.get(membership.projectId);
    return {
      membershipId: membership.membershipId,
      projectId: membership.projectId,
      projectName: membership.projectName,
      role: membership.role,
      startDate: membership.startDate,
      endDate: membership.endDate,
      status: membership.status as EmployeeProjectAssignmentStatus,
      totalHours: hours?.totalHours ?? '0',
      entryCount: hours?.entryCount ?? 0,
      lastWorkDate: hours?.lastWorkDate ?? null,
    };
  });
}

/** Non-active assignments for a project (history). Hours optional secondary display. */
export async function listProjectAssignmentHistory(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectTeamMemberSummary[]> {
  const members = await db
    .select({
      membershipId: employeeProjectAssignments.id,
      employeeId: employeeProjectAssignments.employeeId,
      employeeName: employees.name,
      jobTitle: employees.jobTitle,
      role: employeeProjectAssignments.role,
      notes: employeeProjectAssignments.notes,
      startDate: employeeProjectAssignments.startDate,
      endDate: employeeProjectAssignments.endDate,
      status: employeeProjectAssignments.status,
    })
    .from(employeeProjectAssignments)
    .innerJoin(employees, eq(employeeProjectAssignments.employeeId, employees.id))
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.projectId, projectId),
        ne(employeeProjectAssignments.status, 'active'),
      ),
    )
    .orderBy(desc(employeeProjectAssignments.startDate));

  return members.map((member) => ({
    membershipId: member.membershipId,
    employeeId: member.employeeId,
    employeeName: member.employeeName,
    jobTitle: member.jobTitle,
    role: member.role,
    notes: member.notes,
    startDate: member.startDate,
    endDate: member.endDate,
    status: member.status as EmployeeProjectAssignmentStatus,
    totalHours: '0',
    entryCount: 0,
  }));
}

/** Non-active שיוכים for an employee (history). */
export async function listEmployeeAssignmentHistory(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<EmployeeProjectLink[]> {
  const memberships = await db
    .select({
      membershipId: employeeProjectAssignments.id,
      projectId: employeeProjectAssignments.projectId,
      projectName: projects.name,
      role: employeeProjectAssignments.role,
      startDate: employeeProjectAssignments.startDate,
      endDate: employeeProjectAssignments.endDate,
      status: employeeProjectAssignments.status,
    })
    .from(employeeProjectAssignments)
    .innerJoin(projects, eq(employeeProjectAssignments.projectId, projects.id))
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.employeeId, employeeId),
        ne(employeeProjectAssignments.status, 'active'),
      ),
    )
    .orderBy(desc(employeeProjectAssignments.startDate));

  return memberships.map((membership) => ({
    membershipId: membership.membershipId,
    projectId: membership.projectId,
    projectName: membership.projectName,
    role: membership.role,
    startDate: membership.startDate,
    endDate: membership.endDate,
    status: membership.status as EmployeeProjectAssignmentStatus,
    totalHours: '0',
    entryCount: 0,
    lastWorkDate: null,
  }));
}

/** @deprecated Prefer listActiveAssignedEmployeeIds — kept for call-site compatibility. */
export const listProjectTeamMemberIds = listActiveAssignedEmployeeIds;
