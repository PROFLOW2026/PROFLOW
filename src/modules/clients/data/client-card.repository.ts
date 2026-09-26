import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { crmLeads, crmOpportunities, crmProspects, tasks } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

const TASK_CAP = 20;
const CRM_CAP = 20;

export interface ClientProjectTaskRow {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: string;
  readonly dueDate: string | null;
}

export interface ClientCrmOpportunityRow {
  readonly id: string;
  readonly name: string;
  readonly stage: string;
  readonly status: string;
}

export interface ClientCrmProspectRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

export interface ClientCrmLeadRow {
  readonly id: string;
  readonly title: string;
  readonly status: string;
}

export interface ClientCrmHistoryRows {
  readonly opportunities: ClientCrmOpportunityRow[];
  readonly prospects: ClientCrmProspectRow[];
  readonly leads: ClientCrmLeadRow[];
}

/** Tasks attributed to the given projects. There is no client column on tasks. */
export async function listTasksForProjectIds(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  limit = TASK_CAP,
): Promise<ClientProjectTaskRow[]> {
  if (projectIds.length === 0) return [];

  const rows = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      title: tasks.title,
      status: tasks.status,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.organizationId, organizationId),
        inArray(tasks.projectId, [...projectIds]),
        eq(tasks.isArchived, false),
      ),
    )
    .orderBy(desc(tasks.updatedAt))
    .limit(limit);

  return rows.flatMap((row) =>
    row.projectId
      ? [
          {
            id: row.id,
            projectId: row.projectId,
            title: row.title,
            status: row.status,
            dueDate: row.dueDate,
          },
        ]
      : [],
  );
}

/**
 * CRM rows that already point at this client via convertedClientId.
 * Leads have no client column; they are included when their prospect converted here.
 */
export async function listCrmHistoryForClient(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
): Promise<ClientCrmHistoryRows> {
  const [opportunities, prospects, leads] = await Promise.all([
    db
      .select({
        id: crmOpportunities.id,
        name: crmOpportunities.name,
        stage: crmOpportunities.stage,
        status: crmOpportunities.status,
      })
      .from(crmOpportunities)
      .where(
        and(
          eq(crmOpportunities.organizationId, organizationId),
          eq(crmOpportunities.convertedClientId, clientId),
          isNull(crmOpportunities.archivedAt),
        ),
      )
      .orderBy(desc(crmOpportunities.updatedAt))
      .limit(CRM_CAP),
    db
      .select({
        id: crmProspects.id,
        name: crmProspects.name,
        status: crmProspects.status,
      })
      .from(crmProspects)
      .where(
        and(
          eq(crmProspects.organizationId, organizationId),
          eq(crmProspects.convertedClientId, clientId),
          isNull(crmProspects.archivedAt),
        ),
      )
      .orderBy(desc(crmProspects.updatedAt))
      .limit(CRM_CAP),
    db
      .select({
        id: crmLeads.id,
        title: crmLeads.title,
        status: crmLeads.status,
      })
      .from(crmLeads)
      .innerJoin(
        crmProspects,
        and(
          eq(crmLeads.prospectId, crmProspects.id),
          eq(crmProspects.organizationId, organizationId),
        ),
      )
      .where(
        and(
          eq(crmLeads.organizationId, organizationId),
          eq(crmProspects.convertedClientId, clientId),
          isNull(crmLeads.archivedAt),
        ),
      )
      .orderBy(desc(crmLeads.updatedAt))
      .limit(CRM_CAP),
  ]);

  return { opportunities, prospects, leads };
}
