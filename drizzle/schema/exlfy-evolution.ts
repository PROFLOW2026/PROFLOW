import { sql } from 'drizzle-orm';
import {
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
import { createdAt, primaryId, timestamps } from './_shared';
import { drawingRevisions } from './dg-documents-plans';
import { profiles } from './identity';
import { organizations } from './tenancy';
import { projects } from './projects';
import { vendors } from './vendors';

/**
 * EXLFY local evolution tables from migration 0200 (BUG-007).
 * DDL + RLS live in `0200_exlfy_evolution_local.sql`; this file is the Drizzle mirror.
 */

export const DRAWING_SHEET_MARK_KINDS = ['pin', 'note', 'measure'] as const;
export const PROJECT_RISK_STATUSES = ['open', 'mitigating', 'closed'] as const;
export const WORK_PERMIT_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'closed',
] as const;
export const WHATSAPP_INBOUND_STATUSES = ['rejected', 'drafted', 'duplicate'] as const;
export const NOTIFICATION_EMAIL_LOG_STATUSES = ['sent', 'skipped', 'failed'] as const;

export const drawingSheetMarks = pgTable(
  'drawing_sheet_marks',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    drawingRevisionId: uuid('drawing_revision_id').notNull(),
    pageIndex: integer('page_index').notNull().default(0),
    kind: text('kind').$type<(typeof DRAWING_SHEET_MARK_KINDS)[number]>().notNull(),
    geometry: jsonb('geometry').notNull().default(sql`'{}'::jsonb`),
    note: text('note'),
    linkedEntityType: text('linked_entity_type'),
    linkedEntityId: uuid('linked_entity_id'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (table) => [
    index('drawing_sheet_marks_revision_idx').on(
      table.organizationId,
      table.drawingRevisionId,
      table.pageIndex,
    ),
    foreignKey({
      name: 'drawing_sheet_marks_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'drawing_sheet_marks_revision_org_fk',
      columns: [table.drawingRevisionId, table.organizationId],
      foreignColumns: [drawingRevisions.id, drawingRevisions.organizationId],
    }).onDelete('cascade'),
    check('drawing_sheet_marks_kind_known', sql`${table.kind} IN ('pin', 'note', 'measure')`),
    check('drawing_sheet_marks_page_nonneg', sql`${table.pageIndex} >= 0`),
  ],
);

export const projectRisks = pgTable(
  'project_risks',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    description: text('description').notNull(),
    probability: integer('probability').notNull(),
    impact: integer('impact').notNull(),
    ownerUserId: uuid('owner_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    treatment: text('treatment'),
    status: text('status')
      .$type<(typeof PROJECT_RISK_STATUSES)[number]>()
      .notNull()
      .default('open'),
    reviewOn: date('review_on', { mode: 'string' }),
    ...timestamps(),
  },
  (table) => [
    index('project_risks_project_idx').on(table.organizationId, table.projectId, table.status),
    foreignKey({
      name: 'project_risks_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check(
      'project_risks_probability_range',
      sql`${table.probability} >= 1 AND ${table.probability} <= 5`,
    ),
    check('project_risks_impact_range', sql`${table.impact} >= 1 AND ${table.impact} <= 5`),
    check(
      'project_risks_status_known',
      sql`${table.status} IN ('open', 'mitigating', 'closed')`,
    ),
  ],
);

export const supplierRfqAccessTokens = pgTable(
  'supplier_rfq_access_tokens',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    rfqId: uuid('rfq_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('supplier_rfq_access_tokens_hash_uq').on(table.tokenHash),
    index('supplier_rfq_access_tokens_rfq_idx').on(table.organizationId, table.rfqId),
    foreignKey({
      name: 'supplier_rfq_access_tokens_vendor_org_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('cascade'),
  ],
);

export const workPermits = pgTable(
  'work_permits',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    title: text('title').notNull(),
    permitType: text('permit_type').notNull(),
    status: text('status')
      .$type<(typeof WORK_PERMIT_STATUSES)[number]>()
      .notNull()
      .default('draft'),
    requestedByUserId: uuid('requested_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    decidedByUserId: uuid('decided_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    validFrom: date('valid_from', { mode: 'string' }),
    validUntil: date('valid_until', { mode: 'string' }),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    index('work_permits_project_idx').on(table.organizationId, table.projectId, table.status),
    foreignKey({
      name: 'work_permits_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check(
      'work_permits_status_known',
      sql`${table.status} IN ('draft', 'submitted', 'approved', 'rejected', 'closed')`,
    ),
  ],
);

export const whatsappInboundEvents = pgTable(
  'whatsapp_inbound_events',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    externalMessageId: text('external_message_id').notNull(),
    fromPhone: text('from_phone'),
    status: text('status')
      .$type<(typeof WHATSAPP_INBOUND_STATUSES)[number]>()
      .notNull()
      .default('rejected'),
    captureId: uuid('capture_id'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('whatsapp_inbound_events_message_uq').on(
      table.organizationId,
      table.externalMessageId,
    ),
    check(
      'whatsapp_inbound_events_status_known',
      sql`${table.status} IN ('rejected', 'drafted', 'duplicate')`,
    ),
  ],
);

export const notificationEmailLog = pgTable(
  'notification_email_log',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    dedupeKey: text('dedupe_key').notNull(),
    recipientEmail: text('recipient_email').notNull(),
    status: text('status').$type<(typeof NOTIFICATION_EMAIL_LOG_STATUSES)[number]>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('notification_email_log_dedupe_uq').on(
      table.organizationId,
      table.dedupeKey,
      table.recipientEmail,
    ),
    check(
      'notification_email_log_status_known',
      sql`${table.status} IN ('sent', 'skipped', 'failed')`,
    ),
  ],
);
