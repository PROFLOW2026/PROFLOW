import { and, eq, gte, isNotNull, isNull, lte, or } from 'drizzle-orm';
import {
  complianceArtifacts,
  crmOpportunities,
  employeeProjectAssignments,
  inspections,
  maintenanceRecords,
  planningWorkItems,
  projectMilestones,
  projectServiceDetails,
  warrantyCoverages,
} from '@drizzle/schema';
import { ORG_LIST_HARD_CAP, resolveListLimit } from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import { toStoredCalendarDate } from '../domain/aggregate';
import type { DatedCalendarSource } from '../domain/types';

const LIST_CAP = { hardCap: ORG_LIST_HARD_CAP };

async function safeQuery<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

export async function listExistingDatedSources(
  db: DbExecutor,
  organizationId: string,
  range: { from: string; to: string },
): Promise<DatedCalendarSource[]> {
  const sources: DatedCalendarSource[] = [];

  const workOrders = await safeQuery(() =>
    db
      .select({
        id: projectServiceDetails.id,
        projectId: projectServiceDetails.projectId,
        scheduledStartAt: projectServiceDetails.scheduledStartAt,
        notes: projectServiceDetails.notes,
      })
      .from(projectServiceDetails)
      .where(
        and(
          eq(projectServiceDetails.organizationId, organizationId),
          isNotNull(projectServiceDetails.scheduledStartAt),
        ),
      )
      .limit(resolveListLimit(undefined, LIST_CAP)),
  );
  for (const row of workOrders) {
    const date = toStoredCalendarDate(row.scheduledStartAt);
    if (!date || date < range.from || date > range.to) continue;
    sources.push({
      id: `work_order:${row.id}`,
      kind: 'work_order',
      source: 'existing',
      title: 'Service call',
      date,
      href: `/projects/${row.projectId}`,
      projectId: row.projectId,
      notes: row.notes,
    });
  }

  const inspectionRows = await safeQuery(() =>
    db
      .select({
        id: inspections.id,
        title: inspections.title,
        scheduledOn: inspections.scheduledOn,
        projectId: inspections.projectId,
        notes: inspections.notes,
      })
      .from(inspections)
      .where(
        and(
          eq(inspections.organizationId, organizationId),
          isNull(inspections.archivedAt),
          isNotNull(inspections.scheduledOn),
          gte(inspections.scheduledOn, range.from),
          lte(inspections.scheduledOn, range.to),
        ),
      )
      .limit(resolveListLimit(undefined, LIST_CAP)),
  );
  for (const row of inspectionRows) {
    sources.push({
      id: `inspection:${row.id}`,
      kind: 'inspection',
      source: 'existing',
      title: row.title,
      date: row.scheduledOn,
      href: `/projects/${row.projectId}`,
      projectId: row.projectId,
      notes: row.notes,
    });
  }

  const milestoneRows = await safeQuery(() =>
    db
      .select({
        id: projectMilestones.id,
        name: projectMilestones.name,
        targetDate: projectMilestones.targetDate,
        projectId: projectMilestones.projectId,
        notes: projectMilestones.notes,
      })
      .from(projectMilestones)
      .where(
        and(
          eq(projectMilestones.organizationId, organizationId),
          isNull(projectMilestones.archivedAt),
          isNotNull(projectMilestones.targetDate),
          gte(projectMilestones.targetDate, range.from),
          lte(projectMilestones.targetDate, range.to),
        ),
      )
      .limit(resolveListLimit(undefined, LIST_CAP)),
  );
  for (const row of milestoneRows) {
    sources.push({
      id: `milestone:${row.id}`,
      kind: 'milestone',
      source: 'existing',
      title: row.name,
      date: row.targetDate,
      href: `/projects/${row.projectId}`,
      projectId: row.projectId,
      notes: row.notes,
    });
  }

  const planningRows = await safeQuery(() =>
    db
      .select({
        id: planningWorkItems.id,
        name: planningWorkItems.name,
        startDate: planningWorkItems.startDate,
        targetEndDate: planningWorkItems.targetEndDate,
        projectId: planningWorkItems.projectId,
        kind: planningWorkItems.kind,
      })
      .from(planningWorkItems)
      .where(
        and(
          eq(planningWorkItems.organizationId, organizationId),
          isNull(planningWorkItems.archivedAt),
          or(isNotNull(planningWorkItems.startDate), isNotNull(planningWorkItems.targetEndDate)),
        ),
      )
      .limit(resolveListLimit(undefined, LIST_CAP)),
  );
  for (const row of planningRows) {
    const kind = row.kind === 'milestone' ? 'milestone' : 'task';
    if (row.startDate) {
      const date = toStoredCalendarDate(row.startDate);
      if (date && date >= range.from && date <= range.to) {
        sources.push({
          id: `planning-start:${row.id}`,
          kind,
          source: 'existing',
          title: row.name,
          date,
          href: `/projects/${row.projectId}?tab=schedule`,
          projectId: row.projectId,
        });
      }
    }
    if (row.targetEndDate) {
      const date = toStoredCalendarDate(row.targetEndDate);
      if (date && date >= range.from && date <= range.to) {
        sources.push({
          id: `planning-end:${row.id}`,
          kind,
          source: 'existing',
          title: row.name,
          date,
          href: `/projects/${row.projectId}?tab=schedule`,
          projectId: row.projectId,
        });
      }
    }
  }

  const assignmentRows = await safeQuery(() =>
    db
      .select({
        id: employeeProjectAssignments.id,
        projectId: employeeProjectAssignments.projectId,
        startDate: employeeProjectAssignments.startDate,
        endDate: employeeProjectAssignments.endDate,
        role: employeeProjectAssignments.role,
      })
      .from(employeeProjectAssignments)
      .where(eq(employeeProjectAssignments.organizationId, organizationId))
      .limit(resolveListLimit(undefined, LIST_CAP)),
  );
  for (const row of assignmentRows) {
    const start = toStoredCalendarDate(row.startDate);
    if (start && start >= range.from && start <= range.to) {
      sources.push({
        id: `assignment-start:${row.id}`,
        kind: 'assignment',
        source: 'existing',
        title: row.role?.trim() || 'Assignment',
        date: start,
        href: `/projects/${row.projectId}?tab=team`,
        projectId: row.projectId,
      });
    }
    const end = toStoredCalendarDate(row.endDate);
    if (end && end >= range.from && end <= range.to) {
      sources.push({
        id: `assignment-end:${row.id}`,
        kind: 'assignment',
        source: 'existing',
        title: row.role?.trim() || 'Assignment',
        date: end,
        href: `/projects/${row.projectId}?tab=team`,
        projectId: row.projectId,
      });
    }
  }

  const maintenanceRows = await safeQuery(() =>
    db
      .select({
        id: maintenanceRecords.id,
        title: maintenanceRecords.title,
        performedOn: maintenanceRecords.performedOn,
        notes: maintenanceRecords.notes,
      })
      .from(maintenanceRecords)
      .where(
        and(
          eq(maintenanceRecords.organizationId, organizationId),
          isNull(maintenanceRecords.archivedAt),
          isNotNull(maintenanceRecords.performedOn),
          gte(maintenanceRecords.performedOn, range.from),
          lte(maintenanceRecords.performedOn, range.to),
        ),
      )
      .limit(resolveListLimit(undefined, LIST_CAP)),
  );
  for (const row of maintenanceRows) {
    sources.push({
      id: `maintenance:${row.id}`,
      kind: 'maintenance',
      source: 'existing',
      title: row.title,
      date: row.performedOn,
      href: '/assets',
      notes: row.notes,
    });
  }

  const warrantyRows = await safeQuery(() =>
    db
      .select({
        id: warrantyCoverages.id,
        title: warrantyCoverages.title,
        endDate: warrantyCoverages.endDate,
        projectId: warrantyCoverages.projectId,
        notes: warrantyCoverages.notes,
      })
      .from(warrantyCoverages)
      .where(
        and(
          eq(warrantyCoverages.organizationId, organizationId),
          isNull(warrantyCoverages.archivedAt),
          isNotNull(warrantyCoverages.endDate),
          gte(warrantyCoverages.endDate, range.from),
          lte(warrantyCoverages.endDate, range.to),
        ),
      )
      .limit(resolveListLimit(undefined, LIST_CAP)),
  );
  for (const row of warrantyRows) {
    sources.push({
      id: `warranty:${row.id}`,
      kind: 'warranty',
      source: 'existing',
      title: row.title,
      date: row.endDate,
      href: '/warranty',
      projectId: row.projectId,
      notes: row.notes,
    });
  }

  const complianceRows = await safeQuery(() =>
    db
      .select({
        id: complianceArtifacts.id,
        name: complianceArtifacts.name,
        expiresOn: complianceArtifacts.expiresOn,
        notes: complianceArtifacts.notes,
      })
      .from(complianceArtifacts)
      .where(
        and(
          eq(complianceArtifacts.organizationId, organizationId),
          isNull(complianceArtifacts.archivedAt),
          isNotNull(complianceArtifacts.expiresOn),
          gte(complianceArtifacts.expiresOn, range.from),
          lte(complianceArtifacts.expiresOn, range.to),
        ),
      )
      .limit(resolveListLimit(undefined, LIST_CAP)),
  );
  for (const row of complianceRows) {
    sources.push({
      id: `compliance:${row.id}`,
      kind: 'compliance',
      source: 'existing',
      title: row.name,
      date: row.expiresOn,
      href: '/compliance',
      notes: row.notes,
    });
  }

  const crmRows = await safeQuery(() =>
    db
      .select({
        id: crmOpportunities.id,
        name: crmOpportunities.name,
        nextActionAt: crmOpportunities.nextActionAt,
        nextActionText: crmOpportunities.nextActionText,
      })
      .from(crmOpportunities)
      .where(
        and(
          eq(crmOpportunities.organizationId, organizationId),
          isNull(crmOpportunities.archivedAt),
          isNotNull(crmOpportunities.nextActionAt),
        ),
      )
      .limit(resolveListLimit(undefined, LIST_CAP)),
  );
  for (const row of crmRows) {
    const date = toStoredCalendarDate(row.nextActionAt);
    if (!date || date < range.from || date > range.to) continue;
    sources.push({
      id: `follow_up:${row.id}`,
      kind: 'follow_up',
      source: 'existing',
      title: row.nextActionText?.trim() || row.name,
      date,
      href: `/crm/${row.id}`,
      notes: row.nextActionText,
    });
  }

  return sources;
}
