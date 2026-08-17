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
import { archivedAt, primaryId, timestamps } from './_shared';
import { clients } from './clients';
import { documents } from './documents';
import { profiles } from './identity';
import { organizations } from './tenancy';
import { projects, workPackages } from './projects';
import { vendors } from './vendors';
import { employees } from './workforce';

/**
 * Next-generation product experience tables (closeout, warranty, communications,
 * calendar, automations, generic integrations, assistant).
 *
 * Does not create a second financial engine. Portal stays off.
 * Integration / assistant / calendar provider rows may exist only as
 * unconfigured foundations — application code must never stamp "connected"
 * or "sent" without a real provider confirmation.
 */

export const projectCloseouts = pgTable(
  'project_closeouts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    status: text('status').notNull().default('open'),
    financialSnapshotJson: jsonb('financial_snapshot_json'),
    closeReason: text('close_reason'),
    reopenReason: text('reopen_reason'),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    closedByUserId: uuid('closed_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    reopenedAt: timestamp('reopened_at', { withTimezone: true, mode: 'date' }),
    reopenedByUserId: uuid('reopened_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_closeouts_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('project_closeouts_id_org_project_uq').on(
      table.id,
      table.organizationId,
      table.projectId,
    ),
    uniqueIndex('project_closeouts_org_project_uq').on(table.organizationId, table.projectId),
    index('project_closeouts_org_status_idx').on(table.organizationId, table.status),
    check(
      'project_closeouts_status_known',
      sql`${table.status} IN ('open', 'ready', 'closed', 'reopened')`,
    ),
    check(
      'project_closeouts_closed_identity',
      sql`(
        (${table.status} = 'open'
          AND ${table.closedAt} IS NULL
          AND ${table.closedByUserId} IS NULL
          AND ${table.reopenedAt} IS NULL
          AND ${table.reopenedByUserId} IS NULL)
        OR (${table.status} = 'ready'
          AND (
            (${table.closedAt} IS NULL AND ${table.closedByUserId} IS NULL)
            OR (${table.closedAt} IS NOT NULL AND ${table.closedByUserId} IS NOT NULL)
          ))
        OR (${table.status} = 'closed'
          AND ${table.closedAt} IS NOT NULL
          AND ${table.closedByUserId} IS NOT NULL)
        OR (${table.status} = 'reopened'
          AND ${table.closedAt} IS NOT NULL
          AND ${table.closedByUserId} IS NOT NULL
          AND ${table.reopenedAt} IS NOT NULL
          AND ${table.reopenedByUserId} IS NOT NULL)
      )`,
    ),
    foreignKey({
      name: 'project_closeouts_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
  ],
);

export const projectCloseoutEvents = pgTable(
  'project_closeout_events',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    closeoutId: uuid('closeout_id').notNull(),
    projectId: uuid('project_id').notNull(),
    eventKind: text('event_kind').notNull(),
    reason: text('reason'),
    snapshotJson: jsonb('snapshot_json'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('project_closeout_events_id_organization_id_uq').on(table.id, table.organizationId),
    index('project_closeout_events_closeout_idx').on(table.organizationId, table.closeoutId),
    check(
      'project_closeout_events_kind_known',
      sql`${table.eventKind} IN ('started', 'marked_ready', 'closed', 'reopened')`,
    ),
    foreignKey({
      name: 'project_closeout_events_closeout_project_fk',
      columns: [table.closeoutId, table.organizationId, table.projectId],
      foreignColumns: [
        projectCloseouts.id,
        projectCloseouts.organizationId,
        projectCloseouts.projectId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'project_closeout_events_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
  ],
);

export const warrantyCoverages = pgTable(
  'warranty_coverages',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    workPackageId: uuid('work_package_id'),
    vendorId: uuid('vendor_id'),
    coverageType: text('coverage_type').notNull().default('workmanship'),
    title: text('title').notNull(),
    notes: text('notes'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    status: text('status').notNull().default('scheduled'),
    reminderDaysBefore: integer('reminder_days_before').notNull().default(30),
    archivedAt: archivedAt(),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('warranty_coverages_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('warranty_coverages_id_org_project_uq').on(
      table.id,
      table.organizationId,
      table.projectId,
    ),
    index('warranty_coverages_org_project_idx').on(table.organizationId, table.projectId),
    index('warranty_coverages_org_end_idx').on(table.organizationId, table.endDate, table.status),
    check(
      'warranty_coverages_type_known',
      sql`${table.coverageType} IN ('workmanship', 'materials', 'equipment', 'mixed')`,
    ),
    check(
      'warranty_coverages_status_known',
      sql`${table.status} IN ('scheduled', 'active', 'expired', 'void')`,
    ),
    check(
      'warranty_coverages_dates_order',
      sql`${table.endDate} IS NULL OR ${table.startDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
    check('warranty_coverages_reminder_nonneg', sql`${table.reminderDaysBefore} >= 0`),
    foreignKey({
      name: 'warranty_coverages_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'warranty_coverages_wp_project_fk',
      columns: [table.workPackageId, table.organizationId, table.projectId],
      foreignColumns: [workPackages.id, workPackages.organizationId, workPackages.projectId],
    }).onDelete('set null'),
    foreignKey({
      name: 'warranty_coverages_vendor_org_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('set null'),
  ],
);

export const warrantyIssues = pgTable(
  'warranty_issues',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    coverageId: uuid('coverage_id').notNull(),
    projectId: uuid('project_id').notNull(),
    workOrderId: uuid('work_order_id'),
    title: text('title').notNull(),
    notes: text('notes'),
    status: text('status').notNull().default('open'),
    reportedAt: timestamp('reported_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('warranty_issues_id_organization_id_uq').on(table.id, table.organizationId),
    index('warranty_issues_org_coverage_idx').on(table.organizationId, table.coverageId),
    index('warranty_issues_org_project_idx').on(table.organizationId, table.projectId),
    check(
      'warranty_issues_status_known',
      sql`${table.status} IN ('open', 'in_progress', 'resolved', 'cancelled')`,
    ),
    foreignKey({
      name: 'warranty_issues_coverage_project_fk',
      columns: [table.coverageId, table.organizationId, table.projectId],
      foreignColumns: [
        warrantyCoverages.id,
        warrantyCoverages.organizationId,
        warrantyCoverages.projectId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'warranty_issues_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'warranty_issues_work_order_org_fk',
      columns: [table.workOrderId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('set null'),
  ],
);

export const outboundCommunications = pgTable(
  'outbound_communications',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    relatedEntityType: text('related_entity_type').notNull(),
    relatedEntityId: uuid('related_entity_id'),
    projectId: uuid('project_id'),
    clientId: uuid('client_id'),
    vendorId: uuid('vendor_id'),
    recipientEmail: text('recipient_email').notNull(),
    recipientName: text('recipient_name'),
    subject: text('subject').notNull(),
    bodyText: text('body_text').notNull(),
    bodyHtml: text('body_html'),
    status: text('status').notNull().default('draft'),
    providerKey: text('provider_key'),
    providerMessageId: text('provider_message_id'),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('outbound_communications_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    index('outbound_communications_org_status_idx').on(table.organizationId, table.status),
    index('outbound_communications_org_entity_idx').on(
      table.organizationId,
      table.relatedEntityType,
      table.relatedEntityId,
    ),
    check(
      'outbound_communications_status_known',
      sql`${table.status} IN ('draft', 'queued', 'sending', 'sent', 'failed', 'cancelled')`,
    ),
    check(
      'outbound_communications_sent_requires_provider',
      sql`${table.status} <> 'sent' OR (
        ${table.providerMessageId} IS NOT NULL AND length(btrim(${table.providerMessageId})) > 0
        AND ${table.providerKey} IS NOT NULL AND length(btrim(${table.providerKey})) > 0
        AND ${table.sentAt} IS NOT NULL
      )`,
    ),
    check(
      'outbound_communications_entity_known',
      sql`${table.relatedEntityType} IN (
        'quote', 'purchase_order', 'report', 'project_summary', 'billing_record',
        'payment_reminder', 'vendor', 'closeout', 'warranty', 'other'
      )`,
    ),
    foreignKey({
      name: 'outbound_communications_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('set null'),
    foreignKey({
      name: 'outbound_communications_client_org_fk',
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
    }).onDelete('set null'),
    foreignKey({
      name: 'outbound_communications_vendor_org_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('set null'),
  ],
);

export const outboundCommunicationAttempts = pgTable(
  'outbound_communication_attempts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    communicationId: uuid('communication_id').notNull(),
    result: text('result').notNull(),
    providerMessageId: text('provider_message_id'),
    errorMessage: text('error_message'),
    attemptedAt: timestamp('attempted_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('outbound_communication_attempts_id_org_uq').on(table.id, table.organizationId),
    index('outbound_communication_attempts_comm_idx').on(
      table.organizationId,
      table.communicationId,
    ),
    check(
      'outbound_communication_attempts_result_known',
      sql`${table.result} IN ('not_configured', 'failed', 'delivered')`,
    ),
    check(
      'outbound_communication_attempts_delivered_id',
      sql`${table.result} <> 'delivered' OR (
        ${table.providerMessageId} IS NOT NULL AND length(btrim(${table.providerMessageId})) > 0
      )`,
    ),
    foreignKey({
      name: 'outbound_communication_attempts_comm_org_fk',
      columns: [table.communicationId, table.organizationId],
      foreignColumns: [outboundCommunications.id, outboundCommunications.organizationId],
    }).onDelete('cascade'),
  ],
);

export const outboundCommunicationAttachments = pgTable(
  'outbound_communication_attachments',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    communicationId: uuid('communication_id').notNull(),
    documentId: uuid('document_id').notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('outbound_communication_attachments_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('outbound_communication_attachments_doc_uq').on(
      table.organizationId,
      table.communicationId,
      table.documentId,
    ),
    foreignKey({
      name: 'outbound_communication_attachments_comm_org_fk',
      columns: [table.communicationId, table.organizationId],
      foreignColumns: [outboundCommunications.id, outboundCommunications.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'outbound_communication_attachments_doc_org_fk',
      columns: [table.documentId, table.organizationId],
      foreignColumns: [documents.id, documents.organizationId],
    }).onDelete('cascade'),
  ],
);

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    notes: text('notes'),
    eventKind: text('event_kind').notNull().default('meeting'),
    eventDate: date('event_date').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
    allDay: boolean('all_day').notNull().default(true),
    projectId: uuid('project_id'),
    clientId: uuid('client_id'),
    employeeId: uuid('employee_id'),
    relatedEntityType: text('related_entity_type'),
    relatedEntityId: uuid('related_entity_id'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('calendar_events_id_organization_id_uq').on(table.id, table.organizationId),
    index('calendar_events_org_date_idx').on(table.organizationId, table.eventDate),
    index('calendar_events_org_project_idx').on(table.organizationId, table.projectId),
    check(
      'calendar_events_kind_known',
      sql`${table.eventKind} IN ('meeting', 'site_visit', 'other')`,
    ),
    check(
      'calendar_events_related_type_known',
      sql`${table.relatedEntityType} IS NULL OR ${table.relatedEntityType} IN (
        'quote', 'purchase_order', 'report', 'project_summary', 'billing_record',
        'payment_reminder', 'vendor', 'closeout', 'warranty', 'other',
        'meeting', 'site_visit', 'project'
      )`,
    ),
    check(
      'calendar_events_time_order',
      sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} >= ${table.startsAt}`,
    ),
    foreignKey({
      name: 'calendar_events_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('set null'),
    foreignKey({
      name: 'calendar_events_client_org_fk',
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
    }).onDelete('set null'),
    foreignKey({
      name: 'calendar_events_employee_org_fk',
      columns: [table.employeeId, table.organizationId],
      foreignColumns: [employees.id, employees.organizationId],
    }).onDelete('set null'),
  ],
);

export const automationRules = pgTable(
  'automation_rules',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    presetKey: text('preset_key').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    configJson: jsonb('config_json').notNull().default({}),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('automation_rules_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('automation_rules_org_preset_uq').on(table.organizationId, table.presetKey),
    index('automation_rules_org_enabled_idx').on(table.organizationId, table.enabled),
    check(
      'automation_rules_preset_known',
      sql`${table.presetKey} IN (
        'client_balance_overdue',
        'quote_no_followup',
        'vendor_bill_due',
        'timesheet_not_submitted',
        'timesheet_waiting_approval',
        'ocr_waiting_review',
        'forecast_over_budget',
        'forecast_margin_low',
        'warranty_expiring',
        'compliance_expiring',
        'asset_service_due',
        'retention_release_date',
        'closeout_has_blockers'
      )`,
    ),
  ],
);

export const automationRuns = pgTable(
  'automation_runs',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id').notNull(),
    status: text('status').notNull(),
    actionsJson: jsonb('actions_json').notNull().default([]),
    errorMessage: text('error_message'),
    accessScopeJson: jsonb('access_scope_json').notNull().default({}),
    ranAt: timestamp('ran_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('automation_runs_id_organization_id_uq').on(table.id, table.organizationId),
    index('automation_runs_org_rule_idx').on(table.organizationId, table.ruleId, table.ranAt),
    check(
      'automation_runs_status_known',
      sql`${table.status} IN ('ok', 'skipped', 'failed')`,
    ),
    foreignKey({
      name: 'automation_runs_rule_org_fk',
      columns: [table.ruleId, table.organizationId],
      foreignColumns: [automationRules.id, automationRules.organizationId],
    }).onDelete('cascade'),
  ],
);

export const organizationIntegrations = pgTable(
  'organization_integrations',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    providerKey: text('provider_key').notNull(),
    integrationKind: text('integration_kind').notNull(),
    status: text('status').notNull().default('unconfigured'),
    capabilitiesJson: jsonb('capabilities_json').notNull().default({}),
    syncDirection: text('sync_direction').notNull().default('none'),
    lastError: text('last_error'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('organization_integrations_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('organization_integrations_org_provider_uq').on(
      table.organizationId,
      table.providerKey,
      table.integrationKind,
    ),
    check(
      'organization_integrations_kind_known',
      sql`${table.integrationKind} IN ('accounting', 'calendar', 'email', 'assistant', 'other')`,
    ),
    check(
      'organization_integrations_status_known',
      sql`${table.status} IN ('unconfigured', 'disconnected', 'error')`,
    ),
    check(
      'organization_integrations_direction_known',
      sql`${table.syncDirection} IN ('none', 'export', 'import', 'bidirectional')`,
    ),
    check(
      'organization_integrations_provider_not_local',
      sql`${table.providerKey} NOT IN ('local', 'projectflow-local')`,
    ),
  ],
);

export const integrationEntityMappings = pgTable(
  'integration_entity_mappings',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    integrationId: uuid('integration_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    externalId: text('external_id').notNull(),
    externalNumber: text('external_number'),
    metadataJson: jsonb('metadata_json').notNull().default({}),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('integration_entity_mappings_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('integration_entity_mappings_ext_uq').on(
      table.organizationId,
      table.integrationId,
      table.entityType,
      table.externalId,
    ),
    uniqueIndex('integration_entity_mappings_local_uq').on(
      table.organizationId,
      table.integrationId,
      table.entityType,
      table.entityId,
    ),
    check(
      'integration_entity_mappings_entity_known',
      sql`${table.entityType} IN (
        'client', 'vendor', 'billing_record', 'ap_bill',
        'payment', 'ar_payment', 'ap_payment', 'project'
      )`,
    ),
    foreignKey({
      name: 'integration_entity_mappings_integration_org_fk',
      columns: [table.integrationId, table.organizationId],
      foreignColumns: [organizationIntegrations.id, organizationIntegrations.organizationId],
    }).onDelete('cascade'),
  ],
);

export const integrationSyncJobs = pgTable(
  'integration_sync_jobs',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    integrationId: uuid('integration_id').notNull(),
    jobKind: text('job_kind').notNull(),
    status: text('status').notNull().default('queued'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
    errorMessage: text('error_message'),
    statsJson: jsonb('stats_json').notNull().default({}),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('integration_sync_jobs_id_org_uq').on(table.id, table.organizationId),
    index('integration_sync_jobs_org_integration_idx').on(
      table.organizationId,
      table.integrationId,
      table.createdAt,
    ),
    check(
      'integration_sync_jobs_status_known',
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      'integration_sync_jobs_state_consistent',
      sql`(
        (${table.status} = 'queued' AND ${table.startedAt} IS NULL AND ${table.finishedAt} IS NULL)
        OR (${table.status} = 'running' AND ${table.startedAt} IS NOT NULL AND ${table.finishedAt} IS NULL)
        OR (
          ${table.status} IN ('succeeded', 'failed')
          AND ${table.startedAt} IS NOT NULL
          AND ${table.finishedAt} IS NOT NULL
          AND ${table.finishedAt} >= ${table.startedAt}
        )
        OR (
          ${table.status} = 'cancelled'
          AND ${table.finishedAt} IS NOT NULL
          AND (${table.startedAt} IS NULL OR ${table.finishedAt} >= ${table.startedAt})
        )
      )`,
    ),
    foreignKey({
      name: 'integration_sync_jobs_integration_org_fk',
      columns: [table.integrationId, table.organizationId],
      foreignColumns: [organizationIntegrations.id, organizationIntegrations.organizationId],
    }).onDelete('cascade'),
  ],
);

export const assistantConversations = pgTable(
  'assistant_conversations',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    title: text('title'),
    status: text('status').notNull().default('active'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('assistant_conversations_id_org_uq').on(table.id, table.organizationId),
    index('assistant_conversations_org_user_idx').on(table.organizationId, table.userId),
    check(
      'assistant_conversations_status_known',
      sql`${table.status} IN ('active', 'archived')`,
    ),
  ],
);

export const assistantMessages = pgTable(
  'assistant_messages',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    citationsJson: jsonb('citations_json').notNull().default([]),
    accessScopeJson: jsonb('access_scope_json').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('assistant_messages_id_org_uq').on(table.id, table.organizationId),
    index('assistant_messages_conversation_idx').on(table.organizationId, table.conversationId),
    check('assistant_messages_role_known', sql`${table.role} IN ('user', 'assistant', 'system')`),
    foreignKey({
      name: 'assistant_messages_conversation_org_fk',
      columns: [table.conversationId, table.organizationId],
      foreignColumns: [assistantConversations.id, assistantConversations.organizationId],
    }).onDelete('cascade'),
  ],
);
