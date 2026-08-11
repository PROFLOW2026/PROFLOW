import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { parseFormTemplateSchema } from '../domain/schema';
import type { FormTemplateRecord } from '../domain/types';
import {
  archiveTemplateById,
  findTemplateById,
  insertTemplate,
  listTemplates,
  updateTemplateById,
} from '../data/forms.repository';
import {
  archiveFormTemplateSchema,
  createFormTemplateSchema,
  updateFormTemplateSchema,
  type ArchiveFormTemplateInput,
  type CreateFormTemplateInput,
  type UpdateFormTemplateInput,
} from '../validation/schemas';

export async function listFormTemplatesForOrg(
  context: OrgContext,
  options: { readonly includeArchived?: boolean; readonly enabledOnly?: boolean } = {},
): Promise<FormTemplateRecord[]> {
  assertPermission(context, PERMISSIONS.FORMS_READ);
  return listTemplates(context.db, context.organizationId, options);
}

export async function getFormTemplateForOrg(
  context: OrgContext,
  templateId: string,
): Promise<FormTemplateRecord> {
  assertPermission(context, PERMISSIONS.FORMS_READ);
  const template = await findTemplateById(context.db, context.organizationId, templateId);
  if (!template) throw new NotFoundError('Form template');
  return template;
}

export async function createFormTemplate(
  context: OrgContext,
  raw: CreateFormTemplateInput,
): Promise<FormTemplateRecord> {
  assertPermission(context, PERMISSIONS.FORMS_MANAGE);
  const parsed = createFormTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const schema = parseFormTemplateSchema(parsed.data.schema);
  const template = await insertTemplate(context.db, {
    organizationId: context.organizationId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    category: parsed.data.category ?? null,
    schema,
    enabled: parsed.data.enabled ?? true,
  });

  await noteModuleUsage(context.db, context.organizationId, 'forms');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.FORM_TEMPLATE_CREATED,
    entityType: 'form_template',
    entityId: template.id,
    after: { id: template.id, name: template.name, enabled: template.enabled },
  });
  return template;
}

export async function updateFormTemplate(
  context: OrgContext,
  raw: UpdateFormTemplateInput,
): Promise<FormTemplateRecord> {
  assertPermission(context, PERMISSIONS.FORMS_MANAGE);
  const parsed = updateFormTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findTemplateById(
    context.db,
    context.organizationId,
    parsed.data.templateId,
  );
  if (!existing || existing.archivedAt) throw new NotFoundError('Form template');

  const schema =
    parsed.data.schema !== undefined ? parseFormTemplateSchema(parsed.data.schema) : undefined;

  const updated = await updateTemplateById(
    context.db,
    context.organizationId,
    parsed.data.templateId,
    {
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      schema,
      enabled: parsed.data.enabled,
    },
  );
  if (!updated) throw new NotFoundError('Form template');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.FORM_TEMPLATE_UPDATED,
    entityType: 'form_template',
    entityId: updated.id,
    before: { id: existing.id, name: existing.name, enabled: existing.enabled },
    after: { id: updated.id, name: updated.name, enabled: updated.enabled },
  });
  return updated;
}

export async function archiveFormTemplate(
  context: OrgContext,
  raw: ArchiveFormTemplateInput,
): Promise<FormTemplateRecord> {
  assertPermission(context, PERMISSIONS.FORMS_MANAGE);
  const parsed = archiveFormTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const archived = await archiveTemplateById(
    context.db,
    context.organizationId,
    parsed.data.templateId,
  );
  if (!archived) throw new NotFoundError('Form template');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.FORM_TEMPLATE_ARCHIVED,
    entityType: 'form_template',
    entityId: archived.id,
    after: { id: archived.id, archivedAt: archived.archivedAt },
  });
  return archived;
}
