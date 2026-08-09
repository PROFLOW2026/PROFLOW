import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type {
  CustomFieldEntityType,
  CustomFieldValueRecord,
  CustomFieldValueView,
} from '../domain/types';
import {
  findDefinitionById,
  listDefinitions,
  listValuesForEntity,
  upsertValue,
} from '../data/custom-fields.repository';
import { upsertValueSchema, type UpsertValueInput } from '../validation/schemas';

const ENTITY_READ_PERMISSION: Record<CustomFieldEntityType, PermissionKey> = {
  client: PERMISSIONS.CLIENTS_READ,
  project: PERMISSIONS.PROJECTS_READ,
  vendor: PERMISSIONS.VENDORS_READ,
  employee: PERMISSIONS.WORKFORCE_READ,
  opportunity: PERMISSIONS.CRM_READ,
  expense: PERMISSIONS.EXPENSES_READ,
};

function assertEntityRead(context: OrgContext, entityType: CustomFieldEntityType): void {
  assertPermission(context, ENTITY_READ_PERMISSION[entityType]);
}

export async function upsertCustomFieldValue(
  context: OrgContext,
  rawInput: UpsertValueInput,
): Promise<CustomFieldValueRecord> {
  const parsed = upsertValueSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const definition = await findDefinitionById(
    context.db,
    context.organizationId,
    input.definitionId,
  );
  if (!definition || definition.archivedAt) throw new NotFoundError('Custom field');

  assertEntityRead(context, definition.entityType);

  // Writing values requires the same read permission for the entity; definition
  // management stays on CUSTOM_FIELDS_MANAGE. Entity manage is not required so
  // forms can save optional attributes lightly.
  if (definition.fieldType === 'boolean' && input.valueBool === undefined) {
    throw new DomainRuleError('Boolean value required', 'errors.validationFailed');
  }

  return upsertValue(context.db, {
    organizationId: context.organizationId,
    definitionId: input.definitionId,
    entityId: input.entityId,
    valueText: input.valueText ?? null,
    valueNumber: input.valueNumber ?? null,
    valueBool: input.valueBool ?? null,
    valueDate: input.valueDate ?? null,
    valueJson: input.valueJson ?? null,
  });
}

export async function listCustomFieldValuesForEntity(
  context: OrgContext,
  entityType: CustomFieldEntityType,
  entityId: string,
): Promise<CustomFieldValueView[]> {
  assertEntityRead(context, entityType);

  const [definitions, values] = await Promise.all([
    listDefinitions(context.db, context.organizationId, entityType),
    listValuesForEntity(context.db, context.organizationId, entityId),
  ]);

  const byDefinition = new Map(values.map((value) => [value.definitionId, value]));

  return definitions.map((definition) => ({
    definition,
    value: byDefinition.get(definition.id) ?? null,
  }));
}
