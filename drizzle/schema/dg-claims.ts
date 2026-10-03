import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { currencyCode, moneyAmount, primaryId, quantityAmount, timestamps } from './_shared';
import { apBills } from './ap';
import { subcontractWorkLines } from './dg-foundation';
import { profiles } from './identity';
import { subcontractAgreements } from './platform-ops';
import { externalPrincipals } from './portal';
import { projects } from './projects';
import { organizations } from './tenancy';

/**
 * Track F (migration 0159): contractor progress claims, certification, payable basis, deductions and
 * payment holds. All amounts are NET; VAT exists only on the AP bill. Every table is financial
 * (claim.* / payment.* / deductions.manage internally, ext.claim.* / ext.payment.view externally).
 */

const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const percent4 = (name: string) => numeric(name, { precision: 9, scale: 4, mode: 'string' });

export const SUBCONTRACT_CLAIM_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'returned',
  'certified',
  'cancelled',
] as const;
export type SubcontractClaimStatus = (typeof SUBCONTRACT_CLAIM_STATUSES)[number];

export const CLAIM_ASSESSMENT_DECISIONS = [
  'certify',
  'reassess',
  'reject_line',
  'return',
  'request_evidence',
] as const;
export type ClaimAssessmentDecision = (typeof CLAIM_ASSESSMENT_DECISIONS)[number];

export const PAYABLE_BASIS_AP_STATUSES = [
  'pending',
  'requested',
  'created',
  'not_required',
  'credit_required',
] as const;
export type PayableBasisApStatus = (typeof PAYABLE_BASIS_AP_STATUSES)[number];

export const DEDUCTION_TYPES = [
  'back_charge',
  'penalty',
  'damage',
  'materials',
  'cleanup',
  'safety',
  'other',
] as const;
export type DeductionType = (typeof DEDUCTION_TYPES)[number];

export const PAYMENT_HOLD_KINDS = [
  'missing_invoice',
  'missing_tax_document',
  'guarantee',
  'handover_document',
  'insurance',
  'compliance',
  'other',
] as const;
export type PaymentHoldKind = (typeof PAYMENT_HOLD_KINDS)[number];

type ActorKind = 'internal' | 'external';

export const subcontractClaims = pgTable(
  'subcontract_claims',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    claimNumber: integer('claim_number').notNull().default(0),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    title: text('title'),
    status: text('status').$type<SubcontractClaimStatus>().notNull().default('draft'),
    currentRevisionNo: integer('current_revision_no').notNull().default(1),
    currency: currencyCode().notNull(),
    createdActorType: text('created_actor_type').$type<ActorKind>().notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdByPrincipalId: uuid('created_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    submittedAt: tsz('submitted_at'),
    reviewStartedAt: tsz('review_started_at'),
    returnedAt: tsz('returned_at'),
    certifiedAt: tsz('certified_at'),
    lastReassessedAt: tsz('last_reassessed_at'),
    cancelledAt: tsz('cancelled_at'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('subcontract_claims_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('subcontract_claims_id_org_project_uq').on(table.id, table.organizationId, table.projectId),
    uniqueIndex('subcontract_claims_id_org_agreement_uq').on(table.id, table.organizationId, table.agreementId),
    uniqueIndex('subcontract_claims_agreement_number_uq').on(
      table.organizationId,
      table.agreementId,
      table.claimNumber,
    ),
    uniqueIndex('subcontract_claims_one_open_per_agreement_uq')
      .on(table.organizationId, table.agreementId)
      .where(sql`${table.status} IN ('draft', 'submitted', 'under_review', 'returned')`),
    index('subcontract_claims_project_status_idx').on(
      table.organizationId,
      table.projectId,
      table.status,
      table.createdAt,
    ),
    index('subcontract_claims_vendor_project_idx').on(table.organizationId, table.vendorId, table.projectId),
    foreignKey({
      name: 'subcontract_claims_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'subcontract_claims_agreement_project_fk',
      columns: [table.agreementId, table.organizationId, table.projectId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.projectId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'subcontract_claims_agreement_vendor_fk',
      columns: [table.agreementId, table.organizationId, table.vendorId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.vendorId],
    }).onDelete('restrict'),
    check(
      'subcontract_claims_status_known',
      sql`${table.status} IN ('draft', 'submitted', 'under_review', 'returned', 'certified', 'cancelled')`,
    ),
    check('subcontract_claims_period_order', sql`${table.periodEnd} >= ${table.periodStart}`),
  ],
);

export const subcontractClaimRevisions = pgTable(
  'subcontract_claim_revisions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    claimId: uuid('claim_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    note: text('note'),
    submittedAt: tsz('submitted_at'),
    submittedActorType: text('submitted_actor_type').$type<ActorKind>(),
    submittedByUserId: uuid('submitted_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    submittedByPrincipalId: uuid('submitted_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    createdActorType: text('created_actor_type').$type<ActorKind>().notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdByPrincipalId: uuid('created_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('subcontract_claim_revisions_claim_no_uq').on(table.organizationId, table.claimId, table.revisionNo),
    uniqueIndex('subcontract_claim_revisions_id_org_claim_uq').on(table.id, table.organizationId, table.claimId),
    foreignKey({
      name: 'subcontract_claim_revisions_claim_fk',
      columns: [table.claimId, table.organizationId, table.projectId],
      foreignColumns: [subcontractClaims.id, subcontractClaims.organizationId, subcontractClaims.projectId],
    }).onDelete('cascade'),
  ],
);

export const subcontractClaimLines = pgTable(
  'subcontract_claim_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    claimId: uuid('claim_id').notNull(),
    workLineId: uuid('work_line_id').notNull(),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('subcontract_claim_lines_claim_work_line_uq').on(
      table.organizationId,
      table.claimId,
      table.workLineId,
    ),
    uniqueIndex('subcontract_claim_lines_id_org_claim_uq').on(table.id, table.organizationId, table.claimId),
    index('subcontract_claim_lines_work_line_idx').on(table.organizationId, table.workLineId),
    foreignKey({
      name: 'subcontract_claim_lines_claim_fk',
      columns: [table.claimId, table.organizationId, table.agreementId],
      foreignColumns: [subcontractClaims.id, subcontractClaims.organizationId, subcontractClaims.agreementId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'subcontract_claim_lines_work_line_fk',
      columns: [table.workLineId, table.organizationId, table.agreementId],
      foreignColumns: [subcontractWorkLines.id, subcontractWorkLines.organizationId, subcontractWorkLines.agreementId],
    }).onDelete('restrict'),
  ],
);

export const subcontractClaimLineSubmissions = pgTable(
  'subcontract_claim_line_submissions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    claimId: uuid('claim_id').notNull(),
    revisionId: uuid('revision_id').notNull(),
    claimLineId: uuid('claim_line_id').notNull(),
    currency: currencyCode().notNull(),
    currentAmount: moneyAmount('current_amount').notNull(),
    cumulativeAmount: moneyAmount('cumulative_amount').notNull(),
    progressPercent: percent4('progress_percent'),
    cumulativeQuantity: quantityAmount('cumulative_quantity'),
    note: text('note'),
    contractBaseline: moneyAmount('contract_baseline').notNull().default('0'),
    approvedChanges: moneyAmount('approved_changes').notNull().default('0'),
    revisedValue: moneyAmount('revised_value').notNull().default('0'),
    priorCertified: moneyAmount('prior_certified').notNull().default('0'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('subcontract_claim_line_submissions_revision_line_uq').on(
      table.organizationId,
      table.revisionId,
      table.claimLineId,
    ),
    index('subcontract_claim_line_submissions_claim_idx').on(table.organizationId, table.claimId),
    foreignKey({
      name: 'subcontract_claim_line_submissions_revision_fk',
      columns: [table.revisionId, table.organizationId, table.claimId],
      foreignColumns: [
        subcontractClaimRevisions.id,
        subcontractClaimRevisions.organizationId,
        subcontractClaimRevisions.claimId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'subcontract_claim_line_submissions_line_fk',
      columns: [table.claimLineId, table.organizationId, table.claimId],
      foreignColumns: [subcontractClaimLines.id, subcontractClaimLines.organizationId, subcontractClaimLines.claimId],
    }).onDelete('cascade'),
    check('subcontract_claim_line_submissions_cumulative_non_negative', sql`${table.cumulativeAmount} >= 0`),
    check(
      'subcontract_claim_line_submissions_cumulative_math',
      sql`${table.cumulativeAmount} = ${table.priorCertified} + ${table.currentAmount}`,
    ),
  ],
);

export const subcontractClaimAssessments = pgTable(
  'subcontract_claim_assessments',
  {
    id: primaryId(),
    seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    claimId: uuid('claim_id').notNull(),
    revisionId: uuid('revision_id').notNull(),
    claimLineId: uuid('claim_line_id'),
    decision: text('decision').$type<ClaimAssessmentDecision>().notNull(),
    certifiedAmount: moneyAmount('certified_amount'),
    currency: currencyCode().notNull(),
    reason: text('reason'),
    supersedesAssessmentId: uuid('supersedes_assessment_id'),
    assessorUserId: uuid('assessor_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('subcontract_claim_assessments_id_org_claim_uq').on(table.id, table.organizationId, table.claimId),
    index('subcontract_claim_assessments_claim_idx').on(table.organizationId, table.claimId, table.seq),
    foreignKey({
      name: 'subcontract_claim_assessments_revision_fk',
      columns: [table.revisionId, table.organizationId, table.claimId],
      foreignColumns: [
        subcontractClaimRevisions.id,
        subcontractClaimRevisions.organizationId,
        subcontractClaimRevisions.claimId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'subcontract_claim_assessments_line_fk',
      columns: [table.claimLineId, table.organizationId, table.claimId],
      foreignColumns: [subcontractClaimLines.id, subcontractClaimLines.organizationId, subcontractClaimLines.claimId],
    }).onDelete('cascade'),
    check(
      'subcontract_claim_assessments_decision_known',
      sql`${table.decision} IN ('certify', 'reassess', 'reject_line', 'return', 'request_evidence')`,
    ),
  ],
);

export const subcontractClaimPayableBases = pgTable(
  'subcontract_claim_payable_bases',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    claimId: uuid('claim_id').notNull(),
    version: integer('version').notNull(),
    sourceDecision: text('source_decision').$type<'certify' | 'reassess'>().notNull(),
    currency: currencyCode().notNull(),
    certifiedTotal: moneyAmount('certified_total').notNull(),
    certifiedDelta: moneyAmount('certified_delta').notNull(),
    retentionPercent: percent4('retention_percent'),
    retentionAmount: moneyAmount('retention_amount').notNull().default('0'),
    advanceRecoveryAmount: moneyAmount('advance_recovery_amount').notNull().default('0'),
    deductionsAmount: moneyAmount('deductions_amount').notNull().default('0'),
    payableNet: moneyAmount('payable_net').notNull(),
    apBillStatus: text('ap_bill_status').$type<PayableBasisApStatus>().notNull(),
    apBillId: uuid('ap_bill_id'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('subcontract_claim_payable_bases_claim_version_uq').on(
      table.organizationId,
      table.claimId,
      table.version,
    ),
    uniqueIndex('subcontract_claim_payable_bases_ap_bill_uq')
      .on(table.organizationId, table.apBillId)
      .where(sql`${table.apBillId} IS NOT NULL`),
    index('subcontract_claim_payable_bases_agreement_idx').on(
      table.organizationId,
      table.agreementId,
      table.createdAt,
    ),
    foreignKey({
      name: 'subcontract_claim_payable_bases_claim_fk',
      columns: [table.claimId, table.organizationId, table.agreementId],
      foreignColumns: [subcontractClaims.id, subcontractClaims.organizationId, subcontractClaims.agreementId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'subcontract_claim_payable_bases_ap_bill_fk',
      columns: [table.apBillId, table.organizationId],
      foreignColumns: [apBills.id, apBills.organizationId],
    }).onDelete('restrict'),
    check(
      'subcontract_claim_payable_bases_math',
      sql`${table.payableNet} = ${table.certifiedDelta} - ${table.retentionAmount} - ${table.advanceRecoveryAmount} - ${table.deductionsAmount}`,
    ),
  ],
);

export const subcontractDeductions = pgTable(
  'subcontract_deductions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    claimId: uuid('claim_id'),
    entryKind: text('entry_kind').$type<'issue' | 'reversal'>().notNull().default('issue'),
    reversalOfId: uuid('reversal_of_id'),
    deductionType: text('deduction_type').$type<DeductionType>().notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    reason: text('reason').notNull(),
    contractorVisible: boolean('contractor_visible').notNull().default(true),
    issuedByUserId: uuid('issued_by_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('subcontract_deductions_id_org_agreement_uq').on(table.id, table.organizationId, table.agreementId),
    uniqueIndex('subcontract_deductions_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('subcontract_deductions_one_reversal_uq')
      .on(table.organizationId, table.reversalOfId)
      .where(sql`${table.reversalOfId} IS NOT NULL`),
    index('subcontract_deductions_project_idx').on(table.organizationId, table.projectId, table.createdAt),
    index('subcontract_deductions_agreement_idx').on(table.organizationId, table.agreementId),
    foreignKey({
      name: 'subcontract_deductions_agreement_project_fk',
      columns: [table.agreementId, table.organizationId, table.projectId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.projectId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'subcontract_deductions_claim_fk',
      columns: [table.claimId, table.organizationId, table.agreementId],
      foreignColumns: [subcontractClaims.id, subcontractClaims.organizationId, subcontractClaims.agreementId],
    }).onDelete('restrict'),
    check('subcontract_deductions_amount_positive', sql`${table.amount} > 0`),
  ],
);

export const subcontractDeductionDisputes = pgTable(
  'subcontract_deduction_disputes',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    deductionId: uuid('deduction_id').notNull(),
    comment: text('comment').notNull(),
    actorType: text('actor_type').$type<ActorKind>().notNull(),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorPrincipalId: uuid('actor_principal_id').references(() => externalPrincipals.id, { onDelete: 'set null' }),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('subcontract_deduction_disputes_deduction_idx').on(
      table.organizationId,
      table.deductionId,
      table.createdAt,
    ),
    foreignKey({
      name: 'subcontract_deduction_disputes_deduction_fk',
      columns: [table.deductionId, table.organizationId, table.agreementId],
      foreignColumns: [subcontractDeductions.id, subcontractDeductions.organizationId, subcontractDeductions.agreementId],
    }).onDelete('cascade'),
  ],
);

export const subcontractPaymentHolds = pgTable(
  'subcontract_payment_holds',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    claimId: uuid('claim_id'),
    holdKind: text('hold_kind').$type<PaymentHoldKind>().notNull(),
    note: text('note'),
    contractorVisible: boolean('contractor_visible').notNull().default(true),
    placedByUserId: uuid('placed_by_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    createdAt: tsz('created_at').notNull().defaultNow(),
    releasedAt: tsz('released_at'),
    releasedByUserId: uuid('released_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    releaseNote: text('release_note'),
  },
  (table) => [
    index('subcontract_payment_holds_agreement_open_idx')
      .on(table.organizationId, table.agreementId)
      .where(sql`${table.releasedAt} IS NULL`),
    index('subcontract_payment_holds_project_idx').on(table.organizationId, table.projectId, table.createdAt),
    foreignKey({
      name: 'subcontract_payment_holds_agreement_project_fk',
      columns: [table.agreementId, table.organizationId, table.projectId],
      foreignColumns: [subcontractAgreements.id, subcontractAgreements.organizationId, subcontractAgreements.projectId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'subcontract_payment_holds_claim_fk',
      columns: [table.claimId, table.organizationId, table.agreementId],
      foreignColumns: [subcontractClaims.id, subcontractClaims.organizationId, subcontractClaims.agreementId],
    }).onDelete('restrict'),
  ],
);
