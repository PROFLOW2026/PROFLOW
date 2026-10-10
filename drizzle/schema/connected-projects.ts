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
import { currencyCode, moneyAmount, primaryId, timestamps } from './_shared';
import { subcontractClaimPayableBases, subcontractClaims } from './dg-claims';
import { profiles } from './identity';
import { projects } from './projects';
import { subcontractAgreements } from './platform-ops';
import { organizations } from './tenancy';
import { vendors } from './vendors';

/**
 * Connected ProjectFlow organizations (Mode B) — developer issues a connection code;
 * contractor org provisions a linked project. Claims stay on the developer tenant;
 * certified amounts project into contractor cash-flow forecasts only.
 *
 * Migration 0179. RLS lives in SQL (cross-org visibility split by side).
 */

export const ENGAGEMENT_CONNECTION_INVITATION_STATUSES = [
  'issued',
  'consumed',
  'revoked',
  'expired',
] as const;
export type EngagementConnectionInvitationStatus =
  (typeof ENGAGEMENT_CONNECTION_INVITATION_STATUSES)[number];

export const CONNECTED_PROJECT_MAPPING_STATUSES = [
  'pending',
  'provisioning',
  'active',
  'failed',
  'revoked',
] as const;
export type ConnectedProjectMappingStatus = (typeof CONNECTED_PROJECT_MAPPING_STATUSES)[number];

export const CONNECTED_PROJECT_PROVISIONING_STATUSES = [
  'not_started',
  'in_progress',
  'succeeded',
  'failed',
] as const;
export type ConnectedProjectProvisioningStatus =
  (typeof CONNECTED_PROJECT_PROVISIONING_STATUSES)[number];

export const CROSS_ORG_SYNC_OUTBOX_STATUSES = ['pending', 'processing', 'done', 'failed'] as const;
export type CrossOrgSyncOutboxStatus = (typeof CROSS_ORG_SYNC_OUTBOX_STATUSES)[number];

export const CONNECTED_CLAIM_CASH_PROJECTION_STATUSES = ['active', 'superseded', 'void'] as const;
export type ConnectedClaimCashProjectionStatus =
  (typeof CONNECTED_CLAIM_CASH_PROJECTION_STATUSES)[number];

export const CONNECTED_CLAIM_CASH_CERTAINTIES = ['confirmed', 'estimated'] as const;
export type ConnectedClaimCashCertainty = (typeof CONNECTED_CLAIM_CASH_CERTAINTIES)[number];

const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** Developer-issued single-use connection code (stores SHA-256 hash only). */
export const engagementConnectionInvitations = pgTable(
  'engagement_connection_invitations',
  {
    id: primaryId(),
    developerOrganizationId: uuid('developer_organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    developerProjectId: uuid('developer_project_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    codeHash: text('code_hash').notNull(),
    status: text('status').$type<EngagementConnectionInvitationStatus>().notNull().default('issued'),
    expiresAt: tsz('expires_at').notNull(),
    consumedAt: tsz('consumed_at'),
    revokedAt: tsz('revoked_at'),
    issuedByUserId: uuid('issued_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    consumedByOrganizationId: uuid('consumed_by_organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    consumedByUserId: uuid('consumed_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('engagement_connection_invitations_code_hash_uq').on(table.codeHash),
    index('engagement_connection_invitations_dev_org_project_idx').on(
      table.developerOrganizationId,
      table.developerProjectId,
    ),
    index('engagement_connection_invitations_agreement_idx').on(
      table.developerOrganizationId,
      table.subcontractAgreementId,
      table.status,
    ),
    uniqueIndex('engagement_connection_invitations_one_open_per_agreement_uq')
      .on(table.developerOrganizationId, table.subcontractAgreementId)
      .where(sql`${table.status} = 'issued' AND ${table.revokedAt} IS NULL AND ${table.consumedAt} IS NULL`),
    check(
      'engagement_connection_invitations_status_known',
      sql`${table.status} IN ('issued', 'consumed', 'revoked', 'expired')`,
    ),
    check('engagement_connection_invitations_code_hash_shape', sql`${table.codeHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'engagement_connection_invitations_expiry_after_creation',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      'engagement_connection_invitations_single_use',
      sql`(${table.consumedAt} IS NULL AND ${table.status} <> 'consumed')
        OR (${table.consumedAt} IS NOT NULL AND ${table.status} = 'consumed')`,
    ),
    foreignKey({
      name: 'engagement_connection_invitations_project_org_fk',
      columns: [table.developerProjectId, table.developerOrganizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'engagement_connection_invitations_agreement_org_fk',
      columns: [table.subcontractAgreementId, table.developerOrganizationId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'engagement_connection_invitations_vendor_org_fk',
      columns: [table.vendorId, table.developerOrganizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('restrict'),
  ],
);

/** Link between developer engagement and contractor org project (both sides scoped in RLS). */
export const connectedProjectMappings = pgTable(
  'connected_project_mappings',
  {
    id: primaryId(),
    invitationId: uuid('invitation_id').references(() => engagementConnectionInvitations.id, {
      onDelete: 'set null',
    }),
    developerOrganizationId: uuid('developer_organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    developerProjectId: uuid('developer_project_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id').notNull(),
    contractorOrganizationId: uuid('contractor_organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contractorProjectId: uuid('contractor_project_id'),
    contractorClientId: uuid('contractor_client_id'),
    status: text('status').$type<ConnectedProjectMappingStatus>().notNull().default('pending'),
    connectionVersion: integer('connection_version').notNull().default(1),
    provisioningStatus: text('provisioning_status')
      .$type<ConnectedProjectProvisioningStatus>()
      .notNull()
      .default('not_started'),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    acceptedAt: tsz('accepted_at'),
    revokedAt: tsz('revoked_at'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('connected_project_mappings_id_developer_org_uq').on(
      table.id,
      table.developerOrganizationId,
    ),
    uniqueIndex('connected_project_mappings_id_contractor_org_uq').on(
      table.id,
      table.contractorOrganizationId,
    ),
    uniqueIndex('connected_project_mappings_contractor_project_uq')
      .on(table.contractorProjectId)
      .where(sql`${table.contractorProjectId} IS NOT NULL`),
    uniqueIndex('connected_project_mappings_agreement_contractor_active_uq')
      .on(table.developerOrganizationId, table.subcontractAgreementId, table.contractorOrganizationId)
      .where(sql`${table.status} IN ('pending', 'provisioning', 'active')`),
    index('connected_project_mappings_developer_idx').on(
      table.developerOrganizationId,
      table.developerProjectId,
      table.status,
    ),
    index('connected_project_mappings_contractor_idx').on(
      table.contractorOrganizationId,
      table.contractorProjectId,
      table.status,
    ),
    check(
      'connected_project_mappings_status_known',
      sql`${table.status} IN ('pending', 'provisioning', 'active', 'failed', 'revoked')`,
    ),
    check(
      'connected_project_mappings_provisioning_status_known',
      sql`${table.provisioningStatus} IN ('not_started', 'in_progress', 'succeeded', 'failed')`,
    ),
    check(
      'connected_project_mappings_orgs_distinct',
      sql`${table.developerOrganizationId} <> ${table.contractorOrganizationId}`,
    ),
    foreignKey({
      name: 'connected_project_mappings_dev_project_org_fk',
      columns: [table.developerProjectId, table.developerOrganizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'connected_project_mappings_dev_agreement_org_fk',
      columns: [table.subcontractAgreementId, table.developerOrganizationId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'connected_project_mappings_contractor_project_org_fk',
      columns: [table.contractorProjectId, table.contractorOrganizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('set null'),
  ],
);

/** Minimal durable queue for cross-org delivery (e.g. claim cash projections). Worker = service_role. */
export const crossOrgSyncOutbox = pgTable(
  'cross_org_sync_outbox',
  {
    id: primaryId(),
    mappingId: uuid('mapping_id')
      .notNull()
      .references(() => connectedProjectMappings.id, { onDelete: 'cascade' }),
    developerOrganizationId: uuid('developer_organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').$type<CrossOrgSyncOutboxStatus>().notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: tsz('next_attempt_at'),
    lastError: text('last_error'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('cross_org_sync_outbox_idempotency_key_uq').on(table.idempotencyKey),
    index('cross_org_sync_outbox_pending_idx')
      .on(table.nextAttemptAt, table.createdAt)
      .where(sql`${table.status} IN ('pending', 'failed')`),
    index('cross_org_sync_outbox_mapping_idx').on(table.mappingId, table.createdAt),
    check(
      'cross_org_sync_outbox_status_known',
      sql`${table.status} IN ('pending', 'processing', 'done', 'failed')`,
    ),
    check('cross_org_sync_outbox_attempts_non_negative', sql`${table.attempts} >= 0`),
    foreignKey({
      name: 'cross_org_sync_outbox_mapping_dev_org_fk',
      columns: [table.mappingId, table.developerOrganizationId],
      foreignColumns: [connectedProjectMappings.id, connectedProjectMappings.developerOrganizationId],
    }).onDelete('cascade'),
  ],
);

/** Contractor-org cash-flow projection from developer certified claim (not payment truth). */
export const connectedClaimCashProjections = pgTable(
  'connected_claim_cash_projections',
  {
    id: primaryId(),
    mappingId: uuid('mapping_id')
      .notNull()
      .references(() => connectedProjectMappings.id, { onDelete: 'cascade' }),
    contractorOrganizationId: uuid('contractor_organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contractorProjectId: uuid('contractor_project_id'),
    developerOrganizationId: uuid('developer_organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    developerClaimId: uuid('developer_claim_id').notNull(),
    developerPayableBasisId: uuid('developer_payable_basis_id').notNull(),
    certifiedNet: moneyAmount('certified_net').notNull(),
    retentionNet: moneyAmount('retention_net').notNull().default('0'),
    currency: currencyCode().notNull(),
    expectedReceiptDate: date('expected_receipt_date', { mode: 'string' }),
    certainty: text('certainty').$type<ConnectedClaimCashCertainty>().notNull().default('confirmed'),
    status: text('status').$type<ConnectedClaimCashProjectionStatus>().notNull().default('active'),
    sourceVersion: integer('source_version').notNull().default(1),
    idempotencyKey: text('idempotency_key').notNull(),
    supersededAt: tsz('superseded_at'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('connected_claim_cash_projections_idempotency_key_uq').on(table.idempotencyKey),
    uniqueIndex('connected_claim_cash_projections_mapping_basis_uq').on(
      table.mappingId,
      table.developerPayableBasisId,
    ),
    index('connected_claim_cash_projections_contractor_project_idx').on(
      table.contractorOrganizationId,
      table.contractorProjectId,
      table.status,
    ),
    check(
      'connected_claim_cash_projections_status_known',
      sql`${table.status} IN ('active', 'superseded', 'void')`,
    ),
    check(
      'connected_claim_cash_projections_certainty_known',
      sql`${table.certainty} IN ('confirmed', 'estimated')`,
    ),
    check('connected_claim_cash_projections_certified_non_negative', sql`${table.certifiedNet} >= 0`),
    check('connected_claim_cash_projections_retention_non_negative', sql`${table.retentionNet} >= 0`),
    foreignKey({
      name: 'connected_claim_cash_projections_mapping_contractor_org_fk',
      columns: [table.mappingId, table.contractorOrganizationId],
      foreignColumns: [connectedProjectMappings.id, connectedProjectMappings.contractorOrganizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'connected_claim_cash_projections_contractor_project_org_fk',
      columns: [table.contractorProjectId, table.contractorOrganizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'connected_claim_cash_projections_dev_claim_org_fk',
      columns: [table.developerClaimId, table.developerOrganizationId],
      foreignColumns: [subcontractClaims.id, subcontractClaims.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'connected_claim_cash_projections_dev_payable_basis_org_fk',
      columns: [table.developerPayableBasisId, table.developerOrganizationId],
      foreignColumns: [subcontractClaimPayableBases.id, subcontractClaimPayableBases.organizationId],
    }).onDelete('restrict'),
  ],
);
