import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, quantityAmount, timestamps } from './_shared';
import { profiles } from './identity';
import { externalPrincipals } from './portal';
import { safetyCorrectiveActions, safetyRecords, subcontractAgreements } from './platform-ops';
import { projects } from './projects';
import { tasks } from './tasks';
import { organizations } from './tenancy';
import { vendors } from './vendors';

/**
 * Track P (migration 0166): contractor compliance, contractor site safety linkage, critical deliveries.
 * No money columns. `ON DELETE SET NULL (col)` composite FKs (documents, locations, work packages,
 * purchase orders, optional agreements) live in the SQL only: Drizzle cannot express the column list.
 */

type ActorType = 'internal' | 'external' | 'system';

export const CONTRACTOR_COMPLIANCE_KINDS = [
  'insurance',
  'guarantee',
  'tax_certificate',
  'bookkeeping_certificate',
  'safety_certification',
  'license',
  'custom',
] as const;
export type ContractorComplianceKind = (typeof CONTRACTOR_COMPLIANCE_KINDS)[number];

export const CONTRACTOR_COMPLIANCE_REVIEW_STATUSES = ['pending_review', 'approved', 'rejected'] as const;
export type ContractorComplianceReviewStatus = (typeof CONTRACTOR_COMPLIANCE_REVIEW_STATUSES)[number];

export const contractorComplianceRequirements = pgTable(
  'contractor_compliance_requirements',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id').notNull(),
    kind: text('kind').$type<ContractorComplianceKind>().notNull(),
    title: text('title').notNull(),
    description: text('description'),
    isRequired: boolean('is_required').notNull().default(true),
    blocksPayment: boolean('blocks_payment').notNull().default(true),
    requiresExpiry: boolean('requires_expiry').notNull().default(true),
    warningDays: integer('warning_days').notNull().default(30),
    sortOrder: integer('sort_order').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('contractor_compliance_requirements_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('contractor_compliance_requirements_scope_uq').on(
      table.id,
      table.organizationId,
      table.projectId,
      table.vendorId,
      table.subcontractAgreementId,
    ),
    index('contractor_compliance_requirements_agreement_idx')
      .on(table.organizationId, table.subcontractAgreementId, table.sortOrder)
      .where(sql`${table.archivedAt} is null`),
    index('contractor_compliance_requirements_project_idx')
      .on(table.organizationId, table.projectId)
      .where(sql`${table.archivedAt} is null`),
    foreignKey({
      name: 'contractor_compliance_requirements_agreement_project_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.projectId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.projectId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'contractor_compliance_requirements_agreement_vendor_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.vendorId],
    }).onDelete('cascade'),
    check(
      'contractor_compliance_requirements_kind_known',
      sql`${table.kind} IN ('insurance', 'guarantee', 'tax_certificate', 'bookkeeping_certificate', 'safety_certification', 'license', 'custom')`,
    ),
    check('contractor_compliance_requirements_title_not_blank', sql`length(btrim(${table.title})) > 0`),
    check('contractor_compliance_requirements_warning_range', sql`${table.warningDays} BETWEEN 0 AND 365`),
    check(
      'contractor_compliance_requirements_optional_never_blocks',
      sql`${table.isRequired} OR NOT ${table.blocksPayment}`,
    ),
  ],
);

/** Submissions: core columns immutable (trigger); review columns set once from pending_review. */
export const contractorComplianceDocuments = pgTable(
  'contractor_compliance_documents',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id').notNull(),
    requirementId: uuid('requirement_id').notNull(),
    referenceNumber: text('reference_number'),
    issuer: text('issuer'),
    issuedOn: date('issued_on', { mode: 'string' }),
    expiresOn: date('expires_on', { mode: 'string' }),
    notes: text('notes'),
    documentId: uuid('document_id'),
    complianceArtifactId: uuid('compliance_artifact_id'),
    submittedActorType: text('submitted_actor_type').$type<ActorType>().notNull().default('internal'),
    submittedByUserId: uuid('submitted_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    submittedByPrincipalId: uuid('submitted_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    reviewStatus: text('review_status').$type<ContractorComplianceReviewStatus>().notNull().default('pending_review'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewNote: text('review_note'),
  },
  (table) => [
    uniqueIndex('contractor_compliance_documents_id_org_uq').on(table.id, table.organizationId),
    index('contractor_compliance_documents_requirement_idx').on(
      table.organizationId,
      table.requirementId,
      table.submittedAt,
    ),
    index('contractor_compliance_documents_agreement_idx').on(table.organizationId, table.subcontractAgreementId),
    index('contractor_compliance_documents_pending_idx')
      .on(table.organizationId, table.projectId)
      .where(sql`${table.reviewStatus} = 'pending_review'`),
    index('contractor_compliance_documents_expiry_idx')
      .on(table.expiresOn)
      .where(sql`${table.reviewStatus} = 'approved' AND ${table.expiresOn} IS NOT NULL`),
    foreignKey({
      name: 'contractor_compliance_documents_requirement_fk',
      columns: [
        table.requirementId,
        table.organizationId,
        table.projectId,
        table.vendorId,
        table.subcontractAgreementId,
      ],
      foreignColumns: [
        contractorComplianceRequirements.id,
        contractorComplianceRequirements.organizationId,
        contractorComplianceRequirements.projectId,
        contractorComplianceRequirements.vendorId,
        contractorComplianceRequirements.subcontractAgreementId,
      ],
    }).onDelete('cascade'),
    check(
      'contractor_compliance_documents_review_known',
      sql`${table.reviewStatus} IN ('pending_review', 'approved', 'rejected')`,
    ),
    check(
      'contractor_compliance_documents_review_shape',
      sql`(${table.reviewStatus} = 'pending_review' AND ${table.reviewedAt} IS NULL) OR (${table.reviewStatus} IN ('approved', 'rejected') AND ${table.reviewedAt} IS NOT NULL)`,
    ),
    check(
      'contractor_compliance_documents_rejection_reason',
      sql`${table.reviewStatus} <> 'rejected' OR length(btrim(coalesce(${table.reviewNote}, ''))) > 0`,
    ),
    check(
      'contractor_compliance_documents_dates',
      sql`${table.issuedOn} IS NULL OR ${table.expiresOn} IS NULL OR ${table.expiresOn} >= ${table.issuedOn}`,
    ),
    check(
      'contractor_compliance_documents_actor_shape',
      sql`(${table.submittedActorType} = 'internal' AND ${table.submittedByPrincipalId} IS NULL)
        OR (${table.submittedActorType} = 'external' AND ${table.submittedByPrincipalId} IS NOT NULL AND ${table.submittedByUserId} IS NULL)
        OR (${table.submittedActorType} = 'system' AND ${table.submittedByUserId} IS NULL AND ${table.submittedByPrincipalId} IS NULL)`,
    ),
  ],
);

export const contractorComplianceReminders = pgTable(
  'contractor_compliance_reminders',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    requirementId: uuid('requirement_id').notNull(),
    documentId: uuid('document_id').notNull(),
    reminderKind: text('reminder_kind').$type<'expiring' | 'expired'>().notNull(),
    forExpiry: date('for_expiry', { mode: 'string' }).notNull(),
    emittedAt: timestamp('emitted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('contractor_compliance_reminders_dedupe_uq').on(
      table.organizationId,
      table.documentId,
      table.reminderKind,
      table.forExpiry,
    ),
    foreignKey({
      name: 'contractor_compliance_reminders_document_fk',
      columns: [table.documentId, table.organizationId],
      foreignColumns: [contractorComplianceDocuments.id, contractorComplianceDocuments.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'contractor_compliance_reminders_requirement_fk',
      columns: [table.requirementId, table.organizationId],
      foreignColumns: [contractorComplianceRequirements.id, contractorComplianceRequirements.organizationId],
    }).onDelete('cascade'),
    check('contractor_compliance_reminders_kind_known', sql`${table.reminderKind} IN ('expiring', 'expired')`),
  ],
);

/** 1:1 contractor linkage of an existing `safety_records` row. */
export const safetyRecordContractorLinks = pgTable(
  'safety_record_contractor_links',
  {
    safetyRecordId: uuid('safety_record_id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    locationId: uuid('location_id'),
    dueDate: date('due_date', { mode: 'string' }),
    contractorVisible: boolean('contractor_visible').notNull().default(true),
    reportedActorType: text('reported_actor_type').$type<ActorType>().notNull().default('internal'),
    reportedByUserId: uuid('reported_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    reportedByPrincipalId: uuid('reported_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    closureVerifiedAt: timestamp('closure_verified_at', { withTimezone: true, mode: 'date' }),
    closureVerifiedByUserId: uuid('closure_verified_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    closureVerificationNote: text('closure_verification_note'),
    ...timestamps(),
  },
  (table) => [
    index('safety_record_contractor_links_project_idx').on(table.organizationId, table.projectId, table.vendorId),
    index('safety_record_contractor_links_vendor_idx').on(table.organizationId, table.vendorId),
    foreignKey({
      name: 'safety_record_contractor_links_record_fk',
      columns: [table.safetyRecordId, table.organizationId],
      foreignColumns: [safetyRecords.id, safetyRecords.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'safety_record_contractor_links_project_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'safety_record_contractor_links_vendor_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('cascade'),
    check(
      'safety_record_contractor_links_actor_shape',
      sql`(${table.reportedActorType} = 'internal' AND ${table.reportedByPrincipalId} IS NULL)
        OR (${table.reportedActorType} = 'external' AND ${table.reportedByPrincipalId} IS NOT NULL AND ${table.reportedByUserId} IS NULL)
        OR (${table.reportedActorType} = 'system' AND ${table.reportedByUserId} IS NULL AND ${table.reportedByPrincipalId} IS NULL)`,
    ),
    check(
      'safety_record_contractor_links_verification_shape',
      sql`(${table.closureVerifiedAt} IS NULL AND ${table.closureVerificationNote} IS NULL) OR (${table.closureVerifiedAt} IS NOT NULL AND length(btrim(coalesce(${table.closureVerificationNote}, ''))) > 0)`,
    ),
  ],
);

export const safetyActionTaskLinks = pgTable(
  'safety_action_task_links',
  {
    correctiveActionId: uuid('corrective_action_id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    safetyRecordId: uuid('safety_record_id').notNull(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('safety_action_task_links_record_idx').on(table.organizationId, table.safetyRecordId),
    foreignKey({
      name: 'safety_action_task_links_action_fk',
      columns: [table.correctiveActionId, table.organizationId],
      foreignColumns: [safetyCorrectiveActions.id, safetyCorrectiveActions.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'safety_action_task_links_record_fk',
      columns: [table.safetyRecordId, table.organizationId],
      foreignColumns: [safetyRecords.id, safetyRecords.organizationId],
    }).onDelete('cascade'),
  ],
);

export const DELIVERY_ITEM_KINDS = ['material', 'equipment'] as const;
export type DeliveryItemKind = (typeof DELIVERY_ITEM_KINDS)[number];

export const DELIVERY_STATES = [
  'planned',
  'ordered',
  'in_transit',
  'partially_delivered',
  'delivered',
  'rejected',
  'cancelled',
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export const DELIVERY_REPORT_KINDS = ['status_update', 'delay_notice', 'arrived', 'issue', 'note'] as const;
export type DeliveryReportKind = (typeof DELIVERY_REPORT_KINDS)[number];

/** Operational delivery tracking. NO money: purchase order value stays in procurement. */
export const deliveryItems = pgTable(
  'delivery_items',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id'),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    itemName: text('item_name').notNull(),
    description: text('description'),
    itemKind: text('item_kind').$type<DeliveryItemKind>().notNull().default('material'),
    isCritical: boolean('is_critical').notNull().default(true),
    supplierVendorId: uuid('supplier_vendor_id'),
    supplierName: text('supplier_name'),
    quantity: quantityAmount('quantity'),
    unit: text('unit'),
    orderDate: date('order_date', { mode: 'string' }),
    originalExpectedDate: date('original_expected_date', { mode: 'string' }),
    expectedDate: date('expected_date', { mode: 'string' }),
    actualDate: date('actual_date', { mode: 'string' }),
    state: text('state').$type<DeliveryState>().notNull().default('planned'),
    locationId: uuid('location_id'),
    workPackageId: uuid('work_package_id'),
    purchaseOrderId: uuid('purchase_order_id'),
    notes: text('notes'),
    contractorVisible: boolean('contractor_visible').notNull().default(true),
    delayNotifiedFor: date('delay_notified_for', { mode: 'string' }),
    createdActorType: text('created_actor_type').$type<ActorType>().notNull().default('internal'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdByPrincipalId: uuid('created_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('delivery_items_id_org_uq').on(table.id, table.organizationId),
    index('delivery_items_project_idx')
      .on(table.organizationId, table.projectId, table.expectedDate)
      .where(sql`${table.archivedAt} is null`),
    index('delivery_items_vendor_idx')
      .on(table.organizationId, table.vendorId)
      .where(sql`${table.vendorId} is not null and ${table.archivedAt} is null`),
    index('delivery_items_open_expected_idx')
      .on(table.expectedDate)
      .where(
        sql`${table.archivedAt} is null and ${table.state} in ('planned', 'ordered', 'in_transit', 'partially_delivered')`,
      ),
    foreignKey({
      name: 'delivery_items_project_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check('delivery_items_kind_known', sql`${table.itemKind} IN ('material', 'equipment')`),
    check(
      'delivery_items_state_known',
      sql`${table.state} IN ('planned', 'ordered', 'in_transit', 'partially_delivered', 'delivered', 'rejected', 'cancelled')`,
    ),
    check('delivery_items_name_not_blank', sql`length(btrim(${table.itemName})) > 0`),
    check('delivery_items_quantity_non_negative', sql`${table.quantity} IS NULL OR ${table.quantity} >= 0`),
    check(
      'delivery_items_actual_when_delivered',
      sql`${table.state} NOT IN ('delivered', 'partially_delivered') OR ${table.actualDate} IS NOT NULL`,
    ),
    check(
      'delivery_items_agreement_needs_vendor',
      sql`${table.subcontractAgreementId} IS NULL OR ${table.vendorId} IS NOT NULL`,
    ),
    check(
      'delivery_items_actor_shape',
      sql`(${table.createdActorType} = 'internal' AND ${table.createdByPrincipalId} IS NULL)
        OR (${table.createdActorType} = 'external' AND ${table.createdByPrincipalId} IS NOT NULL AND ${table.createdByUserId} IS NULL)
        OR (${table.createdActorType} = 'system' AND ${table.createdByUserId} IS NULL AND ${table.createdByPrincipalId} IS NULL)`,
    ),
  ],
);

/** Append-only delivery reports (trigger denies UPDATE/DELETE). */
export const deliveryItemReports = pgTable(
  'delivery_item_reports',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    deliveryItemId: uuid('delivery_item_id').notNull(),
    reportKind: text('report_kind').$type<DeliveryReportKind>().notNull(),
    reportedState: text('reported_state').$type<DeliveryState>(),
    newExpectedDate: date('new_expected_date', { mode: 'string' }),
    actualDate: date('actual_date', { mode: 'string' }),
    note: text('note'),
    actorType: text('actor_type').$type<ActorType>().notNull().default('internal'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorPrincipalId: uuid('actor_principal_id').references(() => externalPrincipals.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('delivery_item_reports_item_idx').on(table.organizationId, table.deliveryItemId, table.createdAt),
    foreignKey({
      name: 'delivery_item_reports_item_fk',
      columns: [table.deliveryItemId, table.organizationId],
      foreignColumns: [deliveryItems.id, deliveryItems.organizationId],
    }).onDelete('cascade'),
    check(
      'delivery_item_reports_kind_known',
      sql`${table.reportKind} IN ('status_update', 'delay_notice', 'arrived', 'issue', 'note')`,
    ),
    check(
      'delivery_item_reports_state_known',
      sql`${table.reportedState} IS NULL OR ${table.reportedState} IN ('planned', 'ordered', 'in_transit', 'partially_delivered', 'delivered', 'rejected', 'cancelled')`,
    ),
    check(
      'delivery_item_reports_actor_shape',
      sql`(${table.actorType} = 'internal' AND ${table.actorPrincipalId} IS NULL)
        OR (${table.actorType} = 'external' AND ${table.actorPrincipalId} IS NOT NULL AND ${table.actorUserId} IS NULL)
        OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL AND ${table.actorPrincipalId} IS NULL)`,
    ),
  ],
);
