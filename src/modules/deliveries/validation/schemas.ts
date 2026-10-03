import { z } from 'zod';
import { DELIVERY_ITEM_KINDS, DELIVERY_REPORT_KINDS, DELIVERY_STATES } from '../domain/types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableDate = isoDate.optional().nullable().transform((value) => value ?? null);
const nullableUuid = z.string().uuid().optional().nullable().transform((value) => value ?? null);
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));
const quantity = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/)
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

export const createDeliverySchema = z.object({
  projectId: z.string().uuid(),
  vendorId: nullableUuid,
  agreementId: nullableUuid,
  itemName: z.string().trim().min(1).max(200),
  description: nullableText(2000),
  itemKind: z.enum(DELIVERY_ITEM_KINDS).default('material'),
  isCritical: z.boolean().default(true),
  supplierVendorId: nullableUuid,
  supplierName: nullableText(200),
  quantity,
  unit: nullableText(40),
  orderDate: nullableDate,
  expectedDate: nullableDate,
  state: z.enum(DELIVERY_STATES).default('planned'),
  actualDate: nullableDate,
  locationId: nullableUuid,
  workPackageId: nullableUuid,
  purchaseOrderId: nullableUuid,
  notes: nullableText(2000),
  contractorVisible: z.boolean().default(true),
});
export type CreateDeliveryInput = z.input<typeof createDeliverySchema>;

export const updateDeliverySchema = z.object({
  projectId: z.string().uuid(),
  deliveryItemId: z.string().uuid(),
  itemName: z.string().trim().min(1).max(200).optional(),
  description: nullableText(2000),
  isCritical: z.boolean().optional(),
  supplierName: nullableText(200),
  quantity,
  unit: nullableText(40),
  orderDate: nullableDate,
  expectedDate: nullableDate,
  actualDate: nullableDate,
  state: z.enum(DELIVERY_STATES).optional(),
  locationId: nullableUuid,
  workPackageId: nullableUuid,
  notes: nullableText(2000),
  contractorVisible: z.boolean().optional(),
  archived: z.boolean().optional(),
  /** Free-text reason recorded in the delivery history (delay reason etc.). */
  reportNote: nullableText(2000),
});
export type UpdateDeliveryInput = z.input<typeof updateDeliverySchema>;

export const externalCreateDeliverySchema = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  vendorId: nullableUuid,
  agreementId: nullableUuid,
  itemName: z.string().trim().min(1).max(200),
  description: nullableText(2000),
  itemKind: z.enum(DELIVERY_ITEM_KINDS).default('material'),
  supplierName: nullableText(200),
  quantity,
  unit: nullableText(40),
  orderDate: nullableDate,
  expectedDate: nullableDate,
  locationId: nullableUuid,
});
export type ExternalCreateDeliveryInput = z.input<typeof externalCreateDeliverySchema>;

export const externalReportDeliverySchema = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  deliveryItemId: z.string().uuid(),
  reportKind: z.enum(DELIVERY_REPORT_KINDS),
  reportedState: z.enum(DELIVERY_STATES).optional().nullable().transform((value) => value ?? null),
  newExpectedDate: nullableDate,
  actualDate: nullableDate,
  note: nullableText(2000),
});
export type ExternalReportDeliveryInput = z.input<typeof externalReportDeliverySchema>;
