import { sql } from 'drizzle-orm';
import {
  boolean,
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
import { archivedAt, primaryId, timestamps } from './_shared';
import { documents } from './documents';
import { profiles } from './identity';
import { externalPrincipals } from './portal';
import { warrantyCoverages } from './next-gen-experience';
import { projects, workPackages } from './projects';
import { organizations } from './tenancy';
import { subcontractAgreements } from './platform-ops';
import { vendors } from './vendors';

/** Track Q — contractor tender/award, agreement closeout, warranty reports, performance snapshots. */

export const contractorTenderPackages = pgTable(
  'contractor_tender_packages',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    workPackageId: uuid('work_package_id'),
    tradeKey: text('trade_key').notNull(),
    title: text('title').notNull(),
    scopeDescription: text('scope_description'),
    status: text('status').notNull().default('draft'),
    awardedVendorId: uuid('awarded_vendor_id'),
    awardedAgreementId: uuid('awarded_agreement_id'),
    awardedAt: timestamp('awarded_at', { withTimezone: true, mode: 'date' }),
    awardedByUserId: uuid('awarded_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('contractor_tender_packages_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('contractor_tender_packages_id_org_project_uq').on(
      table.id,
      table.organizationId,
      table.projectId,
    ),
    index('contractor_tender_packages_project_idx').on(table.organizationId, table.projectId, table.status),
    check('contractor_tender_packages_status_known', sql`${table.status} IN ('draft','inviting','evaluating','awarded','cancelled')`),
    foreignKey({
      name: 'contractor_tender_packages_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'contractor_tender_packages_wp_project_fk',
      columns: [table.workPackageId, table.organizationId, table.projectId],
      foreignColumns: [workPackages.id, workPackages.organizationId, workPackages.projectId],
    }).onDelete('set null'),
  ],
);

export const contractorTenderInvitations = pgTable(
  'contractor_tender_invitations',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    packageId: uuid('package_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    status: text('status').notNull().default('invited'),
    invitedAt: timestamp('invited_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    invitedByUserId: uuid('invited_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('contractor_tender_invitations_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('contractor_tender_invitations_scope_uq').on(
      table.id,
      table.organizationId,
      table.projectId,
      table.packageId,
      table.vendorId,
    ),
    uniqueIndex('contractor_tender_invitations_package_vendor_uq').on(
      table.organizationId,
      table.packageId,
      table.vendorId,
    ),
    check('contractor_tender_invitations_status_known', sql`${table.status} IN ('invited','declined','submitted')`),
    foreignKey({
      name: 'contractor_tender_invitations_package_fk',
      columns: [table.packageId, table.organizationId, table.projectId],
      foreignColumns: [
        contractorTenderPackages.id,
        contractorTenderPackages.organizationId,
        contractorTenderPackages.projectId,
      ],
    }).onDelete('cascade'),
  ],
);

export const contractorTenderOffers = pgTable(
  'contractor_tender_offers',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    packageId: uuid('package_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    invitationId: uuid('invitation_id').notNull(),
    revision: integer('revision').notNull().default(1),
    notes: text('notes'),
    status: text('status').notNull().default('draft'),
    submittedActorType: text('submitted_actor_type').notNull().default('external'),
    submittedByUserId: uuid('submitted_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    submittedByPrincipalId: uuid('submitted_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('contractor_tender_offers_id_org_uq').on(table.id, table.organizationId),
    index('contractor_tender_offers_package_idx').on(table.organizationId, table.packageId, table.status),
    check(
      'contractor_tender_offers_status_known',
      sql`${table.status} IN ('draft','submitted','withdrawn','selected','rejected')`,
    ),
    foreignKey({
      name: 'contractor_tender_offers_package_fk',
      columns: [table.packageId, table.organizationId, table.projectId],
      foreignColumns: [
        contractorTenderPackages.id,
        contractorTenderPackages.organizationId,
        contractorTenderPackages.projectId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'contractor_tender_offers_invitation_fk',
      columns: [table.invitationId, table.organizationId],
      foreignColumns: [contractorTenderInvitations.id, contractorTenderInvitations.organizationId],
    }).onDelete('cascade'),
  ],
);

export const contractorTenderOfferFinancials = pgTable(
  'contractor_tender_offer_financials',
  {
    offerId: uuid('offer_id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    bidAmount: numeric('bid_amount', { precision: 18, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    leadTimeDays: integer('lead_time_days'),
    validUntil: date('valid_until'),
  },
  (table) => [
    foreignKey({
      name: 'contractor_tender_offer_financials_offer_fk',
      columns: [table.offerId, table.organizationId],
      foreignColumns: [contractorTenderOffers.id, contractorTenderOffers.organizationId],
    }).onDelete('cascade'),
  ],
);

export const subcontractAgreementCloseouts = pgTable(
  'subcontract_agreement_closeouts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id').notNull(),
    status: text('status').notNull().default('open'),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    closedByUserId: uuid('closed_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    closeOverrideReason: text('close_override_reason'),
    closeOverrideByUserId: uuid('close_override_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    closeOverrideAt: timestamp('close_override_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('subcontract_agreement_closeouts_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('subcontract_agreement_closeouts_id_org_project_uq').on(
      table.id,
      table.organizationId,
      table.projectId,
    ),
    uniqueIndex('subcontract_agreement_closeouts_agreement_uq').on(
      table.organizationId,
      table.subcontractAgreementId,
    ),
    check('subcontract_agreement_closeouts_status_known', sql`${table.status} IN ('open','ready','closed')`),
    foreignKey({
      name: 'subcontract_agreement_closeouts_agreement_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.vendorId],
    }).onDelete('cascade'),
  ],
);

export const subcontractCloseoutChecklistItems = pgTable(
  'subcontract_closeout_checklist_items',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    closeoutId: uuid('closeout_id').notNull(),
    itemKind: text('item_kind').notNull(),
    title: text('title').notNull(),
    isRequired: boolean('is_required').notNull().default(true),
    status: text('status').notNull().default('pending'),
    documentId: uuid('document_id'),
    notes: text('notes'),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    completedActorType: text('completed_actor_type'),
    completedByUserId: uuid('completed_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    completedByPrincipalId: uuid('completed_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    waiveReason: text('waive_reason'),
    waivedByUserId: uuid('waived_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    waivedAt: timestamp('waived_at', { withTimezone: true, mode: 'date' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    uniqueIndex('subcontract_closeout_items_id_org_uq').on(table.id, table.organizationId),
    index('subcontract_closeout_items_closeout_idx').on(table.organizationId, table.closeoutId, table.sortOrder),
    check(
      'subcontract_closeout_items_status_known',
      sql`${table.status} IN ('pending','submitted','complete','waived')`,
    ),
    foreignKey({
      name: 'subcontract_closeout_items_closeout_fk',
      columns: [table.closeoutId, table.organizationId, table.projectId],
      foreignColumns: [
        subcontractAgreementCloseouts.id,
        subcontractAgreementCloseouts.organizationId,
        subcontractAgreementCloseouts.projectId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'subcontract_closeout_items_document_fk',
      columns: [table.documentId, table.organizationId],
      foreignColumns: [documents.id, documents.organizationId],
    }).onDelete('set null'),
  ],
);

export const contractorWarrantyReports = pgTable(
  'contractor_warranty_reports',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id').notNull(),
    warrantyCoverageId: uuid('warranty_coverage_id'),
    title: text('title').notNull(),
    notes: text('notes'),
    status: text('status').notNull().default('open'),
    reportedActorType: text('reported_actor_type').notNull().default('internal'),
    reportedByUserId: uuid('reported_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    reportedByPrincipalId: uuid('reported_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    reportedAt: timestamp('reported_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    retentionFlag: boolean('retention_flag').notNull().default(false),
    guaranteeFlag: boolean('guarantee_flag').notNull().default(false),
  },
  (table) => [
    uniqueIndex('contractor_warranty_reports_id_org_uq').on(table.id, table.organizationId),
    index('contractor_warranty_reports_agreement_idx').on(
      table.organizationId,
      table.subcontractAgreementId,
      table.status,
    ),
    check(
      'contractor_warranty_reports_status_known',
      sql`${table.status} IN ('open','in_progress','resolved','cancelled')`,
    ),
    foreignKey({
      name: 'contractor_warranty_reports_agreement_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.vendorId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'contractor_warranty_reports_coverage_fk',
      columns: [table.warrantyCoverageId, table.organizationId, table.projectId],
      foreignColumns: [warrantyCoverages.id, warrantyCoverages.organizationId, warrantyCoverages.projectId],
    }).onDelete('set null'),
  ],
);

export const contractorPerformanceSnapshots = pgTable(
  'contractor_performance_snapshots',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id').notNull(),
    formulaVersion: text('formula_version').notNull().default('q-v1'),
    metricsJson: jsonb('metrics_json').notNull().default({}),
    computedAt: timestamp('computed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    computedByUserId: uuid('computed_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
  },
  (table) => [
    uniqueIndex('contractor_performance_snapshots_id_org_uq').on(table.id, table.organizationId),
    index('contractor_performance_snapshots_agreement_idx').on(
      table.organizationId,
      table.subcontractAgreementId,
      table.computedAt,
    ),
    foreignKey({
      name: 'contractor_performance_snapshots_agreement_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.vendorId],
    }).onDelete('cascade'),
  ],
);
