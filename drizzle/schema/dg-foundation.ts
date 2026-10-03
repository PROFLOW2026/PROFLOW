import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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
import { archivedAt, currencyCode, moneyAmount, primaryId, timestamps } from './_shared';
import { profiles } from './identity';
import { externalPrincipals } from './portal';
import { subcontractAgreements } from './platform-ops';
import { projects } from './projects';
import { organizations } from './tenancy';

/**
 * Developer / GC layer - FOUNDATION tables (migration 0155). Owned by the MAIN AGENT.
 * Later tracks reference these by (id, organization_id[, project_id]) composite FKs.
 */

export const PROJECT_LOCATION_TYPES = [
  'site',
  'building',
  'wing',
  'floor',
  'apartment',
  'unit',
  'room',
  'area',
  'zone',
  'parking',
  'basement',
  'roof',
  'facade',
  'infrastructure',
  'other',
] as const;
export type ProjectLocationType = (typeof PROJECT_LOCATION_TYPES)[number];

export const projectLocations = pgTable(
  'project_locations',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    parentId: uuid('parent_id'),
    type: text('type').$type<ProjectLocationType>().notNull().default('area'),
    code: text('code'),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_locations_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('project_locations_id_org_project_uq').on(
      table.id,
      table.organizationId,
      table.projectId,
    ),
    uniqueIndex('project_locations_code_uq')
      .on(
        table.organizationId,
        table.projectId,
        sql`COALESCE(${table.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        sql`lower(${table.code})`,
      )
      .where(sql`${table.code} is not null and ${table.archivedAt} is null`),
    index('project_locations_project_parent_idx').on(
      table.organizationId,
      table.projectId,
      table.parentId,
      table.sortOrder,
    ),
    foreignKey({
      name: 'project_locations_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'project_locations_parent_fk',
      columns: [table.parentId, table.organizationId, table.projectId],
      foreignColumns: [table.id, table.organizationId, table.projectId],
    }).onDelete('restrict'),
    check(
      'project_locations_type_known',
      sql`${table.type} IN ('site','building','wing','floor','apartment','unit','room','area','zone','parking','basement','roof','facade','infrastructure','other')`,
    ),
    check('project_locations_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check(
      'project_locations_not_own_parent',
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
  ],
);

export const SUBCONTRACT_WORK_LINE_STATUSES = ['active', 'closed', 'cancelled'] as const;

/** Operational work line: NO money columns (see subcontractWorkLinePrices). */
export const subcontractWorkLines = pgTable(
  'subcontract_work_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agreementId: uuid('agreement_id').notNull(),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    parentLineId: uuid('parent_line_id'),
    code: text('code'),
    description: text('description').notNull(),
    unit: text('unit').notNull().default('unit'),
    quantity: numeric('quantity', { precision: 18, scale: 6, mode: 'string' }).notNull().default('0'),
    locationId: uuid('location_id'),
    workPackageId: uuid('work_package_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').$type<(typeof SUBCONTRACT_WORK_LINE_STATUSES)[number]>().notNull().default('active'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('subcontract_work_lines_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('subcontract_work_lines_id_org_agreement_uq').on(
      table.id,
      table.organizationId,
      table.agreementId,
    ),
    uniqueIndex('subcontract_work_lines_code_uq')
      .on(table.organizationId, table.agreementId, sql`lower(${table.code})`)
      .where(sql`${table.code} is not null and ${table.archivedAt} is null`),
    index('subcontract_work_lines_agreement_idx').on(
      table.organizationId,
      table.agreementId,
      table.sortOrder,
    ),
    index('subcontract_work_lines_project_idx').on(table.organizationId, table.projectId),
    foreignKey({
      name: 'subcontract_work_lines_agreement_project_fk',
      columns: [table.agreementId, table.organizationId, table.projectId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.projectId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'subcontract_work_lines_agreement_vendor_fk',
      columns: [table.agreementId, table.organizationId, table.vendorId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.vendorId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'subcontract_work_lines_location_fk',
      columns: [table.locationId, table.organizationId, table.projectId],
      foreignColumns: [
        projectLocations.id,
        projectLocations.organizationId,
        projectLocations.projectId,
      ],
    }).onDelete('set null'),
    foreignKey({
      name: 'subcontract_work_lines_parent_fk',
      columns: [table.parentLineId, table.organizationId, table.agreementId],
      foreignColumns: [table.id, table.organizationId, table.agreementId],
    }).onDelete('restrict'),
    check(
      'subcontract_work_lines_status_known',
      sql`${table.status} IN ('active', 'closed', 'cancelled')`,
    ),
    check('subcontract_work_lines_quantity_non_negative', sql`${table.quantity} >= 0`),
    check(
      'subcontract_work_lines_description_not_blank',
      sql`length(btrim(${table.description})) > 0`,
    ),
    check(
      'subcontract_work_lines_not_own_parent',
      sql`${table.parentLineId} IS NULL OR ${table.parentLineId} <> ${table.id}`,
    ),
  ],
);

/** Financial side of a work line (NET). RLS: contract.financial.view / ext.contract.view_value. */
export const subcontractWorkLinePrices = pgTable(
  'subcontract_work_line_prices',
  {
    workLineId: uuid('work_line_id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    currency: currencyCode().notNull(),
    unitPrice: moneyAmount('unit_price').notNull().default('0'),
    contractAmount: moneyAmount('contract_amount').notNull().default('0'),
    ...timestamps(),
  },
  (table) => [
    foreignKey({
      name: 'subcontract_work_line_prices_line_org_fk',
      columns: [table.workLineId, table.organizationId],
      foreignColumns: [subcontractWorkLines.id, subcontractWorkLines.organizationId],
    }).onDelete('cascade'),
    check(
      'subcontract_work_line_prices_non_negative',
      sql`${table.unitPrice} >= 0 AND ${table.contractAmount} >= 0`,
    ),
  ],
);

export const entityLinks = pgTable(
  'entity_links',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    relation: text('relation').notNull().default('related'),
    actorType: text('actor_type').$type<'internal' | 'external' | 'system'>().notNull().default('internal'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorPrincipalId: uuid('actor_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('entity_links_edge_uq').on(
      table.organizationId,
      table.sourceType,
      table.sourceId,
      table.targetType,
      table.targetId,
      table.relation,
    ),
    index('entity_links_source_idx').on(table.organizationId, table.sourceType, table.sourceId),
    index('entity_links_target_idx').on(table.organizationId, table.targetType, table.targetId),
    foreignKey({
      name: 'entity_links_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check(
      'entity_links_type_shape',
      sql`${table.sourceType} ~ '^[a-z][a-z0-9_]*$' AND ${table.targetType} ~ '^[a-z][a-z0-9_]*$' AND ${table.relation} ~ '^[a-z][a-z0-9_]*$'`,
    ),
    check(
      'entity_links_actor_shape',
      sql`(${table.actorType} = 'internal' AND ${table.actorPrincipalId} IS NULL)
        OR (${table.actorType} = 'external' AND ${table.actorPrincipalId} IS NOT NULL AND ${table.actorUserId} IS NULL)
        OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL AND ${table.actorPrincipalId} IS NULL)`,
    ),
  ],
);

export const domainEvents = pgTable(
  'domain_events',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'),
    eventType: text('event_type').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    actorType: text('actor_type').$type<'internal' | 'external' | 'system'>().notNull().default('internal'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorPrincipalId: uuid('actor_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (table) => [
    index('domain_events_unprocessed_idx')
      .on(table.occurredAt)
      .where(sql`${table.processedAt} is null`),
    index('domain_events_entity_idx').on(table.organizationId, table.entityType, table.entityId),
    index('domain_events_project_idx').on(table.organizationId, table.projectId, table.occurredAt),
    foreignKey({
      name: 'domain_events_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check(
      'domain_events_type_shape',
      sql`${table.eventType} ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*){2,}$'`,
    ),
    check(
      'domain_events_actor_shape',
      sql`(${table.actorType} = 'internal' AND ${table.actorPrincipalId} IS NULL)
        OR (${table.actorType} = 'external' AND ${table.actorPrincipalId} IS NOT NULL AND ${table.actorUserId} IS NULL)
        OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL AND ${table.actorPrincipalId} IS NULL)`,
    ),
  ],
);