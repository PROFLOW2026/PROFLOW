import 'server-only';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { employees } from '@drizzle/schema';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findOrgProjectTaskTemplateById,
  insertOrgProjectTaskTemplate,
  listOrgProjectTaskTemplateSummaries,
  listTemplateAssigneeEmployeeIds,
  nextOrgProjectTaskTemplatePosition,
  replaceTemplateAssigneeEmployeeIds,
  updateOrgProjectTaskTemplateById,
} from '../data/org-project-task-templates.repository';
import type { OrgProjectTaskTemplateSummary } from '../domain/types';
import { applyOrgProjectTaskTemplateRetroactive } from './apply-org-project-task-template-retroactive';

export type TemplateApplyScope = 'future_only' | 'existing_tasks';

export interface UpsertOrgProjectTaskTemplateInput {
  readonly title: string;
  readonly description?: string | null;
  readonly defaultAssigneeEmployeeIds?: readonly string[];
  readonly isEnabled?: boolean;
  readonly applyScope?: TemplateApplyScope;
}

async function assertEmployeesInOrg(
  context: OrgContext,
  employeeIds: readonly string[],
): Promise<string[]> {
  const uniqueIds = [...new Set(employeeIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const rows = await context.db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, context.organizationId),
        inArray(employees.id, uniqueIds),
        eq(employees.status, 'active'),
        isNull(employees.archivedAt),
      ),
    );

  const validIds = new Set(rows.map((row) => row.id));
  for (const employeeId of uniqueIds) {
    if (!validIds.has(employeeId)) {
      throw new ValidationError([
        { path: 'defaultAssigneeEmployeeIds', message: 'Employee not found in organization' },
      ]);
    }
  }

  return uniqueIds;
}

function assigneeSetsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

export async function listOrgProjectTaskTemplatesForSettings(
  context: OrgContext,
  options?: { includeArchived?: boolean },
): Promise<OrgProjectTaskTemplateSummary[]> {
  assertPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE);
  return listOrgProjectTaskTemplateSummaries(context.db, context.organizationId, options);
}

export async function createOrgProjectTaskTemplate(
  context: OrgContext,
  input: UpsertOrgProjectTaskTemplateInput,
): Promise<{ templateId: string }> {
  assertPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE);

  const title = input.title.trim();
  if (!title) {
    throw new ValidationError([{ path: 'title', message: 'Title is required' }]);
  }

  const assigneeIds = await assertEmployeesInOrg(context, input.defaultAssigneeEmployeeIds ?? []);

  const position = await nextOrgProjectTaskTemplatePosition(context.db, context.organizationId);
  const template = await insertOrgProjectTaskTemplate(context.db, {
    organizationId: context.organizationId,
    title,
    description: input.description?.trim() || null,
    position,
  });

  await replaceTemplateAssigneeEmployeeIds(
    context.db,
    context.organizationId,
    template.id,
    assigneeIds,
  );

  await recordAuditEvent(context, {
    action: 'settings.updated',
    entityType: 'org_project_task_template',
    entityId: template.id,
    after: { title: template.title, isEnabled: template.isEnabled, assigneeCount: assigneeIds.length },
  });

  return { templateId: template.id };
}

export async function updateOrgProjectTaskTemplate(
  context: OrgContext,
  templateId: string,
  input: UpsertOrgProjectTaskTemplateInput,
): Promise<void> {
  assertPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE);

  const existing = await findOrgProjectTaskTemplateById(
    context.db,
    context.organizationId,
    templateId,
  );
  if (!existing || existing.isArchived) throw new NotFoundError('Template');

  const title = input.title.trim();
  if (!title) {
    throw new ValidationError([{ path: 'title', message: 'Title is required' }]);
  }

  const assigneeIds = await assertEmployeesInOrg(context, input.defaultAssigneeEmployeeIds ?? []);
  const previousAssigneeIds = await listTemplateAssigneeEmployeeIds(
    context.db,
    context.organizationId,
    templateId,
  );

  const description = input.description?.trim() || null;
  const isEnabled = input.isEnabled ?? existing.isEnabled;
  const applyScope = input.applyScope ?? 'future_only';

  const meaningfulChange =
    existing.title !== title ||
    (existing.description ?? null) !== description ||
    !assigneeSetsEqual(previousAssigneeIds, assigneeIds);

  await updateOrgProjectTaskTemplateById(context.db, context.organizationId, templateId, {
    title,
    description,
    isEnabled,
  });

  await replaceTemplateAssigneeEmployeeIds(
    context.db,
    context.organizationId,
    templateId,
    assigneeIds,
  );

  if (meaningfulChange && applyScope === 'existing_tasks') {
    await applyOrgProjectTaskTemplateRetroactive(context, templateId, {
      title,
      description,
      defaultAssigneeEmployeeIds: assigneeIds,
    });
  }

  await recordAuditEvent(context, {
    action: 'settings.updated',
    entityType: 'org_project_task_template',
    entityId: templateId,
    after: { title, isEnabled, applyScope, assigneeCount: assigneeIds.length },
  });
}

export async function setOrgProjectTaskTemplateEnabled(
  context: OrgContext,
  templateId: string,
  isEnabled: boolean,
): Promise<void> {
  assertPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE);

  const updated = await updateOrgProjectTaskTemplateById(
    context.db,
    context.organizationId,
    templateId,
    { isEnabled },
  );
  if (!updated) throw new NotFoundError('Template');
}

export async function archiveOrgProjectTaskTemplate(
  context: OrgContext,
  templateId: string,
  restore = false,
): Promise<void> {
  assertPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE);

  const updated = await updateOrgProjectTaskTemplateById(
    context.db,
    context.organizationId,
    templateId,
    {
      isArchived: !restore,
      archivedAt: restore ? null : new Date(),
      isEnabled: restore ? true : false,
    },
  );
  if (!updated) throw new NotFoundError('Template');
}
