import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  archivedAt,
  currencyCode,
  moneyAmount,
  percentAmount,
  primaryId,
  quantityAmount,
  timestamps,
} from './_shared';
import { billingRecords } from './billing';
import { contracts } from './contracts';
import { documents } from './documents';
import { profiles } from './identity';
import { inventoryItems, inventoryLocations } from './field-ops';
import { projects } from './projects';
import { organizations } from './tenancy';
import { vendors } from './vendors';
import { employees } from './workforce';

/**
 * Overnight 3-wave platform tables (0046–0050).
 * Lead-owned schema. Financial truth stays on existing commercial/billing/AP engines.
 */

export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    domain: text('domain').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    severity: text('severity').notNull().default('info'),
    deepLink: text('deep_link'),
    dedupeKey: text('dedupe_key').notNull(),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true, mode: 'date' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('notifications_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('notifications_org_recipient_dedupe_uq').on(
      table.organizationId,
      table.recipientUserId,
      table.dedupeKey,
    ),
    index('notifications_recipient_unread_idx')
      .on(table.organizationId, table.recipientUserId, table.createdAt)
      .where(sql`${table.readAt} is null and ${table.dismissedAt} is null`),
    index('notifications_org_type_idx').on(table.organizationId, table.type, table.createdAt),
    check(
      'notifications_severity_known',
      sql`${table.severity} IN ('info', 'warning', 'urgent')`,
    ),
  ],
);

export const timesheets = pgTable(
  'timesheets',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    status: text('status').notNull().default('draft'),
    submittedByUserId: uuid('submitted_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    decidedByUserId: uuid('decided_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    managerNote: text('manager_note'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('timesheets_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('timesheets_org_employee_period_uq')
      .on(table.organizationId, table.employeeId, table.periodStart)
      .where(sql`${table.archivedAt} is null`),
    index('timesheets_org_status_idx').on(table.organizationId, table.status),
    foreignKey({
      name: 'timesheets_employee_org_fk',
      columns: [table.employeeId, table.organizationId],
      foreignColumns: [employees.id, employees.organizationId],
    }).onDelete('cascade'),
    check(
      'timesheets_status_known',
      sql`${table.status} IN ('draft', 'submitted', 'approved', 'returned')`,
    ),
    check('timesheets_period_order', sql`${table.periodEnd} >= ${table.periodStart}`),
  ],
);

export const documentFolders = pgTable(
  'document_folders',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    ownerType: text('owner_type'),
    ownerId: uuid('owner_id'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('document_folders_id_organization_id_uq').on(table.id, table.organizationId),
    index('document_folders_org_owner_idx').on(table.organizationId, table.ownerType, table.ownerId),
    foreignKey({
      name: 'document_folders_parent_org_fk',
      columns: [table.parentId, table.organizationId],
      foreignColumns: [table.id, table.organizationId],
    }).onDelete('cascade'),
  ],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    storageBucket: text('storage_bucket').notNull(),
    storagePath: text('storage_path').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes'),
    checksum: text('checksum'),
    isCurrent: boolean('is_current').notNull().default(false),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('document_versions_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('document_versions_id_document_org_uq').on(
      table.id,
      table.documentId,
      table.organizationId,
    ),
    uniqueIndex('document_versions_document_number_uq').on(table.documentId, table.versionNumber),
    uniqueIndex('document_versions_current_uq')
      .on(table.documentId)
      .where(sql`${table.isCurrent}`),
    uniqueIndex('document_versions_storage_path_uq').on(table.storageBucket, table.storagePath),
    index('document_versions_document_idx').on(table.documentId),
    foreignKey({
      name: 'document_versions_document_org_fk',
      columns: [table.documentId, table.organizationId],
      foreignColumns: [documents.id, documents.organizationId],
    }).onDelete('cascade'),
    check('document_versions_number_positive', sql`${table.versionNumber} >= 1`),
  ],
);

export const activityEvents = pgTable(
  'activity_events',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id'),
    projectId: uuid('project_id'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    kind: text('kind').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    summary: text('summary').notNull(),
    deepLink: text('deep_link'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('activity_events_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('activity_events_idempotency_uq').on(
      table.organizationId,
      table.kind,
      table.entityType,
      table.entityId,
    ),
    index('activity_events_client_idx').on(table.organizationId, table.clientId, table.occurredAt),
    index('activity_events_project_idx').on(table.organizationId, table.projectId, table.occurredAt),
  ],
);

/**
 * Commercial subcontract agreement. Commitment ≠ expense.
 * Original + approved changes = current. Valuations reuse BOQ subcontractor engine.
 */
export const subcontractAgreements = pgTable(
  'subcontract_agreements',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subcontractNumber: text('subcontract_number'),
    vendorId: uuid('vendor_id').notNull(),
    projectId: uuid('project_id').notNull(),
    parentContractId: uuid('parent_contract_id'),
    title: text('title').notNull(),
    status: text('status').notNull().default('draft'),
    originalAmount: moneyAmount('original_amount').notNull(),
    currency: currencyCode().notNull(),
    retentionPercent: percentAmount('retention_percent'),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    notes: text('notes'),
    archivedAt: archivedAt(),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('subcontract_agreements_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('subcontract_agreements_org_number_uq')
      .on(table.organizationId, table.subcontractNumber)
      .where(sql`${table.subcontractNumber} is not null and ${table.archivedAt} is null`),
    index('subcontract_agreements_project_idx').on(table.organizationId, table.projectId),
    index('subcontract_agreements_vendor_idx').on(table.organizationId, table.vendorId),
    foreignKey({
      name: 'subcontract_agreements_vendor_org_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'subcontract_agreements_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'subcontract_agreements_contract_org_fk',
      columns: [table.parentContractId, table.organizationId],
      foreignColumns: [contracts.id, contracts.organizationId],
    }).onDelete('set null'),
    check(
      'subcontract_agreements_status_known',
      sql`${table.status} IN ('draft', 'active', 'completed', 'cancelled')`,
    ),
    check('subcontract_agreements_amount_non_negative', sql`${table.originalAmount} >= 0`),
    check(
      'subcontract_agreements_date_order',
      sql`${table.endDate} IS NULL OR ${table.startDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
  ],
);

export const subcontractValueEvents = pgTable(
  'subcontract_value_events',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subcontractId: uuid('subcontract_id').notNull(),
    kind: text('kind').notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
    reason: text('reason'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('subcontract_value_events_id_organization_id_uq').on(table.id, table.organizationId),
    index('subcontract_value_events_subcontract_idx').on(table.subcontractId),
    foreignKey({
      name: 'subcontract_value_events_sub_org_fk',
      columns: [table.subcontractId, table.organizationId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId],
    }).onDelete('cascade'),
    check(
      'subcontract_value_events_kind_known',
      sql`${table.kind} IN ('original', 'change_order', 'adjustment')`,
    ),
  ],
);

export const ocrBatches = pgTable(
  'ocr_batches',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('queued'),
    totalCount: integer('total_count').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('ocr_batches_id_organization_id_uq').on(table.id, table.organizationId),
    index('ocr_batches_org_status_idx').on(table.organizationId, table.status),
    check(
      'ocr_batches_status_known',
      sql`${table.status} IN ('queued', 'processing', 'completed', 'failed', 'cancelled')`,
    ),
  ],
);

export const resourceBookings = pgTable(
  'resource_bookings',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull(),
    projectId: uuid('project_id'),
    workOrderId: uuid('work_order_id'),
    startAt: timestamp('start_at', { withTimezone: true, mode: 'date' }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true, mode: 'date' }).notNull(),
    plannedHours: quantityAmount('planned_hours'),
    source: text('source').notNull().default('manual'),
    status: text('status').notNull().default('planned'),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('resource_bookings_id_organization_id_uq').on(table.id, table.organizationId),
    index('resource_bookings_employee_window_idx').on(
      table.organizationId,
      table.employeeId,
      table.startAt,
      table.endAt,
    ),
    index('resource_bookings_project_idx').on(table.organizationId, table.projectId, table.startAt),
    foreignKey({
      name: 'resource_bookings_employee_org_fk',
      columns: [table.employeeId, table.organizationId],
      foreignColumns: [employees.id, employees.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'resource_bookings_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'resource_bookings_work_order_org_fk',
      columns: [table.workOrderId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check('resource_bookings_window_valid', sql`${table.endAt} > ${table.startAt}`),
    check(
      'resource_bookings_status_known',
      sql`${table.status} IN ('planned', 'confirmed', 'cancelled')`,
    ),
    check(
      'resource_bookings_source_known',
      sql`${table.source} IN ('manual', 'work_order', 'assignment', 'recurring')`,
    ),
  ],
);

export const employeeUnavailability = pgTable(
  'employee_unavailability',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    kind: text('kind').notNull().default('leave'),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('employee_unavailability_id_organization_id_uq').on(table.id, table.organizationId),
    index('employee_unavailability_employee_idx').on(
      table.organizationId,
      table.employeeId,
      table.startDate,
    ),
    foreignKey({
      name: 'employee_unavailability_employee_org_fk',
      columns: [table.employeeId, table.organizationId],
      foreignColumns: [employees.id, employees.organizationId],
    }).onDelete('cascade'),
    check('employee_unavailability_date_order', sql`${table.endDate} >= ${table.startDate}`),
    check(
      'employee_unavailability_kind_known',
      sql`${table.kind} IN ('leave', 'unavailable', 'holiday')`,
    ),
  ],
);

export const projectAccessGrants = pgTable(
  'project_access_grants',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    accessLevel: text('access_level').notNull().default('read'),
    grantedByUserId: uuid('granted_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_access_grants_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('project_access_grants_user_project_uq').on(
      table.organizationId,
      table.userId,
      table.projectId,
    ),
    index('project_access_grants_project_idx').on(table.organizationId, table.projectId),
    foreignKey({
      name: 'project_access_grants_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check(
      'project_access_grants_level_known',
      sql`${table.accessLevel} IN ('read', 'manage')`,
    ),
  ],
);

export const safetyRecords = pgTable(
  'safety_records',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'),
    recordType: text('record_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    reporterUserId: uuid('reporter_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    severity: text('severity').notNull().default('low'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    peopleInvolved: text('people_involved'),
    immediateAction: text('immediate_action'),
    status: text('status').notNull().default('open'),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    closedByUserId: uuid('closed_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('safety_records_id_organization_id_uq').on(table.id, table.organizationId),
    index('safety_records_org_project_idx').on(table.organizationId, table.projectId, table.occurredAt),
    index('safety_records_org_status_idx').on(table.organizationId, table.status),
    foreignKey({
      name: 'safety_records_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('set null'),
    check(
      'safety_records_type_known',
      sql`${table.recordType} IN ('incident', 'near_miss', 'accident', 'hazard', 'observation', 'toolbox_talk', 'ppe_issue')`,
    ),
    check(
      'safety_records_severity_known',
      sql`${table.severity} IN ('low', 'medium', 'high', 'critical')`,
    ),
    check(
      'safety_records_status_known',
      sql`${table.status} IN ('open', 'in_progress', 'closed', 'cancelled')`,
    ),
  ],
);

export const safetyCorrectiveActions = pgTable(
  'safety_corrective_actions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    safetyRecordId: uuid('safety_record_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    ownerUserId: uuid('owner_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    dueDate: date('due_date', { mode: 'string' }),
    status: text('status').notNull().default('open'),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('safety_corrective_actions_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    index('safety_corrective_actions_record_idx').on(table.safetyRecordId),
    index('safety_corrective_actions_due_idx').on(table.organizationId, table.status, table.dueDate),
    foreignKey({
      name: 'safety_corrective_actions_record_org_fk',
      columns: [table.safetyRecordId, table.organizationId],
      foreignColumns: [safetyRecords.id, safetyRecords.organizationId],
    }).onDelete('cascade'),
    check(
      'safety_corrective_actions_status_known',
      sql`${table.status} IN ('open', 'in_progress', 'done', 'cancelled')`,
    ),
  ],
);

export const safetyToolboxTalks = pgTable(
  'safety_toolbox_talks',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    safetyRecordId: uuid('safety_record_id').notNull(),
    topic: text('topic').notNull(),
    talkDate: date('talk_date', { mode: 'string' }).notNull(),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('safety_toolbox_talks_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('safety_toolbox_talks_record_uq').on(table.safetyRecordId),
    foreignKey({
      name: 'safety_toolbox_talks_record_org_fk',
      columns: [table.safetyRecordId, table.organizationId],
      foreignColumns: [safetyRecords.id, safetyRecords.organizationId],
    }).onDelete('cascade'),
  ],
);

export const safetyToolboxAttendees = pgTable(
  'safety_toolbox_attendees',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    toolboxTalkId: uuid('toolbox_talk_id').notNull(),
    employeeId: uuid('employee_id'),
    attendeeName: text('attendee_name').notNull(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('safety_toolbox_attendees_id_organization_id_uq').on(table.id, table.organizationId),
    index('safety_toolbox_attendees_talk_idx').on(table.toolboxTalkId),
    foreignKey({
      name: 'safety_toolbox_attendees_talk_org_fk',
      columns: [table.toolboxTalkId, table.organizationId],
      foreignColumns: [safetyToolboxTalks.id, safetyToolboxTalks.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'safety_toolbox_attendees_employee_org_fk',
      columns: [table.employeeId, table.organizationId],
      foreignColumns: [employees.id, employees.organizationId],
    }).onDelete('set null'),
  ],
);

export const inventoryReservations = pgTable(
  'inventory_reservations',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    inventoryItemId: uuid('inventory_item_id').notNull(),
    projectId: uuid('project_id'),
    workOrderId: uuid('work_order_id'),
    quantity: quantityAmount('quantity').notNull(),
    status: text('status').notNull().default('active'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    releasedAt: timestamp('released_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('inventory_reservations_id_organization_id_uq').on(table.id, table.organizationId),
    index('inventory_reservations_item_idx').on(table.organizationId, table.inventoryItemId, table.status),
    index('inventory_reservations_project_idx').on(table.organizationId, table.projectId),
    foreignKey({
      name: 'inventory_reservations_item_org_fk',
      columns: [table.inventoryItemId, table.organizationId],
      foreignColumns: [inventoryItems.id, inventoryItems.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'inventory_reservations_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('set null'),
    foreignKey({
      name: 'inventory_reservations_work_order_org_fk',
      columns: [table.workOrderId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('set null'),
    check('inventory_reservations_qty_positive', sql`${table.quantity} > 0`),
    check(
      'inventory_reservations_status_known',
      sql`${table.status} IN ('active', 'released', 'consumed', 'cancelled')`,
    ),
  ],
);

export const inventoryCounts = pgTable(
  'inventory_counts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').notNull(),
    status: text('status').notNull().default('draft'),
    countedOn: date('counted_on', { mode: 'string' }).notNull(),
    notes: text('notes'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true, mode: 'date' }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('inventory_counts_id_organization_id_uq').on(table.id, table.organizationId),
    index('inventory_counts_org_status_idx').on(table.organizationId, table.status),
    foreignKey({
      name: 'inventory_counts_location_org_fk',
      columns: [table.locationId, table.organizationId],
      foreignColumns: [inventoryLocations.id, inventoryLocations.organizationId],
    }).onDelete('restrict'),
    check(
      'inventory_counts_status_known',
      sql`${table.status} IN ('draft', 'finalizing', 'finalized', 'void')`,
    ),
  ],
);

export const inventoryCountLines = pgTable(
  'inventory_count_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    countId: uuid('count_id').notNull(),
    inventoryItemId: uuid('inventory_item_id').notNull(),
    expectedQuantity: quantityAmount('expected_quantity').notNull(),
    countedQuantity: quantityAmount('counted_quantity').notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('inventory_count_lines_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('inventory_count_lines_count_item_uq').on(table.countId, table.inventoryItemId),
    foreignKey({
      name: 'inventory_count_lines_count_org_fk',
      columns: [table.countId, table.organizationId],
      foreignColumns: [inventoryCounts.id, inventoryCounts.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'inventory_count_lines_item_org_fk',
      columns: [table.inventoryItemId, table.organizationId],
      foreignColumns: [inventoryItems.id, inventoryItems.organizationId],
    }).onDelete('restrict'),
  ],
);

export const workOrderBillingSources = pgTable(
  'work_order_billing_sources',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workOrderId: uuid('work_order_id').notNull(),
    billingRecordId: uuid('billing_record_id').notNull(),
    compositionJson: jsonb('composition_json').$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('work_order_billing_sources_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    uniqueIndex('work_order_billing_sources_pair_uq').on(
      table.organizationId,
      table.workOrderId,
      table.billingRecordId,
    ),
    index('work_order_billing_sources_billing_idx').on(table.billingRecordId),
    foreignKey({
      name: 'work_order_billing_sources_wo_org_fk',
      columns: [table.workOrderId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'work_order_billing_sources_billing_org_fk',
      columns: [table.billingRecordId, table.organizationId],
      foreignColumns: [billingRecords.id, billingRecords.organizationId],
    }).onDelete('restrict'),
  ],
);
