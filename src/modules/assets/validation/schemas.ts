import { z } from 'zod';
import {
  ASSET_KINDS,
  ASSET_STATUSES,
  INVENTORY_COUNT_STATUSES,
  INVENTORY_LOCATION_KINDS,
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_RESERVATION_STATUSES,
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
  /** Optional fleet fields - only stored when assetKind is vehicle or fields provided. */
  plateNumber: optionalText,
  vin: optionalText,
  odometer: optionalText,
});

export type CreateAssetInput = z.input<typeof createAssetSchema>;

export const updateAssetSchema = z.object({
  assetId: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  assetKind: z.enum(ASSET_KINDS).optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  identifier: optionalText,
  manufacturer: optionalText,
  model: optionalText,
  serialNumber: optionalText,
  /** Project check-out; null / empty clears assignment (check-in). */
  assignedProjectId: optionalUuid,
  notes: optionalText,
});

export type UpdateAssetInput = z.input<typeof updateAssetSchema>;

export const createFleetVehicleSchema = z.object({
  assetId: z.string().uuid().optional(),
  /** When creating a new vehicle asset alongside the fleet row. */
  name: z.string().trim().min(1).max(200).optional(),
  plateNumber: optionalText,
  vin: optionalText,
  odometer: optionalText,
  notes: optionalText,
}).superRefine((value, ctx) => {
  if (!value.assetId && !value.name?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide an existing vehicle asset or a new vehicle name',
      path: ['assetId'],
    });
  }
});

export type CreateFleetVehicleInput = z.input<typeof createFleetVehicleSchema>;

export const updateFleetVehicleSchema = z.object({
  fleetVehicleId: z.string().uuid(),
  plateNumber: optionalText,
  vin: optionalText,
  odometer: optionalText,
  notes: optionalText,
});

export type UpdateFleetVehicleInput = z.input<typeof updateFleetVehicleSchema>;

export const createMaintenanceRecordSchema = z.object({
  assetId: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(200),
  status: z.enum(MAINTENANCE_STATUSES).optional().default('planned'),
  performedOn: optionalDate,
  /** Metadata only - does not post Expense. */
  costAmount: optionalMoney,
  currency: z.preprocess(emptyToNull, z.string().trim().length(3).nullable().optional()),
  vendorId: optionalUuid,
  notes: optionalText,
});

export type CreateMaintenanceRecordInput = z.input<typeof createMaintenanceRecordSchema>;

export const updateMaintenanceRecordSchema = z.object({
  maintenanceRecordId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  performedOn: optionalDate,
  /** Metadata only - does not post Expense. */
  costAmount: optionalMoney,
  currency: z.preprocess(emptyToNull, z.string().trim().length(3).nullable().optional()),
  vendorId: optionalUuid,
  notes: optionalText,
});

export type UpdateMaintenanceRecordInput = z.input<typeof updateMaintenanceRecordSchema>;

export const createInventoryItemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  sku: optionalText,
  barcode: optionalText,
  unit: z.string().trim().min(1).max(32).optional().default('ea'),
  quantityOnHand: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/)
    .optional()
    .default('0'),
  reorderLevel: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, 'Reorder level must be a non-negative number')
      .nullable()
      .optional(),
  ),
  minStockLevel: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, 'Min stock level must be a non-negative number')
      .nullable()
      .optional(),
  ),
  materialItemId: optionalUuid,
  notes: optionalText,
});

export type CreateInventoryItemInput = z.input<typeof createInventoryItemSchema>;

const signedAdjustQuantity = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, 'Quantity must be a number')
  .refine((value) => Number(value) !== 0, 'Adjustment quantity must be non-zero');

export const recordInventoryMovementSchema = z
  .object({
    inventoryItemId: z.string().uuid(),
    movementType: z.enum(INVENTORY_MOVEMENT_TYPES),
    quantity: z.string().trim().min(1),
    occurredOn: requiredDate,
    projectId: optionalUuid,
    fromLocationId: optionalUuid,
    toLocationId: optionalUuid,
    /** Single-location alias for receive / issue / adjust. */
    locationId: optionalUuid,
    reservationId: optionalUuid,
    workOrderId: optionalUuid,
    notes: optionalText,
  })
  .superRefine((data, ctx) => {
    if (data.movementType === 'adjust') {
      const parsed = signedAdjustQuantity.safeParse(data.quantity);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantity'],
          message: parsed.error.issues[0]?.message ?? 'Invalid adjustment quantity',
        });
      }
    } else {
      const parsed = requiredQuantity.safeParse(data.quantity);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantity'],
          message: parsed.error.issues[0]?.message ?? 'Invalid quantity',
        });
      }
    }

    if (data.movementType === 'transfer') {
      if (!data.fromLocationId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fromLocationId'],
          message: 'From location is required for transfer',
        });
      }
      if (!data.toLocationId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['toLocationId'],
          message: 'To location is required for transfer',
        });
      }
      if (data.fromLocationId && data.toLocationId && data.fromLocationId === data.toLocationId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['toLocationId'],
          message: 'Transfer locations must be different',
        });
      }
    }
  });

export type RecordInventoryMovementInput = z.input<typeof recordInventoryMovementSchema>;

export const createInventoryLocationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  code: optionalText,
  locationKind: z.enum(INVENTORY_LOCATION_KINDS).optional().default('warehouse'),
  projectId: optionalUuid,
});

export type CreateInventoryLocationInput = z.input<typeof createInventoryLocationSchema>;

export const updateInventoryLocationSchema = z.object({
  locationId: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  code: optionalText,
  locationKind: z.enum(INVENTORY_LOCATION_KINDS).optional(),
  projectId: optionalUuid,
});

export type UpdateInventoryLocationInput = z.input<typeof updateInventoryLocationSchema>;

export const archiveInventoryLocationSchema = z.object({
  locationId: z.string().uuid(),
});

export type ArchiveInventoryLocationInput = z.input<typeof archiveInventoryLocationSchema>;

export const reserveInventorySchema = z
  .object({
    inventoryItemId: z.string().uuid(),
    quantity: requiredQuantity,
    projectId: optionalUuid,
    workOrderId: optionalUuid,
    notes: optionalText,
  })
  .superRefine((data, ctx) => {
    if (!data.projectId && !data.workOrderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projectId'],
        message: 'Reserve for a project and/or work order',
      });
    }
  });

export type ReserveInventoryInput = z.input<typeof reserveInventorySchema>;

export const releaseInventoryReservationSchema = z.object({
  reservationId: z.string().uuid(),
});

export type ReleaseInventoryReservationInput = z.input<typeof releaseInventoryReservationSchema>;

export const createInventoryCountSchema = z.object({
  locationId: z.string().uuid(),
  countedOn: requiredDate,
  notes: optionalText,
});

export type CreateInventoryCountInput = z.input<typeof createInventoryCountSchema>;

export const upsertInventoryCountLineSchema = z.object({
  countId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  countedQuantity: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, 'Counted quantity must be a non-negative number'),
});

export type UpsertInventoryCountLineInput = z.input<typeof upsertInventoryCountLineSchema>;

export const finalizeInventoryCountSchema = z.object({
  countId: z.string().uuid(),
});

export type FinalizeInventoryCountInput = z.input<typeof finalizeInventoryCountSchema>;

export const voidInventoryCountSchema = z.object({
  countId: z.string().uuid(),
});

export type VoidInventoryCountInput = z.input<typeof voidInventoryCountSchema>;

export const inventoryReservationStatusSchema = z.enum(INVENTORY_RESERVATION_STATUSES);
export const inventoryCountStatusSchema = z.enum(INVENTORY_COUNT_STATUSES);
export const inventoryLocationKindSchema = z.enum(INVENTORY_LOCATION_KINDS);

export const inventoryMovementTypeSchema = z.enum(INVENTORY_MOVEMENT_TYPES);

const optionalNonNegativeQuantity = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, 'Must be a non-negative number')
    .refine((value) => Number(value) >= 0, 'Must be non-negative')
    .nullable()
    .optional(),
);

/**
 * Operational material consumption. Never posts Actual / Expense / GL.
 * Description is required; material and/or inventory item are optional refs.
 */
export const recordMaterialUsageSchema = z
  .object({
    projectId: z.string().uuid(),
    description: z.string().trim().min(1, 'Description is required').max(500),
    quantity: requiredQuantity,
    unit: optionalText,
    usageDate: requiredDate,
    materialId: optionalUuid,
    inventoryItemId: optionalUuid,
    employeeId: optionalUuid,
    notes: optionalText,
  })
  .superRefine((data, ctx) => {
    if (!data.materialId && !data.inventoryItemId && !data.description.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['description'],
        message: 'Provide a description or link a material / inventory item',
      });
    }
  });

export type RecordMaterialUsageInput = z.input<typeof recordMaterialUsageSchema>;

/**
 * Equipment / vehicle usage on a project/job/WO.
 * Does not create Actual; optional hours / days / mileage metrics.
 */
export const recordEquipmentUsageSchema = z
  .object({
    projectId: z.string().uuid(),
    assetId: z.string().uuid(),
    usageDate: requiredDate,
    endDate: optionalDate,
    hours: optionalNonNegativeQuantity,
    days: optionalNonNegativeQuantity,
    mileage: optionalNonNegativeQuantity,
    employeeId: optionalUuid,
    notes: optionalText,
  })
  .superRefine((data, ctx) => {
    if (data.endDate && data.endDate < data.usageDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date must be on or after start date',
      });
    }
  });

export type RecordEquipmentUsageInput = z.input<typeof recordEquipmentUsageSchema>;

export const archiveMaterialUsageSchema = z.object({
  materialUsageId: z.string().uuid(),
});

export type ArchiveMaterialUsageInput = z.input<typeof archiveMaterialUsageSchema>;

export const archiveEquipmentUsageSchema = z.object({
  equipmentUsageId: z.string().uuid(),
});

export type ArchiveEquipmentUsageInput = z.input<typeof archiveEquipmentUsageSchema>;
