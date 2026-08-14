import { z } from 'zod';
import { PURCHASE_ORDER_STATUSES } from '../domain/committed-cost';
import { RFQ_STATUSES, SUPPLIER_QUOTE_STATUSES } from '../domain/quote-comparison';

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, 'Invalid money amount');

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .nullable()
    .optional(),
);

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional());

const positiveQuantity = moneyString.refine((value) => !/^0+(\.0+)?$/.test(value), {
  message: 'Quantity must be greater than zero',
});

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

export const createMaterialVendorPriceSchema = z.object({
  materialItemId: z.string().uuid(),
  vendorId: z.string().uuid(),
  unitPrice: moneyString,
  currency: z.string().trim().length(3),
  effectiveFrom: optionalDate,
  notes: optionalText,
});

export type CreateMaterialVendorPriceInput = z.infer<typeof createMaterialVendorPriceSchema>;

export const updateMaterialVendorPriceSchema = z.object({
  id: z.string().uuid(),
  vendorId: z.string().uuid().optional(),
  unitPrice: moneyString.optional(),
  currency: z.string().trim().length(3).optional(),
  effectiveFrom: optionalDate,
  notes: optionalText,
});

export type UpdateMaterialVendorPriceInput = z.infer<typeof updateMaterialVendorPriceSchema>;

export const deleteMaterialVendorPriceSchema = z.object({
  id: z.string().uuid(),
  materialItemId: z.string().uuid(),
});

export type DeleteMaterialVendorPriceInput = z.infer<typeof deleteMaterialVendorPriceSchema>;

export const createRfqSchema = z.object({
  title: z.string().trim().min(1).max(200),
  projectId: z.string().uuid().optional(),
  workPackageId: z.string().uuid().optional(),
  dueDate: optionalDate,
  notes: optionalText,
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(500),
        materialItemId: z.string().uuid().optional(),
        quantity: moneyString.default('1'),
        unit: z.string().trim().max(40).optional(),
      }),
    )
    .min(1),
});

export type CreateRfqInput = z.infer<typeof createRfqSchema>;

export const updateRfqStatusSchema = z.object({
  rfqId: z.string().uuid(),
  status: z.enum(RFQ_STATUSES),
});

export const createSupplierQuoteSchema = z.object({
  rfqId: z.string().uuid().optional(),
  vendorId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  currency: z.string().trim().length(3),
  receivedOn: optionalDate,
  notes: optionalText,
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(500),
        quantity: moneyString.default('1'),
        unitAmount: moneyString,
        lineTotal: moneyString,
        currency: z.string().trim().length(3),
      }),
    )
    .min(1),
});

export type CreateSupplierQuoteInput = z.infer<typeof createSupplierQuoteSchema>;

export const updateSupplierQuoteStatusSchema = z.object({
  quoteId: z.string().uuid(),
  status: z.enum(SUPPLIER_QUOTE_STATUSES),
});

export const createPurchaseOrderFromQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  reference: z.string().trim().max(80).optional(),
  orderedOn: z.string().trim().optional(),
  notes: optionalText,
});

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

export const receivePurchaseOrderSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  receivedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  reference: z.string().trim().max(80).optional(),
  notes: optionalText,
  lines: z
    .array(
      z.object({
        purchaseOrderLineId: z.string().uuid(),
        quantity: positiveQuantity,
        notes: optionalText,
      }),
    )
    .min(1),
});

export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderSchema>;

export const purchaseOrderStatusSchema = z.enum(PURCHASE_ORDER_STATUSES);
