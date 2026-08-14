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
  SEARCHABLE_CUSTOM_FIELD_TYPES,
  isSearchableCustomFieldType,
  isSearchableCustomFieldDefinition,
  searchableTextsFromCustomField,
  customFieldsMatchQuery,
} from './domain/searchable';
export type {
  SearchableCustomFieldType,
  SearchableCustomFieldDefinition,
  SearchableCustomFieldValue,
  SearchableCustomFieldPair,
} from './domain/searchable';

export {
  assertCustomFieldValueValid,
  assertSelectOptionsConfig,
  parseSelectOptions,
} from './domain/validate-value';
export type { CustomFieldValuePayload } from './domain/validate-value';

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

/** SQL predicate for org-list search against searchable custom field values. */
export { existsSearchableCustomFieldValueSql } from './data/searchable-match';
