import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, quantityAmount, timestamps } from './_shared';
import { organizations } from './tenancy';
import { profiles } from './identity';

/**
 * Field forms, operational usage, command-center state, recurring financial drafts.
 * Material/equipment usage is operational attribution — NOT automatic Actual.
 */

export const formTemplates = pgTable(
  'form_templates',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category'),
    schemaJson: jsonb('schema_json').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('form_templates_id_organization_id_uq').on(table.id, table.organizationId),
    index('form_templates_org_enabled_idx').on(table.organizationId, table.enabled),
  ],
);

export const formSubmissions = pgTable(
  'form_submissions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').notNull(),
    ownerType: text('owner_type').notNull(),
    ownerId: uuid('owner_id').notNull(),
    status: text('status').notNull().default('draft'),
    answersJson: jsonb('answers_json'),
    acknowledgementName: text('acknowledgement_name'),
    acknowledgementAt: timestamp('acknowledgement_at', { withTimezone: true, mode: 'date' }),
    acknowledgementNote: text('acknowledgement_note'),
    submittedByUserId: uuid('submitted_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    submittedByEmployeeId: uuid('submitted_by_employee_id'),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    offlineClientId: text('offline_client_id'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('form_submissions_id_organization_id_uq').on(table.id, table.organizationId),
    index('form_submissions_org_owner_idx').on(table.organizationId, table.ownerType, table.ownerId),
    check(
      'form_submissions_status_known',
      sql`${table.status} IN ('draft', 'submitted', 'void')`,
    ),
    check(
      'form_submissions_owner_known',
      sql`${table.ownerType} IN ('project', 'job', 'work_order', 'planning_task', 'maintenance', 'field_log')`,
    ),
  ],
);

/** Operational material consumption — NOT a second purchase Actual. */
export const materialUsageRecords = pgTable(
  'material_usage_records',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    materialId: uuid('material_id'),
    inventoryItemId: uuid('inventory_item_id'),
    description: text('description').notNull(),
    quantity: quantityAmount('quantity').notNull(),
    unit: text('unit'),
    usageDate: date('usage_date').notNull(),
    employeeId: uuid('employee_id'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('material_usage_records_id_organization_id_uq').on(table.id, table.organizationId),
    index('material_usage_records_org_project_idx').on(table.organizationId, table.projectId),
    index('material_usage_records_org_date_idx').on(table.organizationId, table.usageDate),
  ],
);

/** Equipment/vehicle usage — assignment itself does NOT create Actual. */
export const equipmentUsageRecords = pgTable(
  'equipment_usage_records',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    assetId: uuid('asset_id').notNull(),
    usageDate: date('usage_date').notNull(),
    endDate: date('end_date'),
    hours: quantityAmount('hours'),
    days: quantityAmount('days'),
    mileage: quantityAmount('mileage'),
    employeeId: uuid('employee_id'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('equipment_usage_records_id_organization_id_uq').on(table.id, table.organizationId),
    index('equipment_usage_records_org_project_idx').on(table.organizationId, table.projectId),
    index('equipment_usage_records_org_asset_idx').on(table.organizationId, table.assetId),
  ],
);

/**
 * Command center item state — snooze/dismiss/handled only where safe.
 * Does NOT erase unresolved financial truth.
 */
export const commandCenterItemStates = pgTable(
  'command_center_item_states',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    itemKey: text('item_key').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    state: text('state').notNull().default('active'),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true, mode: 'date' }),
    note: text('note'),
    updatedByUserId: uuid('updated_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('command_center_item_states_org_key_uq').on(table.organizationId, table.itemKey),
    uniqueIndex('command_center_item_states_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    check(
      'command_center_item_states_state_known',
      sql`${table.state} IN ('active', 'handled', 'dismissed', 'snoozed')`,
    ),
  ],
);

/**
 * Recurring financial DRAFT templates only.
 * Never auto-finalize economic records.
 */
export const recurringFinancialDrafts = pgTable(
  'recurring_financial_drafts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    draftKind: text('draft_kind').notNull(),
    title: text('title').notNull(),
    frequency: text('frequency').notNull(),
    intervalCount: integer('interval_count').notNull().default(1),
    nextRunDate: date('next_run_date').notNull(),
    endDate: date('end_date'),
    payloadJson: jsonb('payload_json').notNull(),
    status: text('status').notNull().default('active'),
    lastGeneratedAt: timestamp('last_generated_at', { withTimezone: true, mode: 'date' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('recurring_financial_drafts_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    index('recurring_financial_drafts_org_next_idx').on(table.organizationId, table.nextRunDate),
    check(
      'recurring_financial_drafts_kind_known',
      sql`${table.draftKind} IN ('expense', 'vendor_bill', 'billing_record')`,
    ),
    check(
      'recurring_financial_drafts_frequency_known',
      sql`${table.frequency} IN ('weekly', 'monthly', 'quarterly', 'yearly')`,
    ),
    check(
      'recurring_financial_drafts_status_known',
      sql`${table.status} IN ('active', 'paused', 'ended')`,
    ),
  ],
);
