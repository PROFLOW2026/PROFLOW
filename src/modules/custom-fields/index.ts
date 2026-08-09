/** Public API of governed custom fields (doc 35). */
export {
  createCustomFieldDefinition,
  archiveCustomFieldDefinition,
  listCustomFieldDefinitions,
} from './application/manage-definitions';
export {
  upsertCustomFieldValue,
  listCustomFieldValuesForEntity,
} from './application/manage-values';

export {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_TYPES,
} from './domain/types';
export type {
  CustomFieldEntityType,
  CustomFieldType,
  CustomFieldDefinitionRecord,
  CustomFieldValueRecord,
  CustomFieldValueView,
} from './domain/types';

export {
  RESERVED_CUSTOM_FIELD_KEYS,
  isReservedCustomFieldKey,
  assertCustomFieldKeyAllowed,
} from './domain/reserved-keys';

export {
  createDefinitionSchema,
  archiveDefinitionSchema,
  upsertValueSchema,
} from './validation/schemas';
export type {
  CreateDefinitionInput,
  ArchiveDefinitionInput,
  UpsertValueInput,
} from './validation/schemas';

export { EntityCustomFieldsPanel } from './ui/entity-custom-fields-panel';
export type { EntityFieldActionState } from './ui/entity-custom-fields-panel';
