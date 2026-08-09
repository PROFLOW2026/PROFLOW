import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, timestamps } from './_shared';
import { organizations } from './tenancy';

/**
 * Governed custom fields (doc 35).
 * Cannot replace canonical financial/commercial fields.
 */

export const customFieldDefinitions = pgTable(
  'custom_field_definitions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    fieldType: text('field_type').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    required: boolean('required').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('custom_field_definitions_org_entity_key_uq').on(
      table.organizationId,
      table.entityType,
      table.key,
    ),
    check(
      'custom_field_definitions_entity_known',
      sql`${table.entityType} IN ('client', 'project', 'vendor', 'employee', 'opportunity', 'expense')`,
    ),
    check(
      'custom_field_definitions_type_known',
      sql`${table.fieldType} IN ('text', 'number', 'money', 'date', 'select', 'multi_select', 'boolean', 'reference')`,
    ),
  ],
);

export const customFieldValues = pgTable(
  'custom_field_values',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => customFieldDefinitions.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id').notNull(),
    valueText: text('value_text'),
    valueNumber: numeric('value_number', { precision: 18, scale: 6, mode: 'string' }),
    valueBool: boolean('value_bool'),
    valueDate: date('value_date'),
    valueJson: jsonb('value_json'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('custom_field_values_def_entity_uq').on(table.definitionId, table.entityId),
    index('custom_field_values_entity_idx').on(table.organizationId, table.entityId),
  ],
);
