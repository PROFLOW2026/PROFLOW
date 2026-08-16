/**
 * Which custom field values may participate in entity search / list `q=`.
 *
 * Text-like only (stored text and select labels). Money, numbers, dates,
 * booleans, references, reserved financial keys, and archived definitions
 * never contribute searchable text - so Actual / profit / rates cannot leak
 * through search hits.
 */

import { isReservedCustomFieldKey } from './reserved-keys';
import type { CustomFieldType } from './types';

export const SEARCHABLE_CUSTOM_FIELD_TYPES = ['text', 'select'] as const;

export type SearchableCustomFieldType = (typeof SEARCHABLE_CUSTOM_FIELD_TYPES)[number];

export function isSearchableCustomFieldType(
  fieldType: CustomFieldType,
): fieldType is SearchableCustomFieldType {
  return (SEARCHABLE_CUSTOM_FIELD_TYPES as readonly CustomFieldType[]).includes(fieldType);
}

export interface SearchableCustomFieldDefinition {
  readonly fieldType: CustomFieldType;
  readonly key: string;
  readonly archivedAt?: Date | null;
}

export interface SearchableCustomFieldValue {
  readonly valueText?: string | null;
  readonly valueNumber?: string | null;
  readonly valueJson?: unknown;
}

export interface SearchableCustomFieldPair {
  readonly definition: SearchableCustomFieldDefinition;
  readonly value: SearchableCustomFieldValue | null;
}

export function isSearchableCustomFieldDefinition(
  definition: SearchableCustomFieldDefinition,
): boolean {
  if (definition.archivedAt) return false;
  if (isReservedCustomFieldKey(definition.key)) return false;
  return isSearchableCustomFieldType(definition.fieldType);
}

/** Selectable strings only - never valueNumber (money/number) or JSON. */
export function searchableTextsFromCustomField(
  definition: SearchableCustomFieldDefinition,
  value: SearchableCustomFieldValue | null,
): string[] {
  if (!value || !isSearchableCustomFieldDefinition(definition)) return [];
  const text = value.valueText?.trim();
  return text ? [text] : [];
}

export function customFieldsMatchQuery(
  query: string,
  fields: readonly SearchableCustomFieldPair[],
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return false;
  return fields.some((field) =>
    searchableTextsFromCustomField(field.definition, field.value).some((text) =>
      text.toLowerCase().includes(needle),
    ),
  );
}
