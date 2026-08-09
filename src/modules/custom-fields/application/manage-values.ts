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
  entityExistsInOrganization,
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

/** Writes require entity manage/update — never read-only. */
const ENTITY_WRITE_PERMISSION: Record<CustomFieldEntityType, PermissionKey> = {
  client: PERMISSIONS.CLIENTS_MANAGE,
  project: PERMISSIONS.PROJECTS_UPDATE,
  vendor: PERMISSIONS.VENDORS_MANAGE,
  employee: PERMISSIONS.WORKFORCE_MANAGE,
  opportunity: PERMISSIONS.CRM_MANAGE,
  expense: PERMISSIONS.EXPENSES_UPDATE,
};

function assertEntityRead(context: OrgContext, entityType: CustomFieldEntityType): void {
  assertPermission(context, ENTITY_READ_PERMISSION[entityType]);
}

function assertEntityWrite(context: OrgContext, entityType: CustomFieldEntityType): void {
  assertPermission(context, ENTITY_WRITE_PERMISSION[entityType]);
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
