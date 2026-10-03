import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, quantityAmount, timestamps } from './_shared';
import { projectLocations } from './dg-foundation';
import { profiles } from './identity';
import { subcontractAgreements } from './platform-ops';
import { externalPrincipals } from './portal';
import { projects } from './projects';
import { meetingActionItems, meetingRecords } from './tasks';
import { organizations } from './tenancy';
import { vendors } from './vendors';

/**
 * Developer / GC layer - FIELD (Track O, migration slot 0165): daily site log, contractor daily
 * reports, contractor meetings (extending the existing meeting_* tables) and site instructions.
 * Every table is internal-operational; no money columns.
 */

// ─── Daily site log ──────────────────────────────────────────────────────────

export const SITE_DAILY_LOG_STATUSES = ['open', 'closed'] as const;
export type SiteDailyLogStatus = (typeof SITE_DAILY_LOG_STATUSES)[number];

export const siteDailyLogs = pgTable(
  'site_daily_logs',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    logDate: date('log_date', { mode: 'string' }).notNull(),
    status: text('status').$type<SiteDailyLogStatus>().notNull().default('open'),
    weather: text('weather'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    closedByUserId: uuid('closed_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('site_daily_logs_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('site_daily_logs_id_org_project_uq').on(table.id, table.organizationId, table.projectId),
    uniqueIndex('site_daily_logs_project_date_uq').on(table.organizationId, table.projectId, table.logDate),
    foreignKey({
      name: 'site_daily_logs_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check('site_daily_logs_status_known', sql`${table.status} IN ('open', 'closed')`),
  ],
);

export const SITE_DAILY_LOG_ENTRY_TYPES = [
  'contractor_presence',
  'work_performed',
  'manpower',
  'equipment',
  'delivery',
  'delay',
  'blocking_issue',
  'inspection',
  'safety_event',
  'instruction',
  'note',
] as const;
export type SiteDailyLogEntryType = (typeof SITE_DAILY_LOG_ENTRY_TYPES)[number];

export const siteDailyLogEntries = pgTable(
  'site_daily_log_entries',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    dailyLogId: uuid('daily_log_id').notNull(),
    entryType: text('entry_type').$type<SiteDailyLogEntryType>().notNull(),
    vendorId: uuid('vendor_id'),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    locationId: uuid('location_id'),
    description: text('description'),
    headcount: integer('headcount'),
    hours: numeric('hours', { precision: 10, scale: 2, mode: 'string' }),
    quantity: quantityAmount('quantity'),
    unit: text('unit'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('site_daily_log_entries_id_organization_id_uq').on(table.id, table.organizationId),
    index('site_daily_log_entries_log_idx').on(
      table.organizationId,
      table.dailyLogId,
      table.entryType,
      table.sortOrder,
    ),
    foreignKey({
      name: 'site_daily_log_entries_log_fk',
      columns: [table.dailyLogId, table.organizationId, table.projectId],
      foreignColumns: [siteDailyLogs.id, siteDailyLogs.organizationId, siteDailyLogs.projectId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'site_daily_log_entries_vendor_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'site_daily_log_entries_agreement_vendor_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.vendorId,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'site_daily_log_entries_location_fk',
      columns: [table.locationId, table.organizationId, table.projectId],
      foreignColumns: [projectLocations.id, projectLocations.organizationId, projectLocations.projectId],
    }).onDelete('set null'),
  ],
);

/** Contractor daily report. Append-only; a correction is a new revision (server-numbered). */
export const siteDailyReports = pgTable(
  'site_daily_reports',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    reportDate: date('report_date', { mode: 'string' }).notNull(),
    revision: integer('revision').notNull().default(1),
    supersedesReportId: uuid('supersedes_report_id'),
    locationId: uuid('location_id'),
    manpowerCount: integer('manpower_count'),
    workPerformed: text('work_performed'),
    equipment: text('equipment'),
    deliveries: text('deliveries'),
    delays: text('delays'),
    blockingIssues: text('blocking_issues'),
    safetyNotes: text('safety_notes'),
    notes: text('notes'),
    submittedActorType: text('submitted_actor_type').$type<'internal' | 'external'>().notNull(),
    submittedByUserId: uuid('submitted_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    submittedByPrincipalId: uuid('submitted_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('site_daily_reports_id_organization_id_uq').on(table.id, table.organizationId),
    index('site_daily_reports_project_date_idx').on(table.organizationId, table.projectId, table.reportDate),
    foreignKey({
      name: 'site_daily_reports_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'site_daily_reports_vendor_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'site_daily_reports_agreement_vendor_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.vendorId,
      ],
    }).onDelete('restrict'),
    check(
      'site_daily_reports_actor_shape',
      sql`(${table.submittedActorType} = 'internal' AND ${table.submittedByPrincipalId} IS NULL)
        OR (${table.submittedActorType} = 'external' AND ${table.submittedByPrincipalId} IS NOT NULL AND ${table.submittedByUserId} IS NULL)`,
    ),
  ],
);

// ─── Contractor meetings (extends meeting_records) ───────────────────────────

export const SITE_MEETING_TYPES = ['weekly_contractor', 'site', 'design', 'consultant', 'other'] as const;
export type SiteMeetingType = (typeof SITE_MEETING_TYPES)[number];
export const SITE_MEETING_STATUSES = ['scheduled', 'held', 'published', 'cancelled'] as const;
export type SiteMeetingStatus = (typeof SITE_MEETING_STATUSES)[number];

export const siteMeetingDetails = pgTable(
  'site_meeting_details',
  {
    meetingId: uuid('meeting_id')
      .primaryKey()
      .references(() => meetingRecords.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    meetingType: text('meeting_type').$type<SiteMeetingType>().notNull().default('weekly_contractor'),
    status: text('status').$type<SiteMeetingStatus>().notNull().default('scheduled'),
    agenda: text('agenda'),
    minutes: text('minutes'),
    heldAt: timestamp('held_at', { withTimezone: true, mode: 'date' }),
    publishedVersion: integer('published_version').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    publishedByUserId: uuid('published_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('site_meeting_details_meeting_org_project_uq').on(
      table.meetingId,
      table.organizationId,
      table.projectId,
    ),
    index('site_meeting_details_project_idx').on(table.organizationId, table.projectId, table.status),
    foreignKey({
      name: 'site_meeting_details_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
  ],
);

export const SITE_MEETING_ATTENDANCE = ['invited', 'attended', 'absent'] as const;
export type SiteMeetingAttendance = (typeof SITE_MEETING_ATTENDANCE)[number];

export const siteMeetingContractors = pgTable(
  'site_meeting_contractors',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    meetingId: uuid('meeting_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    principalId: uuid('principal_id').references(() => externalPrincipals.id, { onDelete: 'set null' }),
    displayName: text('display_name'),
    attendance: text('attendance').$type<SiteMeetingAttendance>().notNull().default('invited'),
    ...timestamps(),
  },
  (table) => [
    index('site_meeting_contractors_vendor_idx').on(table.organizationId, table.vendorId),
    foreignKey({
      name: 'site_meeting_contractors_meeting_fk',
      columns: [table.meetingId, table.organizationId, table.projectId],
      foreignColumns: [siteMeetingDetails.meetingId, siteMeetingDetails.organizationId, siteMeetingDetails.projectId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'site_meeting_contractors_vendor_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('restrict'),
  ],
);

export const siteMeetingActionAssignments = pgTable(
  'site_meeting_action_assignments',
  {
    actionItemId: uuid('action_item_id')
      .primaryKey()
      .references(() => meetingActionItems.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    meetingId: uuid('meeting_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('site_meeting_action_assignments_meeting_idx').on(table.organizationId, table.meetingId),
    foreignKey({
      name: 'site_meeting_action_assignments_meeting_fk',
      columns: [table.meetingId, table.organizationId, table.projectId],
      foreignColumns: [siteMeetingDetails.meetingId, siteMeetingDetails.organizationId, siteMeetingDetails.projectId],
    }).onDelete('cascade'),
  ],
);

export interface SiteMeetingPublishedDecision {
  readonly title: string;
  readonly body: string | null;
  readonly decidedAt: string | null;
}

export interface SiteMeetingPublishedAttendee {
  readonly kind: 'internal' | 'contractor';
  readonly name: string | null;
  readonly attendance: SiteMeetingAttendance | null;
}

/** Immutable published minutes (republish = new version). */
export const siteMeetingPublications = pgTable(
  'site_meeting_publications',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    meetingId: uuid('meeting_id').notNull(),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    meetingType: text('meeting_type').$type<SiteMeetingType>().notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' }).notNull(),
    heldAt: timestamp('held_at', { withTimezone: true, mode: 'date' }),
    location: text('location'),
    agenda: text('agenda'),
    minutes: text('minutes'),
    decisions: jsonb('decisions').$type<SiteMeetingPublishedDecision[]>().notNull().default([]),
    attendees: jsonb('attendees').$type<SiteMeetingPublishedAttendee[]>().notNull().default([]),
    publishedByUserId: uuid('published_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('site_meeting_publications_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('site_meeting_publications_version_uq').on(table.meetingId, table.version),
    index('site_meeting_publications_project_idx').on(table.organizationId, table.projectId, table.publishedAt),
    foreignKey({
      name: 'site_meeting_publications_meeting_fk',
      columns: [table.meetingId, table.organizationId, table.projectId],
      foreignColumns: [siteMeetingDetails.meetingId, siteMeetingDetails.organizationId, siteMeetingDetails.projectId],
    }).onDelete('cascade'),
  ],
);

/** Action items of a published version. vendorId null = internal item (never contractor-visible). */
export const siteMeetingPublicationActions = pgTable(
  'site_meeting_publication_actions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    publicationId: uuid('publication_id').notNull(),
    actionItemId: uuid('action_item_id'),
    vendorId: uuid('vendor_id'),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    title: text('title').notNull(),
    dueDate: date('due_date', { mode: 'string' }),
    taskId: uuid('task_id'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('site_meeting_publication_actions_pub_idx').on(table.organizationId, table.publicationId, table.sortOrder),
    foreignKey({
      name: 'site_meeting_publication_actions_pub_fk',
      columns: [table.publicationId, table.organizationId],
      foreignColumns: [siteMeetingPublications.id, siteMeetingPublications.organizationId],
    }).onDelete('cascade'),
  ],
);

// ─── Site instructions ───────────────────────────────────────────────────────

export const SITE_INSTRUCTION_CATEGORIES = ['operational', 'potentially_financial', 'urgent_before_price'] as const;
export type SiteInstructionCategory = (typeof SITE_INSTRUCTION_CATEGORIES)[number];
export const SITE_INSTRUCTION_STATUSES = ['issued', 'acknowledged', 'performed', 'closed', 'cancelled'] as const;
export type SiteInstructionStatus = (typeof SITE_INSTRUCTION_STATUSES)[number];
export const SITE_INSTRUCTION_CONVERSION_STATES = ['none', 'pending', 'converted', 'dismissed'] as const;
export type SiteInstructionConversionState = (typeof SITE_INSTRUCTION_CONVERSION_STATES)[number];

export const siteInstructions = pgTable(
  'site_instructions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    /** Server-assigned per project (trigger). */
    instructionNumber: integer('instruction_number').notNull().default(0),
    title: text('title').notNull(),
    description: text('description'),
    category: text('category').$type<SiteInstructionCategory>().notNull().default('operational'),
    status: text('status').$type<SiteInstructionStatus>().notNull().default('issued'),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    locationId: uuid('location_id'),
    dailyLogId: uuid('daily_log_id'),
    meetingId: uuid('meeting_id'),
    dueDate: date('due_date', { mode: 'string' }),
    conversionState: text('conversion_state').$type<SiteInstructionConversionState>().notNull().default('none'),
    issuedByUserId: uuid('issued_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true, mode: 'date' }),
    acknowledgedActorType: text('acknowledged_actor_type').$type<'internal' | 'external'>(),
    acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    acknowledgedByPrincipalId: uuid('acknowledged_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    performedAt: timestamp('performed_at', { withTimezone: true, mode: 'date' }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('site_instructions_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('site_instructions_number_uq').on(table.organizationId, table.projectId, table.instructionNumber),
    index('site_instructions_project_status_idx').on(
      table.organizationId,
      table.projectId,
      table.status,
      table.issuedAt,
    ),
    index('site_instructions_vendor_status_idx').on(table.organizationId, table.vendorId, table.status),
    foreignKey({
      name: 'site_instructions_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'site_instructions_vendor_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'site_instructions_agreement_vendor_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.vendorId,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'site_instructions_location_fk',
      columns: [table.locationId, table.organizationId, table.projectId],
      foreignColumns: [projectLocations.id, projectLocations.organizationId, projectLocations.projectId],
    }).onDelete('set null'),
    check('site_instructions_title_not_blank', sql`length(btrim(${table.title})) > 0`),
  ],
);

export const SITE_INSTRUCTION_EVENT_TYPES = [
  'issued',
  'acknowledged',
  'performed',
  'closed',
  'cancelled',
  'reopened',
  'conversion_requested',
  'converted',
  'conversion_dismissed',
  'note',
] as const;
export type SiteInstructionEventType = (typeof SITE_INSTRUCTION_EVENT_TYPES)[number];

/** Append-only history; inserting an event is the only way to move an instruction's status. */
export const siteInstructionEvents = pgTable(
  'site_instruction_events',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Copied from the instruction by trigger. */
    projectId: uuid('project_id').notNull(),
    instructionId: uuid('instruction_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    eventType: text('event_type').$type<SiteInstructionEventType>().notNull(),
    fromStatus: text('from_status').$type<SiteInstructionStatus>(),
    toStatus: text('to_status').$type<SiteInstructionStatus>(),
    note: text('note'),
    actorType: text('actor_type').$type<'internal' | 'external' | 'system'>().notNull().default('internal'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorPrincipalId: uuid('actor_principal_id').references(() => externalPrincipals.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('site_instruction_events_instruction_idx').on(table.organizationId, table.instructionId, table.occurredAt),
    foreignKey({
      name: 'site_instruction_events_instruction_fk',
      columns: [table.instructionId, table.organizationId],
      foreignColumns: [siteInstructions.id, siteInstructions.organizationId],
    }).onDelete('cascade'),
    check(
      'site_instruction_events_actor_shape',
      sql`(${table.actorType} = 'internal' AND ${table.actorPrincipalId} IS NULL)
        OR (${table.actorType} = 'external' AND ${table.actorPrincipalId} IS NOT NULL AND ${table.actorUserId} IS NULL)
        OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL AND ${table.actorPrincipalId} IS NULL)`,
    ),
  ],
);
