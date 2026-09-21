import 'server-only';

import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import {
  employeeProjectAssignments,
  employees,
  organizationMemberships,
  profiles,
  projectAccessGrants,
} from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { NotFoundError } from '@/shared/errors';
import { assertAnyPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { DbExecutor } from '@/shared/db/types';
import { findProjectById } from '@/modules/projects';
import { getStoredProjectAccessMode } from '../data/project-access.repository';
import { assertCanAccessProject } from './project-access';
import {
  formatProjectParticipantAssigneeKey,
  isProjectManagerRole,
  type TaskAssigneeActor,
} from '../domain/project-participants';

export {
  formatProjectParticipantAssigneeKey,
  isProjectManagerRole,
  parseProjectParticipantAssigneeKey,
  PROJECT_MANAGER_ROLE_VALUE,
  type TaskAssigneeActor,
} from '../domain/project-participants';

export type ProjectParticipantKind = 'employee' | 'org_member';

export interface ProjectParticipant {
  readonly participantKey: string;
  readonly kind: ProjectParticipantKind;
  readonly employeeId: string | null;
  readonly orgMemberId: string | null;
  readonly userId: string | null;
  readonly displayName: string;
  readonly jobTitle: string | null;
  readonly assignmentRole: string | null;
  readonly isProjectManager: boolean;
}

export interface ProjectParticipantAssigneeOption {
  /** Stable picker key: `e:<employeeId>` or `m:<orgMemberId>`. */
  readonly key: string;
  readonly employeeId: string | null;
  readonly orgMemberId: string | null;
  readonly displayName: string;
  readonly jobTitle: string | null;
  readonly avatarUrl: string | null;
}

function upsertParticipant(
  map: Map<string, ProjectParticipant>,
  participant: ProjectParticipant,
): void {
  const existing = map.get(participant.participantKey);
  if (!existing) {
    map.set(participant.participantKey, participant);
    return;
  }
  map.set(participant.participantKey, {
    ...existing,
    assignmentRole: existing.assignmentRole ?? participant.assignmentRole,
    isProjectManager: existing.isProjectManager || participant.isProjectManager,
    jobTitle: existing.jobTitle ?? participant.jobTitle,
  });
}

/**
 * Effective project participants for a project:
 * active assignments + project_access_grants + org-wide access mode (`all`).
 * Deduplicates linked employee + org_member identities by userId (employee wins).
 */
export async function listEffectiveProjectParticipants(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  timezone: string,
): Promise<ProjectParticipant[]> {
  const mode = await getStoredProjectAccessMode(db, organizationId);
  const today = todayInTimeZone(timezone);
  const byUserId = new Map<string, ProjectParticipant>();
  const withoutUser = new Map<string, ProjectParticipant>();

  const assignmentRows = await db
    .select({
      employeeId: employees.id,
      userId: employees.userId,
      name: employees.name,
      jobTitle: employees.jobTitle,
      role: employeeProjectAssignments.role,
    })
    .from(employeeProjectAssignments)
    .innerJoin(
      employees,
      and(
        eq(employees.id, employeeProjectAssignments.employeeId),
        eq(employees.organizationId, employeeProjectAssignments.organizationId),
      ),
    )
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.projectId, projectId),
        eq(employeeProjectAssignments.status, 'active'),
        lte(employeeProjectAssignments.startDate, today),
        or(
          isNull(employeeProjectAssignments.endDate),
          sql`${employeeProjectAssignments.endDate} >= ${today}`,
        ),
        isNull(employees.archivedAt),
      ),
    );

  for (const row of assignmentRows) {
    const participant: ProjectParticipant = {
      participantKey: `employee:${row.employeeId}`,
      kind: 'employee',
      employeeId: row.employeeId,
      orgMemberId: null,
      userId: row.userId,
      displayName: row.name,
      jobTitle: row.jobTitle,
      assignmentRole: row.role,
      isProjectManager: isProjectManagerRole(row.role),
    };
    if (row.userId) {
      upsertParticipant(byUserId, participant);
    } else {
      upsertParticipant(withoutUser, participant);
    }
  }

  const grantRows = await db
    .select({
      orgMemberId: organizationMemberships.id,
      userId: organizationMemberships.userId,
      displayName: profiles.displayName,
      email: profiles.email,
      employeeId: employees.id,
      employeeName: employees.name,
      jobTitle: employees.jobTitle,
    })
    .from(projectAccessGrants)
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.userId, projectAccessGrants.userId),
        eq(organizationMemberships.organizationId, projectAccessGrants.organizationId),
      ),
    )
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .leftJoin(
      employees,
      and(
        eq(employees.userId, organizationMemberships.userId),
        eq(employees.organizationId, organizationMemberships.organizationId),
        isNull(employees.archivedAt),
      ),
    )
    .where(
      and(
        eq(projectAccessGrants.organizationId, organizationId),
        eq(projectAccessGrants.projectId, projectId),
        eq(organizationMemberships.status, 'active'),
      ),
    );

  for (const row of grantRows) {
    if (row.userId && [...byUserId.values()].some((participant) => participant.userId === row.userId)) {
      continue;
    }
    if (row.employeeId) {
      const participant: ProjectParticipant = {
        participantKey: `employee:${row.employeeId}`,
        kind: 'employee',
        employeeId: row.employeeId,
        orgMemberId: null,
        userId: row.userId,
        displayName: row.employeeName ?? row.displayName ?? row.email ?? 'Employee',
        jobTitle: row.jobTitle,
        assignmentRole: null,
        isProjectManager: false,
      };
      if (row.userId) upsertParticipant(byUserId, participant);
      else upsertParticipant(withoutUser, participant);
      continue;
    }

    const participant: ProjectParticipant = {
      participantKey: `member:${row.orgMemberId}`,
      kind: 'org_member',
      employeeId: null,
      orgMemberId: row.orgMemberId,
      userId: row.userId,
      displayName: row.displayName ?? row.email ?? 'Member',
      jobTitle: null,
      assignmentRole: null,
      isProjectManager: false,
    };
    if (row.userId) upsertParticipant(byUserId, participant);
    else upsertParticipant(withoutUser, participant);
  }

  if (mode === 'all') {
    const allEmployees = await db
      .select({
        employeeId: employees.id,
        userId: employees.userId,
        name: employees.name,
        jobTitle: employees.jobTitle,
      })
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, organizationId),
          eq(employees.status, 'active'),
          isNull(employees.archivedAt),
        ),
      );

    for (const row of allEmployees) {
      const participant: ProjectParticipant = {
        participantKey: `employee:${row.employeeId}`,
        kind: 'employee',
        employeeId: row.employeeId,
        orgMemberId: null,
        userId: row.userId,
        displayName: row.name,
        jobTitle: row.jobTitle,
        assignmentRole: null,
        isProjectManager: false,
      };
      if (row.userId) upsertParticipant(byUserId, participant);
      else upsertParticipant(withoutUser, participant);
    }

    const memberRows = await db
      .select({
        orgMemberId: organizationMemberships.id,
        userId: organizationMemberships.userId,
        displayName: profiles.displayName,
        email: profiles.email,
      })
      .from(organizationMemberships)
      .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.status, 'active'),
        ),
      );

    for (const row of memberRows) {
      if (row.userId && [...byUserId.values()].some((p) => p.userId === row.userId)) continue;
      const participant: ProjectParticipant = {
        participantKey: `member:${row.orgMemberId}`,
        kind: 'org_member',
        employeeId: null,
        orgMemberId: row.orgMemberId,
        userId: row.userId,
        displayName: row.displayName ?? row.email ?? 'Member',
        jobTitle: null,
        assignmentRole: null,
        isProjectManager: false,
      };
      if (row.userId) upsertParticipant(byUserId, participant);
      else upsertParticipant(withoutUser, participant);
    }
  }

  return [...byUserId.values(), ...withoutUser.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  );
}

export function participantToAssigneeOption(
  participant: ProjectParticipant,
): ProjectParticipantAssigneeOption {
  return {
    key: formatProjectParticipantAssigneeKey(participant),
    employeeId: participant.employeeId,
    orgMemberId: participant.orgMemberId,
    displayName: participant.displayName,
    jobTitle: participant.jobTitle,
    avatarUrl: null,
  };
}

export async function listProjectParticipantAssigneeOptions(
  context: OrgContext,
  projectId: string,
): Promise<ProjectParticipantAssigneeOption[]> {
  assertAnyPermission(context, [PERMISSIONS.PROJECTS_READ, PERMISSIONS.TASKS_READ]);
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  await assertCanAccessProject(context, projectId);

  const participants = await listEffectiveProjectParticipants(
    context.db,
    context.organizationId,
    projectId,
    context.organization.timezone,
  );
  return participants.map(participantToAssigneeOption);
}

export async function isActorProjectParticipant(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  timezone: string,
  actor: TaskAssigneeActor,
): Promise<boolean> {
  const participants = await listEffectiveProjectParticipants(
    db,
    organizationId,
    projectId,
    timezone,
  );
  return participants.some(
    (participant) =>
      (actor.employeeId && participant.employeeId === actor.employeeId) ||
      (actor.orgMemberId && participant.orgMemberId === actor.orgMemberId),
  );
}

export async function resolveProjectParticipantAssigneeKeys(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  timezone: string,
): Promise<string[]> {
  const participants = await listEffectiveProjectParticipants(
    db,
    organizationId,
    projectId,
    timezone,
  );
  return participants.map((participant) => formatProjectParticipantAssigneeKey(participant));
}
