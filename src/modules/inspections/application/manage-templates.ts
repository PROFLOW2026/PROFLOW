import { randomUUID } from 'node:crypto';
import { parseOrThrow } from '@/modules/defects/validation/schemas';
import { assertProjectCapability, PROJECT_CAPABILITIES } from '@/modules/project-team';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { archiveCustomTemplate, findCustomTemplate, insertCustomTemplate } from '../data/inspections.repository';
import { createTemplateSchema, type CreateTemplateInput } from '../validation/schemas';

/** Project templates need quality.manage; organization-wide templates need project_team.admin. */
async function assertTemplateScope(context: OrgContext, projectId: string | null): Promise<void> {
  if (projectId) {
    await assertProjectCapability(context, projectId, PROJECT_CAPABILITIES.QUALITY_MANAGE);
  } else {
    assertPermission(context, PERMISSIONS.PROJECT_TEAM_ADMIN);
  }
}

export async function createInspectionTemplate(
  context: OrgContext,
  raw: CreateTemplateInput,
): Promise<{ templateId: string }> {
  const input = parseOrThrow(createTemplateSchema, raw);
  const projectId = input.projectId ?? null;
  await assertTemplateScope(context, projectId);
  const templateId = randomUUID();
  await insertCustomTemplate(
    context.db,
    {
      id: templateId,
      organizationId: context.organizationId,
      projectId,
      name: input.name,
      category: input.category,
      description: input.description,
      createdByUserId: context.userId,
    },
    input.items,
  );
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.QUALITY_TEMPLATE_CREATED,
    entityType: 'quality_inspection_template',
    entityId: templateId,
    after: { name: input.name, category: input.category, projectId, itemCount: input.items.length },
  });
  return { templateId };
}

export async function archiveInspectionTemplate(context: OrgContext, templateId: string): Promise<void> {
  const template = await findCustomTemplate(context.db, context.organizationId, templateId);
  if (!template) throw new NotFoundError('quality_inspection_template');
  await assertTemplateScope(context, template.projectId);
  const archived = await archiveCustomTemplate(context.db, context.organizationId, templateId);
  if (!archived) throw new NotFoundError('quality_inspection_template');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.QUALITY_TEMPLATE_ARCHIVED,
    entityType: 'quality_inspection_template',
    entityId: templateId,
    before: { name: template.name, projectId: template.projectId },
  });
}
