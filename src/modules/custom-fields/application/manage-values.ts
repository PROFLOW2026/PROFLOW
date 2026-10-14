import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import type { OrgContext } from '@/shared/auth/context';
import {
  CUSTOM_FIELD_ENTITY_READ_PERMISSION,
  CUSTOM_FIELD_ENTITY_WRITE_PERMISSION,
} from '../domain/entity-permissions';
import type {
  CustomFieldEntityType,
  CustomFieldValueRecord,
  CustomFieldValueView,
} from '../domain/types';
import { assertCustomFieldValueValid } from '../domain/validate-value';
import {
  entityExistsInOrganization,
  findDefinitionById,
  listDefinitions,
  listValuesForEntity,
  upsertValue,
} from '../data/custom-fields.repository';
import { upsertValueSchema, type UpsertValueInput } from '../validation/schemas';

function assertEntityRead(context: OrgContext, entityType: CustomFieldEntityType): void {
  assertPermission(context, CUSTOM_FIELD_ENTITY_READ_PERMISSION[entityType]);
}

function assertEntityWrite(context: OrgContext, entityType: CustomFieldEntityType): void {
  assertPermission(context, CUSTOM_FIELD_ENTITY_WRITE_PERMISSION[entityType]);
}

async function assertEntityInOrg(
  context: OrgContext,
  entityType: CustomFieldEntityType,
  entityId: string,
): Promise<void> {
  const exists = await entityExistsInOrganization(
    context.db,
    context.organizationId,
    entityType,
    entityId,
  );
  if (!exists) throw new NotFoundError('Entity');
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

  assertEntityWrite(context, definition.entityType);
  await assertEntityInOrg(context, definition.entityType, input.entityId);

  const payload = {
    valueText: input.valueText ?? null,
    valueNumber: input.valueNumber ?? null,
    valueBool: input.valueBool ?? null,
    valueDate: input.valueDate ?? null,
    valueJson: input.valueJson ?? null,
  };

  assertCustomFieldValueValid(definition, payload);

  return upsertValue(context.db, {
    organizationId: context.organizationId,
    definitionId: input.definitionId,
    entityId: input.entityId,
    ...payload,
  });
}

export async function listCustomFieldValuesForEntity(
  context: OrgContext,
  entityType: CustomFieldEntityType,
  entityId: string,
): Promise<CustomFieldValueView[]> {
  assertEntityRead(context, entityType);
  await assertEntityInOrg(context, entityType, entityId);

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
