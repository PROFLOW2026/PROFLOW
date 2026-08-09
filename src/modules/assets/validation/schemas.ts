import { z } from 'zod';
import {
  ASSET_KINDS,
  ASSET_STATUSES,
  INVENTORY_MOVEMENT_TYPES,
  MAINTENANCE_STATUSES,
} from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(4000).nullable().optional());

const optionalDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .nullable()
    .optional(),
);

const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());

const optionalMoney = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, 'Invalid amount')
    .nullable()
    .optional(),
);

const requiredQuantity = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'Quantity must be a positive number')
  .refine((value) => Number(value) > 0, 'Quantity must be greater than zero');

const requiredDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const createAssetSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  assetKind: z.enum(ASSET_KINDS).optional().default('equipment'),
  status: z.enum(ASSET_STATUSES).optional().default('active'),
  identifier: optionalText,
  manufacturer: optionalText,
  model: optionalText,
  serialNumber: optionalText,
  assignedProjectId: optionalUuid,
  notes: optionalText,
  /** Optional fleet fields — only stored when assetKind is vehicle or fields provided. */
  plateNumber: optionalText,
  vin: optionalText,
  odometer: optionalText,
});

export type CreateAssetInput = z.input<typeof createAssetSchema>;

export const createMaintenanceRecordSchema = z.object({
  assetId: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(200),
  status: z.enum(MAINTENANCE_STATUSES).optional().default('planned'),
  performedOn: optionalDate,
  /** Metadata only — does not post Expense. */
  costAmount: optionalMoney,
  currency: z.preprocess(emptyToNull, z.string().trim().length(3).nullable().optional()),
  vendorId: optionalUuid,
  notes: optionalText,
});

export type CreateMaintenanceRecordInput = z.input<typeof createMaintenanceRecordSchema>;

export const createInventoryItemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  sku: optionalText,
  unit: z.string().trim().min(1).max(32).optional().default('ea'),
  quantityOnHand: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/)
    .optional()
    .default('0'),
  reorderLevel: optionalText,
  materialItemId: optionalUuid,
  notes: optionalText,
});

export type CreateInventoryItemInput = z.input<typeof createInventoryItemSchema>;

export const recordInventoryMovementSchema = z.object({
  inventoryItemId: z.string().uuid(),
  movementType: z.enum(['receive', 'issue'] as const),
  quantity: requiredQuantity,
  occurredOn: requiredDate,
  projectId: optionalUuid,
  notes: optionalText,
});

export type RecordInventoryMovementInput = z.input<typeof recordInventoryMovementSchema>;

// Keep adjust/return in the type union for domain helpers even if UI only offers receive/issue.
export const inventoryMovementTypeSchema = z.enum(INVENTORY_MOVEMENT_TYPES);
