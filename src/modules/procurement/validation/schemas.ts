import { z } from 'zod';
import { PURCHASE_ORDER_STATUSES } from '../domain/committed-cost';

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, 'Invalid money amount');

export const createMaterialItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(80).optional(),
  manufacturer: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  unit: z.string().trim().min(1).max(40).default('ea'),
  defaultUnitPrice: moneyString.optional(),
  currency: z.string().trim().length(3).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateMaterialItemInput = z.infer<typeof createMaterialItemSchema>;

export const createPurchaseOrderSchema = z.object({
  vendorId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  workPackageId: z.string().uuid().optional(),
  supplierQuoteId: z.string().uuid().optional(),
  reference: z.string().trim().max(80).optional(),
  currency: z.string().trim().length(3),
  committedAmount: moneyString,
  orderedOn: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(500),
        materialItemId: z.string().uuid().optional(),
        quantity: moneyString.default('1'),
        unitAmount: moneyString,
        lineTotal: moneyString,
        currency: z.string().trim().length(3),
      }),
    )
    .min(1),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const issuePurchaseOrderSchema = z.object({
  purchaseOrderId: z.string().uuid(),
});

export const purchaseOrderStatusSchema = z.enum(PURCHASE_ORDER_STATUSES);
