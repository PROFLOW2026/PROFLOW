import { z } from 'zod';
import { PRICING_MODES } from '@/modules/projects/domain/types';
import { DISPATCH_WINDOWS, SERVICE_PRIORITIES, SERVICE_STATUSES } from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional());
const optionalDate = z.preprocess(
  emptyToNull,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
);
const optionalDateTime = z.preprocess(emptyToNull, z.string().trim().min(1).nullable().optional());
const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());
const optionalBoolean = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'on' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
}, z.boolean().optional());

function rejectNegativeMoney(
  amount: string | null | undefined,
  ctx: z.RefinementCtx,
  path: string,
) {
  const trimmed = amount?.trim();
  if (!trimmed) return;
  const numeric = Number(trimmed.replace(/,/g, ''));
  if (trimmed.startsWith('-') || (Number.isFinite(numeric) && numeric < 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: 'validation.nonNegativeDecimalRequired',
    });
  }
}

export const createWorkOrderSchema = z
  .object({
    name: z.string().trim().min(1, 'validation.nameRequired').max(200, 'validation.nameTooLong'),
    description: optionalText,
    clientId: optionalUuid,
    clientName: z.preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .min(1, 'validation.clientNameRequired')
        .max(200, 'validation.clientNameTooLong')
        .nullable()
        .optional(),
    ),
    primaryContactId: optionalUuid,
    siteAddress: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
    contactName: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
    contactPhone: z.preprocess(emptyToNull, z.string().trim().max(40).nullable().optional()),
    category: z.preprocess(emptyToNull, z.string().trim().max(120).nullable().optional()),
    priority: z.enum(SERVICE_PRIORITIES).optional(),
    requestedDate: optionalDate,
    scheduledStartAt: optionalDateTime,
    scheduledEndAt: optionalDateTime,
    /** Interim assignee - persisted via employee_project_assignments until schema lands. */
    assigneeEmployeeId: optionalUuid,
    checklistTemplateId: optionalUuid,
    notes: optionalText,
    serviceNotes: optionalText,
    pricingMode: z.enum(PRICING_MODES),
    priceAmount: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
    priceCurrency: z.preprocess(emptyToNull, z.string().trim().length(3).nullable().optional()),
    amountIncludesTax: z.preprocess((value) => {
      if (value === '' || value === null || value === undefined) return false;
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 'including' || value === '1') return true;
      if (value === 'false' || value === 'excluding' || value === '0') return false;
      return value;
    }, z.boolean()).optional(),
    serviceStatus: z.enum(SERVICE_STATUSES).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.clientId && !value.clientName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.clientNameOrClientIdRequired',
        path: ['clientId'],
      });
    }
    rejectNegativeMoney(value.priceAmount, ctx, 'priceAmount');
    if (value.pricingMode === 'fixed' && !value.priceAmount?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.amountRequired',
        path: ['priceAmount'],
      });
    }
    if (value.pricingMode === 'open' && value.priceAmount?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.openPricingNoAmount',
        path: ['priceAmount'],
      });
    }
    if (value.scheduledStartAt && value.scheduledEndAt) {
      const start = Date.parse(value.scheduledStartAt);
      const end = Date.parse(value.scheduledEndAt);
      if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'validation.endBeforeStart',
          path: ['scheduledEndAt'],
        });
      }
    }
  });

export type CreateWorkOrderInput = z.input<typeof createWorkOrderSchema>;
export type CreateWorkOrderValues = z.output<typeof createWorkOrderSchema>;

export const updateWorkOrderSchema = z
  .object({
    workOrderId: z.string().uuid(),
    name: z.string().trim().min(1).max(200).optional(),
    description: optionalText,
    siteAddress: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
    contactName: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
    contactPhone: z.preprocess(emptyToNull, z.string().trim().max(40).nullable().optional()),
    category: z.preprocess(emptyToNull, z.string().trim().max(120).nullable().optional()),
    priority: z.enum(SERVICE_PRIORITIES).optional(),
    requestedDate: optionalDate,
    scheduledStartAt: optionalDateTime,
    scheduledEndAt: optionalDateTime,
    assigneeEmployeeId: optionalUuid,
    checklistTemplateId: optionalUuid,
    notes: optionalText,
    serviceNotes: optionalText,
    serviceStatus: z.enum(SERVICE_STATUSES).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scheduledStartAt && value.scheduledEndAt) {
      const start = Date.parse(value.scheduledStartAt);
      const end = Date.parse(value.scheduledEndAt);
      if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'validation.endBeforeStart',
          path: ['scheduledEndAt'],
        });
      }
    }
  });

export type UpdateWorkOrderInput = z.input<typeof updateWorkOrderSchema>;

export const updateServiceStatusSchema = z.object({
  workOrderId: z.string().uuid(),
  serviceStatus: z.enum(SERVICE_STATUSES),
});

export type UpdateServiceStatusInput = z.input<typeof updateServiceStatusSchema>;

export const listWorkOrdersSchema = z.object({
  search: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
  serviceStatus: z.preprocess(emptyToNull, z.enum(SERVICE_STATUSES).nullable().optional()),
  includeArchived: z.boolean().optional(),
});

export type ListWorkOrdersInput = z.input<typeof listWorkOrdersSchema>;

export const listDispatchSchema = z.object({
  window: z.enum(DISPATCH_WINDOWS).default('today'),
  assigneeEmployeeId: optionalUuid,
  serviceStatus: z.preprocess(emptyToNull, z.enum(SERVICE_STATUSES).nullable().optional()),
});

export type ListDispatchInput = z.input<typeof listDispatchSchema>;

export const rescheduleWorkOrderSchema = z
  .object({
    workOrderId: z.string().uuid(),
    scheduledStartAt: optionalDateTime,
    scheduledEndAt: optionalDateTime,
    assigneeEmployeeId: optionalUuid,
    serviceStatus: z.enum(SERVICE_STATUSES).optional(),
    confirmConflict: optionalBoolean,
  })
  .superRefine((value, ctx) => {
    if (!value.scheduledStartAt && !value.assigneeEmployeeId && !value.serviceStatus) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide a schedule, assignee, or status change',
        path: ['scheduledStartAt'],
      });
    }
  });

export type RescheduleWorkOrderInput = z.input<typeof rescheduleWorkOrderSchema>;

const optionalMoney = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .regex(/^[+]?\d+(\.\d+)?$/, 'Amount must be a positive decimal')
    .nullable()
    .optional(),
);

export const createWorkOrderBillingSchema = z.object({
  workOrderId: z.string().uuid(),
  laborHours: optionalMoney,
  laborRate: optionalMoney,
  materialsAmount: optionalMoney,
  callOutFee: optionalMoney,
  additionalCharges: optionalMoney,
  discountAmount: optionalMoney,
  issueDate: z.preprocess(
    emptyToNull,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ),
  notes: optionalText,
});

export type CreateWorkOrderBillingInput = z.input<typeof createWorkOrderBillingSchema>;
