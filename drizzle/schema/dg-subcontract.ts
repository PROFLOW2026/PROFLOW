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
import { currencyCode, moneyAmount, percentAmount, quantityAmount, timestamps } from './_shared';
import { projectLocations, subcontractWorkLines } from './dg-foundation';
import { profiles } from './identity';
import { subcontractAgreements, subcontractValueEvents } from './platform-ops';
import { externalPrincipals } from './portal';
import { workPackages } from './projects';
import { organizations } from './tenancy';

/**
 * Developer / GC layer - SUBCONTRACT CORE (migration 0158, Track E).
 * Operational tables carry no money; financial tables are split out and RLS-gated by
 * contract.financial.view / change.financial.manage (internal) and ext.contract.view_value /
 * ext.change.request (external).
 */

export const SUBCONTRACT_LINE_TYPES = [
  'quantity_rate',
  'lump_sum',
  'weighted_milestone',
  'percentage',
  'allowance',
  'custom',
] as const;
export type SubcontractLineType = (typeof SUBCONTRACT_LINE_TYPES)[number];

export const SUBCONTRACT_CHANGE_TYPES = [
  'addition',
  'deduction',
  'scope',
  'quantity',
  'rate',
  'extension',
  'instruction',
  'contractor_proposal',
] as const;
export type SubcontractChangeType = (typeof SUBCONTRACT_CHANGE_TYPES)[number];

export const SUBCONTRACT_CHANGE_ORIGINS = ['internal', 'contractor', 'site_instruction', 'unpriced_work'] as const;
export type SubcontractChangeOrigin = (typeof SUBCONTRACT_CHANGE_ORIGINS)[number];

export const SUBCONTRACT_CHANGE_STATUSES = [
  'draft',
  'submitted',
  'under_negotiation',
  'approved',
  'rejected',
  'withdrawn',
] as const;
export type SubcontractChangeStatus = (typeof SUBCONTRACT_CHANGE_STATUSES)[number];

export const UNPRICED_WORK_STATUSES = ['recorded', 'converted', 'rejected', 'cancelled'] as const;
export type UnpricedWorkStatus = (typeof UNPRICED_WORK_STATUSES)[number];

export const ADVANCE_RECOVERY_METHODS = ['none', 'proportional', 'fixed_percent_per_claim'] as const;
export type AdvanceRecoveryMethod = (typeof ADVANCE_RECOVERY_METHODS)[number];

export const SUBCONTRACT_VAT_TREATMENTS = [
  'standard',
  'reverse_charge',
  'exempt',
  'zero_rated',
  'not_applicable',
] as const;
export type SubcontractVatTreatment = (typeof SUBCONTRACT_VAT_TREATMENTS)[number];

type ActorType = 'internal' | 'external' | 'system';

const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const subcontractAgreementProfiles = pgTable(
  'subcontract_agreement_profiles',
  {
    agreementId: uuid('agreement_id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    trade: text('trade'),
    workPackageId: uuid('work_package_id'),
    scopeSummary: text('scope_summary'),
    sourceEntityType: text('source_entity_type'),
    sourceEntityId: uuid('source_entity_id'),
    baselineLockedAt: tsz('baseline_locked_at'),
    activatedAt: tsz('activated_at'),
    suspendedAt: tsz('suspended_at'),
    suspensionReason: text('suspension_reason'),
    completedAt: tsz('completed_at'),
    closedAt: tsz('closed_at'),
    cancelledAt: tsz('cancelled_at'),
    statusChangedByUserId: uuid('status_changed_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    index('subcontract_agreement_profiles_project_idx').on(table.organizationId, table.projectId),
    foreignKey({
      name: 'subcontract_agreement_profiles_agreement_project_fk',
      columns: [table.agreementId, table.organizationId, table.projectId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.projectId],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'subcontract_agreement_profiles_agreement_vendor_fk',
      columns: [table.agreementId, table.organizationId, table.vendorId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.vendorId],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'subcontract_agreement_profiles_work_package_fk',
      columns: [table.workPackageId, table.organizationId, table.projectId],
      foreignColumns: [workPackages.id, workPackages.organizationId, workPackages.projectId],
    }).onDelete('set null'),
    check('subcontract_agreement_profiles_trade_len', sql`${table.trade} IS NULL OR length(${table.trade}) <= 120`),
  ],
);

export const subcontractAgreementFinancialTerms = pgTable(
  'subcontract_agreement_financial_terms',
  {
    agreementId: uuid('agreement_id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    currency: currencyCode().notNull(),
    retentionCapPercent: percentAmount('retention_cap_percent'),
    retentionCapAmount: moneyAmount('retention_cap_amount'),
    advancePercent: percentAmount('advance_percent'),
    advanceAmount: moneyAmount('advance_amount'),
    advanceRecoveryMethod: text('advance_recovery_method').$type<AdvanceRecoveryMethod>().notNull().default('none'),
    advanceRecoveryPercent: percentAmount('advance_recovery_percent'),
    vatTreatment: text('vat_treatment').$type<SubcontractVatTreatment>().notNull().default('standard'),
    paymentTermsDays: integer('payment_terms_days'),
    paymentTermsText: text('payment_terms_text'),
    ...timestamps(),
  },
  (table) => [
    foreignKey({
      name: 'subcontract_agreement_financial_terms_agreement_project_fk',
      columns: [table.agreementId, table.organizationId, table.projectId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.projectId],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'subcontract_agreement_financial_terms_agreement_vendor_fk',
      columns: [table.agreementId, table.organizationId, table.vendorId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.vendorId],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
);

export const subcontractWorkLineAttributes = pgTable(
  'subcontract_work_line_attributes',
  {
    workLineId: uuid('work_line_id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agreementId: uuid('agreement_id').notNull(),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    lineType: text('line_type').$type<SubcontractLineType>().notNull().default('quantity_rate'),
    weightPercent: percentAmount('weight_percent'),
    plannedStart: date('planned_start', { mode: 'string' }),
    plannedEnd: date('planned_end', { mode: 'string' }),
    isBaseline: boolean('is_baseline').notNull().default(true),
    originChangeId: uuid('origin_change_id'),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    index('subcontract_work_line_attributes_agreement_idx').on(table.organizationId, table.agreementId),
    foreignKey({
      name: 'subcontract_work_line_attributes_line_fk',
      columns: [table.workLineId, table.organizationId, table.agreementId],
      foreignColumns: [subcontractWorkLines.id, subcontractWorkLines.organizationId, subcontractWorkLines.agreementId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'subcontract_work_line_attributes_agreement_project_fk',
      columns: [table.agreementId, table.organizationId, table.projectId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.projectId],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    check(
      'subcontract_work_line_attributes_type_known',
      sql`${table.lineType} IN ('quantity_rate','lump_sum','weighted_milestone','percentage','allowance','custom')`,
    ),
    check(
      'subcontract_work_line_attributes_weight_range',
      sql`${table.weightPercent} IS NULL OR (${table.weightPercent} >= 0 AND ${table.weightPercent} <= 100)`,
    ),
    check(
      'subcontract_work_line_attributes_date_order',
      sql`${table.plannedEnd} IS NULL OR ${table.plannedStart} IS NULL OR ${table.plannedEnd} >= ${table.plannedStart}`,
    ),
    check('subcontract_work_line_attributes_origin_shape', sql`${table.isBaseline} OR ${table.originChangeId} IS NOT NULL`),
  ],
);

export const subcontractChanges = pgTable(
  'subcontract_changes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    changeNumber: integer('change_number').notNull(),
    changeType: text('change_type').$type<SubcontractChangeType>().notNull(),
    title: text('title').notNull(),
    description: text('description'),
    origin: text('origin').$type<SubcontractChangeOrigin>().notNull().default('internal'),
    sourceEntityType: text('source_entity_type'),
    sourceEntityId: uuid('source_entity_id'),
    status: text('status').$type<SubcontractChangeStatus>().notNull().default('draft'),
    timeExtensionDays: integer('time_extension_days'),
    submittedAt: tsz('submitted_at'),
    decidedAt: tsz('decided_at'),
    decisionActorType: text('decision_actor_type').$type<ActorType>(),
    decisionUserId: uuid('decision_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    decisionPrincipalId: uuid('decision_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    decisionReason: text('decision_reason'),
    approvedVersionId: uuid('approved_version_id'),
    valueEventId: uuid('value_event_id'),
    createdActorType: text('created_actor_type').$type<ActorType>().notNull().default('internal'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdByPrincipalId: uuid('created_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('subcontract_changes_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('subcontract_changes_id_org_agreement_uq').on(table.id, table.organizationId, table.agreementId),
    uniqueIndex('subcontract_changes_number_uq').on(table.organizationId, table.agreementId, table.changeNumber),
    index('subcontract_changes_project_status_idx').on(table.organizationId, table.projectId, table.status),
    foreignKey({
      name: 'subcontract_changes_agreement_project_fk',
      columns: [table.agreementId, table.organizationId, table.projectId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.projectId],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'subcontract_changes_agreement_vendor_fk',
      columns: [table.agreementId, table.organizationId, table.vendorId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.vendorId],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'subcontract_changes_value_event_fk',
      columns: [table.valueEventId, table.organizationId],
      foreignColumns: [subcontractValueEvents.id, subcontractValueEvents.organizationId],
    }).onDelete('restrict'),
    check(
      'subcontract_changes_type_known',
      sql`${table.changeType} IN ('addition','deduction','scope','quantity','rate','extension','instruction','contractor_proposal')`,
    ),
    check(
      'subcontract_changes_status_known',
      sql`${table.status} IN ('draft','submitted','under_negotiation','approved','rejected','withdrawn')`,
    ),
  ],
);

/** Financial, append-only negotiation versions. */
export const subcontractChangeVersions = pgTable(
  'subcontract_change_versions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    changeId: uuid('change_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    versionNo: integer('version_no').notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    timeExtensionDays: integer('time_extension_days'),
    note: text('note'),
    actorType: text('actor_type').$type<ActorType>().notNull().default('internal'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorPrincipalId: uuid('actor_principal_id').references(() => externalPrincipals.id, { onDelete: 'set null' }),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('subcontract_change_versions_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('subcontract_change_versions_id_org_change_uq').on(table.id, table.organizationId, table.changeId),
    uniqueIndex('subcontract_change_versions_no_uq').on(table.organizationId, table.changeId, table.versionNo),
    foreignKey({
      name: 'subcontract_change_versions_change_fk',
      columns: [table.changeId, table.organizationId, table.agreementId],
      foreignColumns: [subcontractChanges.id, subcontractChanges.organizationId, subcontractChanges.agreementId],
    }).onDelete('cascade'),
  ],
);

export const subcontractChangeVersionLines = pgTable(
  'subcontract_change_version_lines',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id').notNull(),
    changeId: uuid('change_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    workLineId: uuid('work_line_id'),
    newLineCode: text('new_line_code'),
    newLineDescription: text('new_line_description'),
    newLineUnit: text('new_line_unit'),
    newLineType: text('new_line_type').$type<SubcontractLineType>(),
    quantityDelta: quantityAmount('quantity_delta').notNull().default('0'),
    unitRate: moneyAmount('unit_rate'),
    amountDelta: moneyAmount('amount_delta').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('subcontract_change_version_lines_version_idx').on(table.organizationId, table.versionId, table.sortOrder),
    foreignKey({
      name: 'subcontract_change_version_lines_version_fk',
      columns: [table.versionId, table.organizationId, table.changeId],
      foreignColumns: [
        subcontractChangeVersions.id,
        subcontractChangeVersions.organizationId,
        subcontractChangeVersions.changeId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'subcontract_change_version_lines_work_line_fk',
      columns: [table.workLineId, table.organizationId, table.agreementId],
      foreignColumns: [subcontractWorkLines.id, subcontractWorkLines.organizationId, subcontractWorkLines.agreementId],
    }).onDelete('cascade'),
  ],
);

/** Applied line deltas (financial ledger). Revised line value = baseline + SUM(amount_delta). */
export const subcontractWorkLineAdjustments = pgTable(
  'subcontract_work_line_adjustments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agreementId: uuid('agreement_id').notNull(),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    workLineId: uuid('work_line_id').notNull(),
    changeId: uuid('change_id').notNull(),
    versionLineId: uuid('version_line_id').notNull(),
    quantityDelta: quantityAmount('quantity_delta').notNull().default('0'),
    amountDelta: moneyAmount('amount_delta').notNull(),
    unitRate: moneyAmount('unit_rate'),
    currency: currencyCode().notNull(),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('subcontract_work_line_adjustments_version_line_uq').on(table.organizationId, table.versionLineId),
    index('subcontract_work_line_adjustments_line_idx').on(table.organizationId, table.workLineId),
    index('subcontract_work_line_adjustments_agreement_idx').on(table.organizationId, table.agreementId),
    foreignKey({
      name: 'subcontract_work_line_adjustments_line_fk',
      columns: [table.workLineId, table.organizationId, table.agreementId],
      foreignColumns: [subcontractWorkLines.id, subcontractWorkLines.organizationId, subcontractWorkLines.agreementId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'subcontract_work_line_adjustments_change_fk',
      columns: [table.changeId, table.organizationId, table.agreementId],
      foreignColumns: [subcontractChanges.id, subcontractChanges.organizationId, subcontractChanges.agreementId],
    }).onDelete('cascade'),
  ],
);

export const subcontractUnpricedWork = pgTable(
  'subcontract_unpriced_work',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    title: text('title').notNull(),
    scopeDescription: text('scope_description'),
    locationId: uuid('location_id'),
    workPackageId: uuid('work_package_id'),
    workDate: date('work_date', { mode: 'string' }).notNull(),
    issuerName: text('issuer_name'),
    issuedByUserId: uuid('issued_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    sourceEntityType: text('source_entity_type'),
    sourceEntityId: uuid('source_entity_id'),
    status: text('status').$type<UnpricedWorkStatus>().notNull().default('recorded'),
    convertedChangeId: uuid('converted_change_id'),
    decidedAt: tsz('decided_at'),
    decidedByUserId: uuid('decided_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    decisionReason: text('decision_reason'),
    createdActorType: text('created_actor_type').$type<ActorType>().notNull().default('internal'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdByPrincipalId: uuid('created_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('subcontract_unpriced_work_id_organization_id_uq').on(table.id, table.organizationId),
    index('subcontract_unpriced_work_project_status_idx').on(
      table.organizationId,
      table.projectId,
      table.status,
      table.workDate,
    ),
    index('subcontract_unpriced_work_agreement_idx').on(table.organizationId, table.agreementId),
    foreignKey({
      name: 'subcontract_unpriced_work_agreement_project_fk',
      columns: [table.agreementId, table.organizationId, table.projectId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.projectId],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'subcontract_unpriced_work_location_fk',
      columns: [table.locationId, table.organizationId, table.projectId],
      foreignColumns: [projectLocations.id, projectLocations.organizationId, projectLocations.projectId],
    }).onDelete('set null'),
    foreignKey({
      name: 'subcontract_unpriced_work_change_fk',
      columns: [table.convertedChangeId, table.organizationId, table.agreementId],
      foreignColumns: [subcontractChanges.id, subcontractChanges.organizationId, subcontractChanges.agreementId],
    }).onDelete('restrict'),
    check('subcontract_unpriced_work_status_known', sql`${table.status} IN ('recorded','converted','rejected','cancelled')`),
  ],
);
