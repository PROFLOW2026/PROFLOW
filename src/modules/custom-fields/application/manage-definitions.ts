import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { isReservedCustomFieldKey } from '../domain/reserved-keys';
import type { CustomFieldDefinitionRecord } from '../domain/types';
import {
  archiveDefinition as archiveDefinitionRow,
  findDefinitionById,
  insertDefinition,
  listDefinitions,
} from '../data/custom-fields.repository';
import {
  archiveDefinitionSchema,
  createDefinitionSchema,
  type ArchiveDefinitionInput,
  type CreateDefinitionInput,
} from '../validation/schemas';
import type { CustomFieldEntityType } from '../domain/types';

export async function createCustomFieldDefinition(
  context: OrgContext,
  rawInput: CreateDefinitionInput,
): Promise<CustomFieldDefinitionRecord> {
  assertPermission(context, PERMISSIONS.CUSTOM_FIELDS_MANAGE);

  const parsed = createDefinitionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  if (isReservedCustomFieldKey(input.key)) {
    throw new DomainRuleError(
      `Custom field key is reserved: ${input.key}`,
      'errors.validationFailed',
      { key: input.key },
    );
  }

  return insertDefinition(context.db, {
    organizationId: context.organizationId,
    entityType: input.entityType,
    key: input.key,
    label: input.label,
    fieldType: input.fieldType,
    config: input.config,
    required: input.required,
    sortOrder: input.sortOrder,
  });
}

export async function archiveCustomFieldDefinition(
  context: OrgContext,
  rawInput: ArchiveDefinitionInput,
): Promise<CustomFieldDefinitionRecord> {
  assertPermission(context, PERMISSIONS.CUSTOM_FIELDS_MANAGE);

  const parsed = archiveDefinitionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findDefinitionById(
    context.db,
    context.organizationId,
    parsed.data.definitionId,
  );
  if (!existing) throw new NotFoundError('Custom field');

  const archived = await archiveDefinitionRow(
    context.db,
    context.organizationId,
    parsed.data.definitionId,
  );
  if (!archived) throw new NotFoundError('Custom field');
  return archived;
}

export async function listCustomFieldDefinitions(
  context: OrgContext,
  entityType?: CustomFieldEntityType,
): Promise<CustomFieldDefinitionRecord[]> {
  assertPermission(context, PERMISSIONS.CUSTOM_FIELDS_MANAGE);
  return listDefinitions(context.db, context.organizationId, entityType);
}
