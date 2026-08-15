import { z } from 'zod';
import { BOQ_ALLOCATION_KINDS, BOQ_NODE_KINDS, BOQ_PRICING_TYPES, BOQ_PROGRESS_MODES } from '../domain/types';

const decimalString = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, 'Must be a decimal string');

export const createProjectBoqSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().max(200).optional(),
  currency: z.string().length(3).optional(),
  progressMode: z.enum(BOQ_PROGRESS_MODES).optional(),
  notes: z.string().trim().max(4000).optional(),
  contractId: z.string().uuid().nullable().optional(),
});
export type CreateProjectBoqInput = z.infer<typeof createProjectBoqSchema>;

export const upsertBoqNodeSchema = z.object({
  boqId: z.string().uuid(),
  nodeId: z.string().uuid().optional(),
  parentId: z.string().uuid().nullable().optional(),
  nodeKind: z.enum(BOQ_NODE_KINDS),
  itemCode: z.string().trim().max(64).nullable().optional(),
  description: z.string().trim().min(1).max(2000),
  unit: z.string().trim().max(32).nullable().optional(),
  pricingType: z.enum(BOQ_PRICING_TYPES).optional(),
  quantity: decimalString.optional(),
  unitPrice: decimalString.optional(),
  openingApprovedQuantity: decimalString.optional(),
  openingBilledQuantity: decimalString.optional(),
  workPackageId: z.string().uuid().nullable().optional(),
  costCategoryId: z.string().uuid().nullable().optional(),
  budgetLineId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});
export type UpsertBoqNodeInput = z.infer<typeof upsertBoqNodeSchema>;

export const activateBoqSchema = z.object({
  boqId: z.string().uuid(),
  contractId: z.string().uuid().nullable().optional(),
});
export type ActivateBoqInput = z.infer<typeof activateBoqSchema>;

export const createProgressBatchSchema = z.object({
  boqId: z.string().uuid(),
  periodLabel: z.string().trim().min(1).max(120),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  notes: z.string().trim().max(4000).optional(),
  lines: z
    .array(
      z.object({
        boqNodeId: z.string().uuid(),
        measuredQuantity: decimalString,
        approvedQuantity: decimalString.optional(),
        notes: z.string().trim().max(2000).optional(),
      }),
    )
    .min(1),
});
export type CreateProgressBatchInput = z.infer<typeof createProgressBatchSchema>;

export const approveProgressBatchSchema = z.object({
  batchId: z.string().uuid(),
  /** Advanced mode only: map of progress line id → approver-supplied approved quantity. */
  lineApprovals: z.record(z.string().uuid(), decimalString).optional(),
});
export type ApproveProgressBatchInput = z.infer<typeof approveProgressBatchSchema>;

export const createProgressBillingSchema = z.object({
  batchId: z.string().uuid(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  retentionPercent: decimalString.optional(),
  retentionAmount: decimalString.optional(),
  /** Optional VAT amount — stored on AR tax_amount; BOQ period_net stays NET (= AR subtotal). */
  taxAmount: decimalString.optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
});
export type CreateProgressBillingInput = z.infer<typeof createProgressBillingSchema>;

export const allocateChangeToBoqSchema = z.object({
  boqId: z.string().uuid(),
  changeOrderId: z.string().uuid(),
  allocations: z
    .array(
      z.object({
        allocationKind: z.enum(BOQ_ALLOCATION_KINDS),
        boqNodeId: z.string().uuid().nullable().optional(),
        quantityDelta: decimalString.optional(),
        unitPriceDelta: decimalString.optional(),
        amountDelta: decimalString,
        notes: z.string().trim().max(2000).optional(),
        newItem: z
          .object({
            parentId: z.string().uuid().nullable().optional(),
            itemCode: z.string().trim().max(64).optional(),
            description: z.string().trim().min(1).max(2000),
            unit: z.string().trim().max(32).optional(),
            pricingType: z.enum(BOQ_PRICING_TYPES).optional(),
            quantity: decimalString.optional(),
            unitPrice: decimalString.optional(),
          })
          .optional(),
      }),
    )
    .min(1),
});
export type AllocateChangeToBoqInput = z.infer<typeof allocateChangeToBoqSchema>;

/** Related mappings only — never touches original_* / current_* money columns. */
export const updateBoqNodeMappingsSchema = z.object({
  nodeId: z.string().uuid(),
  workPackageId: z.string().uuid().nullable().optional(),
  costCategoryId: z.string().uuid().nullable().optional(),
  budgetLineId: z.string().uuid().nullable().optional(),
});
export type UpdateBoqNodeMappingsInput = z.infer<typeof updateBoqNodeMappingsSchema>;

export const createSubcontractorScheduleSchema = z.object({
  projectId: z.string().uuid(),
  boqId: z.string().uuid(),
  vendorEngagementId: z.string().uuid(),
  subcontractAgreementId: z.string().uuid().optional().nullable(),
  title: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
});
export type CreateSubcontractorScheduleInput = z.infer<typeof createSubcontractorScheduleSchema>;

export const addSubcontractorScheduleLineSchema = z.object({
  scheduleId: z.string().uuid(),
  boqNodeId: z.string().uuid(),
  unit: z.string().trim().max(32).nullable().optional(),
  agreedQuantity: decimalString,
  /** COST rate — never written into client BOQ unit prices. */
  unitRate: decimalString,
  notes: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export type AddSubcontractorScheduleLineInput = z.infer<typeof addSubcontractorScheduleLineSchema>;

export const createSubcontractorValuationSchema = z.object({
  scheduleId: z.string().uuid(),
  periodLabel: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(4000).optional(),
  lines: z
    .array(
      z.object({
        scheduleLineId: z.string().uuid(),
        approvedQuantity: decimalString,
        notes: z.string().trim().max(2000).optional(),
      }),
    )
    .min(1),
});
export type CreateSubcontractorValuationInput = z.infer<typeof createSubcontractorValuationSchema>;

export const approveSubcontractorValuationSchema = z.object({
  valuationId: z.string().uuid(),
});
export type ApproveSubcontractorValuationInput = z.infer<typeof approveSubcontractorValuationSchema>;

export const activateSubcontractorScheduleSchema = z.object({
  scheduleId: z.string().uuid(),
});
export type ActivateSubcontractorScheduleInput = z.infer<typeof activateSubcontractorScheduleSchema>;

export const proposeSubcontractorValuationApSchema = z.object({
  valuationId: z.string().uuid(),
  vendorBillId: z.string().uuid(),
});
export type ProposeSubcontractorValuationApInput = z.infer<
  typeof proposeSubcontractorValuationApSchema
>;

export const createDraftApFromSubcontractorValuationSchema = z.object({
  valuationId: z.string().uuid(),
  /** Override agreement retention %; omit to use the linked agreement percent. */
  retentionPercent: decimalString.optional(),
});
export type CreateDraftApFromSubcontractorValuationInput = z.infer<
  typeof createDraftApFromSubcontractorValuationSchema
>;

export const voidSubcontractorValuationSchema = z.object({
  valuationId: z.string().uuid(),
});
export type VoidSubcontractorValuationInput = z.infer<typeof voidSubcontractorValuationSchema>;
