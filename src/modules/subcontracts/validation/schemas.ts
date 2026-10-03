import { z } from 'zod';
import { isBusinessDate } from '@/shared/dates';
import {
  ADVANCE_RECOVERY_METHODS,
  SUBCONTRACT_CHANGE_TYPES,
  SUBCONTRACT_LINE_TYPES,
  SUBCONTRACT_VAT_TREATMENTS,
} from '../domain/types';

/** '' -> null (explicit clear); undefined stays undefined (field not sent = unchanged). */
const emptyToNull = (value: unknown) => (value === '' ? null : value);
const toOptionalInt = (value: unknown) =>
  value === undefined ? undefined : value === '' || value === null ? null : Number(value);

const uuid = z.string().uuid();
const optionalUuid = z.preprocess(emptyToNull, uuid.nullable().optional());
const optionalText = (max = 2000) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const requiredText = (max = 300) => z.string().trim().min(1, 'validation.required').max(max);

const businessDate = z.string().trim().refine(isBusinessDate, { message: 'validation.invalidDate' });
const optionalDate = z.preprocess(emptyToNull, businessDate.nullable().optional());

const decimalString = z
  .string()
  .trim()
  .regex(/^[+-]?\d+(\.\d+)?$/, 'validation.invalidNumber');
const nonNegativeDecimal = decimalString.refine((value) => !value.startsWith('-'), 'validation.nonNegative');
const optionalNonNegativeDecimal = z.preprocess(emptyToNull, nonNegativeDecimal.nullable().optional());
const percent = nonNegativeDecimal.refine((value) => Number(value) <= 100, 'validation.percentRange');
const optionalPercent = z.preprocess(emptyToNull, percent.nullable().optional());
const optionalSignedDecimal = z.preprocess(emptyToNull, decimalString.nullable().optional());
const optionalDays = z.preprocess(
  toOptionalInt,
  z.number().int().min(0).max(3650).nullable().optional(),
);

export const sourceEntitySchema = z
  .object({
    type: z.string().regex(/^[a-z][a-z0-9_]*$/),
    id: uuid,
  })
  .nullable()
  .optional();

export const createDraftAgreementSchema = z
  .object({
    projectId: uuid,
    vendorId: uuid,
    title: requiredText(200),
    subcontractNumber: optionalText(60),
    trade: optionalText(120),
    workPackageId: optionalUuid,
    scopeSummary: optionalText(4000),
    parentContractId: optionalUuid,
    startDate: optionalDate,
    endDate: optionalDate,
    originalAmount: optionalNonNegativeDecimal,
    retentionPercent: optionalPercent,
    retentionCapPercent: optionalPercent,
    retentionCapAmount: optionalNonNegativeDecimal,
    advancePercent: optionalPercent,
    advanceAmount: optionalNonNegativeDecimal,
    advanceRecoveryMethod: z.enum(ADVANCE_RECOVERY_METHODS).optional(),
    advanceRecoveryPercent: optionalPercent,
    vatTreatment: z.enum(SUBCONTRACT_VAT_TREATMENTS).optional(),
    paymentTermsDays: z.preprocess(
      toOptionalInt,
      z.number().int().min(0).max(365).nullable().optional(),
    ),
    paymentTermsText: optionalText(500),
    notes: optionalText(4000),
    source: sourceEntitySchema,
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    path: ['endDate'],
    message: 'validation.dateOrder',
  });
export type CreateDraftAgreementInput = z.input<typeof createDraftAgreementSchema>;

export const updateAgreementSchema = z
  .object({
    agreementId: uuid,
    title: requiredText(200).optional(),
    subcontractNumber: optionalText(60),
    trade: optionalText(120),
    workPackageId: optionalUuid,
    scopeSummary: optionalText(4000),
    parentContractId: optionalUuid,
    startDate: optionalDate,
    endDate: optionalDate,
    notes: optionalText(4000),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    path: ['endDate'],
    message: 'validation.dateOrder',
  });
export type UpdateAgreementInput = z.input<typeof updateAgreementSchema>;

export const updateFinancialTermsSchema = z.object({
  agreementId: uuid,
  originalAmount: optionalNonNegativeDecimal,
  retentionPercent: optionalPercent,
  retentionCapPercent: optionalPercent,
  retentionCapAmount: optionalNonNegativeDecimal,
  advancePercent: optionalPercent,
  advanceAmount: optionalNonNegativeDecimal,
  advanceRecoveryMethod: z.enum(ADVANCE_RECOVERY_METHODS).optional(),
  advanceRecoveryPercent: optionalPercent,
  vatTreatment: z.enum(SUBCONTRACT_VAT_TREATMENTS).optional(),
  paymentTermsDays: z.preprocess(
    toOptionalInt,
    z.number().int().min(0).max(365).nullable().optional(),
  ),
  paymentTermsText: optionalText(500),
});
export type UpdateFinancialTermsInput = z.input<typeof updateFinancialTermsSchema>;

export const agreementActionSchema = z.object({
  agreementId: uuid,
  action: z.enum(['activate', 'suspend', 'resume', 'complete', 'close', 'cancel']),
  reason: optionalText(1000),
});
export type AgreementActionInput = z.input<typeof agreementActionSchema>;

export const workLineSchema = z
  .object({
    agreementId: uuid,
    code: optionalText(40),
    description: requiredText(500),
    unit: z.preprocess(emptyToNull, z.string().trim().max(20).nullable().optional()),
    quantity: z.preprocess(emptyToNull, nonNegativeDecimal.nullable().optional()),
    lineType: z.enum(SUBCONTRACT_LINE_TYPES).default('quantity_rate'),
    weightPercent: optionalPercent,
    plannedStart: optionalDate,
    plannedEnd: optionalDate,
    locationId: optionalUuid,
    workPackageId: optionalUuid,
    sortOrder: z.preprocess(
      (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
      z.number().int().min(0).max(100000).optional(),
    ),
    notes: optionalText(2000),
    unitPrice: optionalNonNegativeDecimal,
    contractAmount: optionalNonNegativeDecimal,
  })
  .refine((value) => !value.plannedStart || !value.plannedEnd || value.plannedEnd >= value.plannedStart, {
    path: ['plannedEnd'],
    message: 'validation.dateOrder',
  });
export type WorkLineInput = z.input<typeof workLineSchema>;

export const updateWorkLineSchema = z
  .object({
    workLineId: uuid,
    code: optionalText(40),
    description: requiredText(500).optional(),
    unit: z.preprocess(emptyToNull, z.string().trim().max(20).nullable().optional()),
    quantity: z.preprocess(emptyToNull, nonNegativeDecimal.nullable().optional()),
    lineType: z.enum(SUBCONTRACT_LINE_TYPES).optional(),
    weightPercent: optionalPercent,
    plannedStart: optionalDate,
    plannedEnd: optionalDate,
    locationId: optionalUuid,
    workPackageId: optionalUuid,
    sortOrder: z.preprocess(
      (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
      z.number().int().min(0).max(100000).optional(),
    ),
    notes: optionalText(2000),
    unitPrice: optionalNonNegativeDecimal,
    contractAmount: optionalNonNegativeDecimal,
  })
  .refine((value) => !value.plannedStart || !value.plannedEnd || value.plannedEnd >= value.plannedStart, {
    path: ['plannedEnd'],
    message: 'validation.dateOrder',
  });
export type UpdateWorkLineInput = z.input<typeof updateWorkLineSchema>;

export const versionLineSchema = z
  .object({
    workLineId: optionalUuid,
    newLineCode: optionalText(40),
    newLineDescription: optionalText(500),
    newLineUnit: optionalText(20),
    newLineType: z.enum(SUBCONTRACT_LINE_TYPES).nullable().optional(),
    quantityDelta: z.preprocess(emptyToNull, decimalString.nullable().optional()),
    unitRate: optionalNonNegativeDecimal,
    amountDelta: optionalSignedDecimal,
  })
  .refine((value) => Boolean(value.workLineId) !== Boolean(value.newLineDescription), {
    path: ['workLineId'],
    message: 'subcontracts.validation.versionLineTarget',
  });
export type VersionLineInputRaw = z.input<typeof versionLineSchema>;

export const createChangeSchema = z.object({
  agreementId: uuid,
  changeType: z.enum(SUBCONTRACT_CHANGE_TYPES),
  title: requiredText(200),
  description: optionalText(4000),
  timeExtensionDays: optionalDays,
  source: sourceEntitySchema,
});
export type CreateChangeInput = z.input<typeof createChangeSchema>;

export const proposeVersionSchema = z.object({
  changeId: uuid,
  amount: optionalSignedDecimal,
  timeExtensionDays: optionalDays,
  note: optionalText(2000),
  lines: z.array(versionLineSchema).max(200).default([]),
});
export type ProposeVersionInput = z.input<typeof proposeVersionSchema>;

export const changeDecisionSchema = z.object({
  changeId: uuid,
  versionId: optionalUuid,
  reason: optionalText(2000),
});
export type ChangeDecisionInput = z.input<typeof changeDecisionSchema>;

export const createChangeFromInstructionSchema = z.object({
  agreementId: uuid,
  instructionId: uuid,
  title: requiredText(200),
  description: optionalText(4000),
  changeType: z.enum(SUBCONTRACT_CHANGE_TYPES).default('instruction'),
  sourceEntityType: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .default('site_instruction'),
});
export type CreateChangeFromInstructionInput = z.input<typeof createChangeFromInstructionSchema>;

export const contractorProposalSchema = z.object({
  organizationId: uuid,
  projectId: uuid,
  agreementId: uuid,
  title: requiredText(200),
  description: optionalText(4000),
  changeType: z.enum(SUBCONTRACT_CHANGE_TYPES).default('contractor_proposal'),
  amount: optionalSignedDecimal,
  timeExtensionDays: optionalDays,
  note: optionalText(2000),
  lines: z.array(versionLineSchema).max(200).default([]),
});
export type ContractorProposalInput = z.input<typeof contractorProposalSchema>;

export const contractorCounterSchema = z.object({
  organizationId: uuid,
  changeId: uuid,
  amount: optionalSignedDecimal,
  timeExtensionDays: optionalDays,
  note: optionalText(2000),
  lines: z.array(versionLineSchema).max(200).default([]),
});
export type ContractorCounterInput = z.input<typeof contractorCounterSchema>;

export const recordUnpricedWorkSchema = z.object({
  agreementId: uuid,
  title: requiredText(200),
  scopeDescription: optionalText(4000),
  locationId: optionalUuid,
  workPackageId: optionalUuid,
  workDate: businessDate,
  issuerName: optionalText(200),
  issuedByUserId: optionalUuid,
  source: sourceEntitySchema,
});
export type RecordUnpricedWorkInput = z.input<typeof recordUnpricedWorkSchema>;

export const unpricedDecisionSchema = z.object({
  unpricedWorkId: uuid,
  reason: optionalText(2000),
  changeType: z.enum(SUBCONTRACT_CHANGE_TYPES).optional(),
});
export type UnpricedDecisionInput = z.input<typeof unpricedDecisionSchema>;
