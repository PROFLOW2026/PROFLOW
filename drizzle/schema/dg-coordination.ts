import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';
import { projectLocations } from './dg-foundation';
import { documents } from './documents';
import { profiles } from './identity';
import { externalPrincipals } from './portal';
import { subcontractAgreements } from './platform-ops';
import { phases, projects, workPackages } from './projects';
import { organizations } from './tenancy';
import { vendors } from './vendors';

/**
 * Developer / GC layer - COORDINATION EVENTS / CONTRACTOR READINESS (migration 0161, Track H).
 * Mirrors drizzle/migrations-wip/0161_dg_coordination_events.sql. No money columns.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const COORDINATION_EVENT_KINDS = [
  'concrete_pour',
  'installation',
  'inspection',
  'delivery',
  'handover',
  'testing',
  'meeting',
  'other',
] as const;
export type CoordinationEventKind = (typeof COORDINATION_EVENT_KINDS)[number];

export const COORDINATION_EVENT_STATUSES = [
  'scheduled',
  'completed',
  'partially_completed',
  'postponed',
  'cancelled',
] as const;
export type CoordinationEventStatus = (typeof COORDINATION_EVENT_STATUSES)[number];

export const COORDINATION_RESPONSE_STATUSES = [
  'ready',
  'not_ready',
  'ready_with_conditions',
  'acknowledged',
  'blocked',
] as const;
export type CoordinationResponseStatus = (typeof COORDINATION_RESPONSE_STATUSES)[number];

export const COORDINATION_OUTCOMES = ['completed', 'partially_completed', 'postponed', 'cancelled'] as const;
export type CoordinationOutcome = (typeof COORDINATION_OUTCOMES)[number];

export const COORDINATION_OVERRIDE_DECISIONS = ['force_ready', 'force_not_ready', 'cleared'] as const;
export type CoordinationOverrideDecision = (typeof COORDINATION_OVERRIDE_DECISIONS)[number];

export const COORDINATION_ISSUE_STATUSES = ['open', 'task_created', 'dismissed'] as const;
export type CoordinationIssueStatus = (typeof COORDINATION_ISSUE_STATUSES)[number];

export interface CoordinationAcknowledgementItem {
  readonly key: string;
  readonly label: string;
}

export const coordinationEvents = pgTable(
  'coordination_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    kind: text('kind').$type<CoordinationEventKind>().notNull().default('other'),
    status: text('status').$type<CoordinationEventStatus>().notNull().default('scheduled'),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at'),
    locationId: uuid('location_id'),
    locationNote: text('location_note'),
    workPackageId: uuid('work_package_id'),
    phaseId: uuid('phase_id'),
    preparationDeadline: ts('preparation_deadline'),
    requiredAcknowledgements: jsonb('required_acknowledgements')
      .$type<CoordinationAcknowledgementItem[]>()
      .notNull()
      .default([]),
    readinessEpochAt: ts('readiness_epoch_at').notNull().default(sql`clock_timestamp()`),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('coordination_events_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('coordination_events_id_org_project_uq').on(table.id, table.organizationId, table.projectId),
    index('coordination_events_project_start_idx').on(table.organizationId, table.projectId, table.startsAt),
    foreignKey({
      name: 'coordination_events_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'coordination_events_location_fk',
      columns: [table.locationId, table.organizationId, table.projectId],
      foreignColumns: [projectLocations.id, projectLocations.organizationId, projectLocations.projectId],
    }).onDelete('set null'),
    foreignKey({
      name: 'coordination_events_work_package_fk',
      columns: [table.workPackageId, table.organizationId, table.projectId],
      foreignColumns: [workPackages.id, workPackages.organizationId, workPackages.projectId],
    }).onDelete('set null'),
    foreignKey({
      name: 'coordination_events_phase_fk',
      columns: [table.phaseId, table.organizationId, table.projectId],
      foreignColumns: [phases.id, phases.organizationId, phases.projectId],
    }).onDelete('set null'),
    check('coordination_events_title_not_blank', sql`length(btrim(${table.title})) > 0`),
    check(
      'coordination_events_kind_known',
      sql`${table.kind} IN ('concrete_pour','installation','inspection','delivery','handover','testing','meeting','other')`,
    ),
    check(
      'coordination_events_status_known',
      sql`${table.status} IN ('scheduled','completed','partially_completed','postponed','cancelled')`,
    ),
    check('coordination_events_time_order', sql`${table.endsAt} IS NULL OR ${table.endsAt} >= ${table.startsAt}`),
    check(
      'coordination_events_prep_before_start',
      sql`${table.preparationDeadline} IS NULL OR ${table.preparationDeadline} <= ${table.startsAt}`,
    ),
    check('coordination_events_acks_array', sql`jsonb_typeof(${table.requiredAcknowledgements}) = 'array'`),
  ],
);

export const coordinationEventParticipants = pgTable(
  'coordination_event_participants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    eventId: uuid('event_id').notNull(),
    kind: text('kind').$type<'contractor' | 'internal'>().notNull(),
    vendorId: uuid('vendor_id'),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    tradeLabel: text('trade_label'),
    /** Snapshot taken by the DB trigger from vendors / profiles; never client input. */
    partyName: text('party_name').notNull().default(''),
    agreementTitle: text('agreement_title'),
    isRequired: boolean('is_required').notNull().default(true),
    readinessRequestedAt: ts('readiness_requested_at'),
    invitedByUserId: uuid('invited_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    removedAt: ts('removed_at'),
    removedByUserId: uuid('removed_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().default(sql`clock_timestamp()`),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('coordination_participants_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('coordination_participants_id_org_event_vendor_uq').on(
      table.id,
      table.organizationId,
      table.eventId,
      table.vendorId,
    ),
    uniqueIndex('coordination_participants_contractor_uq')
      .on(
        table.eventId,
        table.vendorId,
        sql`COALESCE(${table.subcontractAgreementId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${table.kind} = 'contractor' AND ${table.removedAt} IS NULL`),
    uniqueIndex('coordination_participants_internal_uq')
      .on(table.eventId, table.userId)
      .where(sql`${table.kind} = 'internal' AND ${table.removedAt} IS NULL`),
    index('coordination_participants_event_idx').on(table.organizationId, table.eventId),
    index('coordination_participants_vendor_idx')
      .on(table.organizationId, table.vendorId, table.projectId)
      .where(sql`${table.kind} = 'contractor' AND ${table.removedAt} IS NULL`),
    foreignKey({
      name: 'coordination_participants_event_fk',
      columns: [table.eventId, table.organizationId, table.projectId],
      foreignColumns: [coordinationEvents.id, coordinationEvents.organizationId, coordinationEvents.projectId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'coordination_participants_vendor_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'coordination_participants_agreement_vendor_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.vendorId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'coordination_participants_agreement_project_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.projectId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.projectId,
      ],
    }).onDelete('cascade'),
    check(
      'coordination_participants_kind_shape',
      sql`(${table.kind} = 'contractor' AND ${table.vendorId} IS NOT NULL AND ${table.userId} IS NULL)
        OR (${table.kind} = 'internal' AND ${table.userId} IS NOT NULL AND ${table.vendorId} IS NULL AND ${table.subcontractAgreementId} IS NULL)`,
    ),
  ],
);

/** Append-only (DB trigger). Latest row per participant (after the readiness epoch) is the current answer. */
export const coordinationResponses = pgTable(
  'coordination_responses',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    eventId: uuid('event_id').notNull(),
    participantId: uuid('participant_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    status: text('status').$type<CoordinationResponseStatus>().notNull(),
    note: text('note'),
    acknowledgedKeys: text('acknowledged_keys').array().notNull().default(sql`'{}'::text[]`),
    issueRaised: boolean('issue_raised').notNull().default(false),
    eventStartsAtSnapshot: ts('event_starts_at_snapshot').notNull(),
    actorType: text('actor_type').$type<'internal' | 'external'>().notNull(),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorPrincipalId: uuid('actor_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    createdAt: ts('created_at').notNull().default(sql`clock_timestamp()`),
  },
  (table) => [
    uniqueIndex('coordination_responses_id_organization_id_uq').on(table.id, table.organizationId),
    index('coordination_responses_event_idx').on(
      table.organizationId,
      table.eventId,
      table.participantId,
      table.createdAt,
    ),
    index('coordination_responses_vendor_idx').on(table.organizationId, table.vendorId, table.createdAt),
    foreignKey({
      name: 'coordination_responses_participant_fk',
      columns: [table.participantId, table.organizationId, table.eventId, table.vendorId],
      foreignColumns: [
        coordinationEventParticipants.id,
        coordinationEventParticipants.organizationId,
        coordinationEventParticipants.eventId,
        coordinationEventParticipants.vendorId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'coordination_responses_event_fk',
      columns: [table.eventId, table.organizationId, table.projectId],
      foreignColumns: [coordinationEvents.id, coordinationEvents.organizationId, coordinationEvents.projectId],
    }).onDelete('cascade'),
    check(
      'coordination_responses_status_known',
      sql`${table.status} IN ('ready','not_ready','ready_with_conditions','acknowledged','blocked')`,
    ),
    check(
      'coordination_responses_note_required',
      sql`${table.status} NOT IN ('not_ready','ready_with_conditions','blocked') OR (${table.note} IS NOT NULL AND length(btrim(${table.note})) > 0)`,
    ),
    check(
      'coordination_responses_actor_shape',
      sql`(${table.actorType} = 'internal' AND ${table.actorUserId} IS NOT NULL AND ${table.actorPrincipalId} IS NULL)
        OR (${table.actorType} = 'external' AND ${table.actorPrincipalId} IS NOT NULL AND ${table.actorUserId} IS NULL)`,
    ),
  ],
);

export const coordinationIssues = pgTable(
  'coordination_issues',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    eventId: uuid('event_id').notNull(),
    participantId: uuid('participant_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    responseId: uuid('response_id'),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').$type<CoordinationIssueStatus>().notNull().default('open'),
    /** tasks.id created through createLinkedTask (tasks has no (id, organization_id) key; entity_links holds the edge). */
    taskId: uuid('task_id'),
    raisedActorType: text('raised_actor_type').$type<'internal' | 'external'>().notNull(),
    raisedByUserId: uuid('raised_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    raisedByPrincipalId: uuid('raised_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    resolvedAt: ts('resolved_at'),
    createdAt: ts('created_at').notNull().default(sql`clock_timestamp()`),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('coordination_issues_id_organization_id_uq').on(table.id, table.organizationId),
    index('coordination_issues_event_idx').on(table.organizationId, table.eventId, table.createdAt),
    foreignKey({
      name: 'coordination_issues_participant_fk',
      columns: [table.participantId, table.organizationId, table.eventId, table.vendorId],
      foreignColumns: [
        coordinationEventParticipants.id,
        coordinationEventParticipants.organizationId,
        coordinationEventParticipants.eventId,
        coordinationEventParticipants.vendorId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'coordination_issues_event_fk',
      columns: [table.eventId, table.organizationId, table.projectId],
      foreignColumns: [coordinationEvents.id, coordinationEvents.organizationId, coordinationEvents.projectId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'coordination_issues_response_fk',
      columns: [table.responseId, table.organizationId],
      foreignColumns: [coordinationResponses.id, coordinationResponses.organizationId],
    }).onDelete('set null'),
    check('coordination_issues_title_not_blank', sql`length(btrim(${table.title})) > 0`),
    check('coordination_issues_status_known', sql`${table.status} IN ('open','task_created','dismissed')`),
    check(
      'coordination_issues_task_shape',
      sql`(${table.status} = 'task_created' AND ${table.taskId} IS NOT NULL) OR (${table.status} <> 'task_created')`,
    ),
    check(
      'coordination_issues_actor_shape',
      sql`(${table.raisedActorType} = 'internal' AND ${table.raisedByUserId} IS NOT NULL AND ${table.raisedByPrincipalId} IS NULL)
        OR (${table.raisedActorType} = 'external' AND ${table.raisedByPrincipalId} IS NOT NULL AND ${table.raisedByUserId} IS NULL)`,
    ),
  ],
);

/** Append-only reschedule history. */
export const coordinationReschedules = pgTable(
  'coordination_reschedules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    eventId: uuid('event_id').notNull(),
    previousStartsAt: ts('previous_starts_at').notNull(),
    previousEndsAt: ts('previous_ends_at'),
    newStartsAt: ts('new_starts_at').notNull(),
    newEndsAt: ts('new_ends_at'),
    reason: text('reason').notNull(),
    requiresReconfirmation: boolean('requires_reconfirmation').notNull().default(true),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    createdAt: ts('created_at').notNull().default(sql`clock_timestamp()`),
  },
  (table) => [
    index('coordination_reschedules_event_idx').on(table.organizationId, table.eventId, table.createdAt),
    foreignKey({
      name: 'coordination_reschedules_event_fk',
      columns: [table.eventId, table.organizationId, table.projectId],
      foreignColumns: [coordinationEvents.id, coordinationEvents.organizationId, coordinationEvents.projectId],
    }).onDelete('cascade'),
    check('coordination_reschedules_reason_not_blank', sql`length(btrim(${table.reason})) > 0`),
    check(
      'coordination_reschedules_time_order',
      sql`${table.newEndsAt} IS NULL OR ${table.newEndsAt} >= ${table.newStartsAt}`,
    ),
  ],
);

/** Append-only authorized readiness overrides; latest row wins ('cleared' returns to computed readiness). */
export const coordinationReadinessOverrides = pgTable(
  'coordination_readiness_overrides',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    eventId: uuid('event_id').notNull(),
    decision: text('decision').$type<CoordinationOverrideDecision>().notNull(),
    reason: text('reason').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    createdAt: ts('created_at').notNull().default(sql`clock_timestamp()`),
  },
  (table) => [
    index('coordination_overrides_event_idx').on(table.organizationId, table.eventId, table.createdAt),
    foreignKey({
      name: 'coordination_overrides_event_fk',
      columns: [table.eventId, table.organizationId, table.projectId],
      foreignColumns: [coordinationEvents.id, coordinationEvents.organizationId, coordinationEvents.projectId],
    }).onDelete('cascade'),
    check(
      'coordination_overrides_decision_known',
      sql`${table.decision} IN ('force_ready','force_not_ready','cleared')`,
    ),
    check('coordination_overrides_reason_not_blank', sql`length(btrim(${table.reason})) > 0`),
  ],
);

/** Append-only outcome records; coordination_events.status mirrors the latest one. */
export const coordinationOutcomes = pgTable(
  'coordination_outcomes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    eventId: uuid('event_id').notNull(),
    outcome: text('outcome').$type<CoordinationOutcome>().notNull(),
    actualStartAt: ts('actual_start_at'),
    actualEndAt: ts('actual_end_at'),
    note: text('note'),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    createdAt: ts('created_at').notNull().default(sql`clock_timestamp()`),
  },
  (table) => [
    index('coordination_outcomes_event_idx').on(table.organizationId, table.eventId, table.createdAt),
    foreignKey({
      name: 'coordination_outcomes_event_fk',
      columns: [table.eventId, table.organizationId, table.projectId],
      foreignColumns: [coordinationEvents.id, coordinationEvents.organizationId, coordinationEvents.projectId],
    }).onDelete('cascade'),
    check(
      'coordination_outcomes_outcome_known',
      sql`${table.outcome} IN ('completed','partially_completed','postponed','cancelled')`,
    ),
    check(
      'coordination_outcomes_actual_required',
      sql`${table.outcome} NOT IN ('completed','partially_completed') OR ${table.actualStartAt} IS NOT NULL`,
    ),
    check(
      'coordination_outcomes_time_order',
      sql`${table.actualEndAt} IS NULL OR ${table.actualStartAt} IS NULL OR ${table.actualEndAt} >= ${table.actualStartAt}`,
    ),
    check(
      'coordination_outcomes_note_required',
      sql`${table.outcome} NOT IN ('partially_completed','postponed','cancelled') OR (${table.note} IS NOT NULL AND length(btrim(${table.note})) > 0)`,
    ),
  ],
);

export const coordinationEventDocuments = pgTable(
  'coordination_event_documents',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    eventId: uuid('event_id').notNull(),
    documentId: uuid('document_id').notNull(),
    /** Snapshot of documents.original_filename taken by the DB trigger. */
    titleSnapshot: text('title_snapshot').notNull().default(''),
    contractorVisible: boolean('contractor_visible').notNull().default(true),
    linkedByUserId: uuid('linked_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('coordination_event_documents_uq').on(table.eventId, table.documentId),
    index('coordination_event_documents_event_idx').on(table.organizationId, table.eventId),
    foreignKey({
      name: 'coordination_event_documents_event_fk',
      columns: [table.eventId, table.organizationId, table.projectId],
      foreignColumns: [coordinationEvents.id, coordinationEvents.organizationId, coordinationEvents.projectId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'coordination_event_documents_document_fk',
      columns: [table.documentId, table.organizationId],
      foreignColumns: [documents.id, documents.organizationId],
    }).onDelete('cascade'),
  ],
);
