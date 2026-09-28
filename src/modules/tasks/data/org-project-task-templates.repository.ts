import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import {
  employees,
  orgProjectTaskTemplateAssignees,
  orgProjectTaskTemplates,
  tasks,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { OrgProjectTaskTemplate, OrgProjectTaskTemplateSummary } from '../domain/types';

function mapRow(row: typeof orgProjectTaskTemplates.$inferSelect): OrgProjectTaskTemplate {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    description: row.description ?? null,
    isEnabled: row.isEnabled,
    isArchived: row.isArchived,
    archivedAt: row.archivedAt ?? null,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listTemplateAssigneeEmployeeIds(
  db: DbExecutor,
  organizationId: string,
  templateId: string,
): Promise<string[]> {
  const rows = await db
    .select({ employeeId: orgProjectTaskTemplateAssignees.employeeId })
    .from(orgProjectTaskTemplateAssignees)
    .where(
      and(
        eq(orgProjectTaskTemplateAssignees.organizationId, organizationId),
        eq(orgProjectTaskTemplateAssignees.templateId, templateId),
      ),
    )
    .orderBy(asc(orgProjectTaskTemplateAssignees.createdAt));

  return rows.map((row) => row.employeeId);
}

export async function loadTemplateAssigneeEmployeeIdsMap(
  db: DbExecutor,
  organizationId: string,
  templateIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (templateIds.length === 0) return new Map();

  const rows = await db
    .select({
      templateId: orgProjectTaskTemplateAssignees.templateId,
      employeeId: orgProjectTaskTemplateAssignees.employeeId,
    })
    .from(orgProjectTaskTemplateAssignees)
    .where(
      and(
        eq(orgProjectTaskTemplateAssignees.organizationId, organizationId),
        inArray(orgProjectTaskTemplateAssignees.templateId, [...templateIds]),
      ),
    )
    .orderBy(asc(orgProjectTaskTemplateAssignees.createdAt));

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const current = map.get(row.templateId) ?? [];
    current.push(row.employeeId);
    map.set(row.templateId, current);
  }
  return map;
}

export async function replaceTemplateAssigneeEmployeeIds(
  db: DbExecutor,
  organizationId: string,
  templateId: string,
  employeeIds: readonly string[],
): Promise<void> {
  const uniqueIds = [...new Set(employeeIds)];

  await db
    .delete(orgProjectTaskTemplateAssignees)
    .where(
      and(
        eq(orgProjectTaskTemplateAssignees.organizationId, organizationId),
        eq(orgProjectTaskTemplateAssignees.templateId, templateId),
        uniqueIds.length > 0
          ? notInArray(orgProjectTaskTemplateAssignees.employeeId, uniqueIds)
          : sql`true`,
      ),
    );

  if (uniqueIds.length === 0) return;

  const existing = await listTemplateAssigneeEmployeeIds(db, organizationId, templateId);
  const existingSet = new Set(existing);
  const toInsert = uniqueIds.filter((id) => !existingSet.has(id));

  if (toInsert.length === 0) return;

  await db.insert(orgProjectTaskTemplateAssignees).values(
    toInsert.map((employeeId) => ({
      organizationId,
      templateId,
      employeeId,
    })),
  );
}

export async function listOrgProjectTaskTemplates(
  db: DbExecutor,
  organizationId: string,
  options?: { includeArchived?: boolean },
): Promise<OrgProjectTaskTemplate[]> {
  const conditions = [eq(orgProjectTaskTemplates.organizationId, organizationId)];
  if (!options?.includeArchived) {
    conditions.push(eq(orgProjectTaskTemplates.isArchived, false));
  }

  const rows = await db
    .select()
    .from(orgProjectTaskTemplates)
    .where(and(...conditions))
    .orderBy(asc(orgProjectTaskTemplates.position), asc(orgProjectTaskTemplates.createdAt));

  return rows.map(mapRow);
}

export async function listActiveOrgProjectTaskTemplates(
  db: DbExecutor,
  organizationId: string,
): Promise<Array<OrgProjectTaskTemplate & { defaultAssigneeEmployeeIds: string[] }>> {
  const templates = await listOrgProjectTaskTemplates(db, organizationId, {
    includeArchived: false,
  }).then((rows) => rows.filter((row) => row.isEnabled));

  const assigneeMap = await loadTemplateAssigneeEmployeeIdsMap(
    db,
    organizationId,
    templates.map((t) => t.id),
  );

  return templates.map((template) => ({
    ...template,
    defaultAssigneeEmployeeIds: assigneeMap.get(template.id) ?? [],
  }));
}

export async function findOrgProjectTaskTemplateById(
  db: DbExecutor,
  organizationId: string,
  templateId: string,
): Promise<OrgProjectTaskTemplate | null> {
  const [row] = await db
    .select()
    .from(orgProjectTaskTemplates)
    .where(
      and(
        eq(orgProjectTaskTemplates.id, templateId),
        eq(orgProjectTaskTemplates.organizationId, organizationId),
      ),
    )
    .limit(1);

  return row ? mapRow(row) : null;
}

export async function insertOrgProjectTaskTemplate(
  db: DbExecutor,
  input: {
    organizationId: string;
    title: string;
    description?: string | null;
    position?: number;
  },
): Promise<OrgProjectTaskTemplate> {
  const [row] = await db
    .insert(orgProjectTaskTemplates)
    .values({
      organizationId: input.organizationId,
      title: input.title,
      description: input.description ?? null,
      position: input.position ?? 0,
    })
    .returning();

  return mapRow(row!);
}

export async function updateOrgProjectTaskTemplateById(
  db: DbExecutor,
  organizationId: string,
  templateId: string,
  patch: Partial<{
    title: string;
    description: string | null;
    isEnabled: boolean;
    isArchived: boolean;
    archivedAt: Date | null;
    position: number;
  }>,
): Promise<OrgProjectTaskTemplate | null> {
  const [row] = await db
    .update(orgProjectTaskTemplates)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(orgProjectTaskTemplates.id, templateId),
        eq(orgProjectTaskTemplates.organizationId, organizationId),
      ),
    )
    .returning();

  return row ? mapRow(row) : null;
}

export async function findGeneratedTaskForProjectTemplate(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  templateId: string,
) {
  const [row] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.organizationId, organizationId),
        eq(tasks.projectId, projectId),
        eq(tasks.generatedFromOrgProjectTaskTemplateId, templateId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listOpenTasksGeneratedFromTemplate(
  db: DbExecutor,
  organizationId: string,
  templateId: string,
) {
  const terminal = ['done', 'cancelled'] as const;
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.organizationId, organizationId),
        eq(tasks.generatedFromOrgProjectTaskTemplateId, templateId),
        notInArray(tasks.status, [...terminal]),
        eq(tasks.isArchived, false),
      ),
    );
}

export async function listOrgProjectTaskTemplateSummaries(
  db: DbExecutor,
  organizationId: string,
  options?: { includeArchived?: boolean },
): Promise<OrgProjectTaskTemplateSummary[]> {
  const templates = await listOrgProjectTaskTemplates(db, organizationId, options);
  if (templates.length === 0) return [];

  const assigneeMap = await loadTemplateAssigneeEmployeeIdsMap(
    db,
    organizationId,
    templates.map((t) => t.id),
  );

  const employeeIds = [...new Set([...assigneeMap.values()].flat())];

  const employeeRows =
    employeeIds.length > 0
      ? await db
          .select({
            id: employees.id,
            name: employees.name,
            status: employees.status,
            archivedAt: employees.archivedAt,
          })
          .from(employees)
          .where(
            and(eq(employees.organizationId, organizationId), inArray(employees.id, employeeIds)),
          )
      : [];

  const employeeById = new Map(employeeRows.map((row) => [row.id, row]));

  return templates.map((template) => {
    const assigneeIds = assigneeMap.get(template.id) ?? [];
    const defaultAssignees = assigneeIds.map((employeeId) => {
      const employee = employeeById.get(employeeId);
      const invalid =
        !employee || employee.status !== 'active' || employee.archivedAt != null;
      return {
        employeeId,
        name: employee?.name ?? null,
        invalid,
      };
    });

    return {
      ...template,
      defaultAssigneeEmployeeIds: assigneeIds,
      defaultAssignees,
      defaultAssigneeInvalid: defaultAssignees.some((row) => row.invalid),
    };
  });
}

export async function nextOrgProjectTaskTemplatePosition(
  db: DbExecutor,
  organizationId: string,
): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${orgProjectTaskTemplates.position}), -1)` })
    .from(orgProjectTaskTemplates)
    .where(eq(orgProjectTaskTemplates.organizationId, organizationId));

  return (row?.max ?? -1) + 1;
}
