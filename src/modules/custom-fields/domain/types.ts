/**
 * Governed custom fields (doc 35).
 */

export const CUSTOM_FIELD_ENTITY_TYPES = [
  'client',
  'project',
  'vendor',
  'employee',
  'opportunity',
  'expense',
] as const;

export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

export const CUSTOM_FIELD_TYPES = [
  'text',
  'number',
  'money',
  'date',
  'select',
  'multi_select',
  'boolean',
  'reference',
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export interface CustomFieldDefinitionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly entityType: CustomFieldEntityType;
  readonly key: string;
  readonly label: string;
  readonly fieldType: CustomFieldType;
  readonly config: Record<string, unknown>;
  readonly required: boolean;
  readonly sortOrder: number;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CustomFieldValueRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly definitionId: string;
  readonly entityId: string;
  readonly valueText: string | null;
  readonly valueNumber: string | null;
  readonly valueBool: boolean | null;
  readonly valueDate: string | null;
  readonly valueJson: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CustomFieldValueView {
  readonly definition: CustomFieldDefinitionRecord;
  readonly value: CustomFieldValueRecord | null;
}
