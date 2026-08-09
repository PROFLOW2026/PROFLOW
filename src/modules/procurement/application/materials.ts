/**
 * UX split (Wave 3): materials catalog + vendor-specific prices live under
 * /procurement/materials. Operational inventory stock lives under /assets/inventory.
 */
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { findVendorById } from '@/modules/vendors';
import {
  deleteMaterialVendorPrice,
  findMaterialItemById,
  findMaterialVendorPriceById,
  insertMaterialItem,
  insertMaterialVendorPrice,
  listMaterialItems,
  listMaterialVendorPrices,
  updateMaterialVendorPrice,
  type MaterialVendorPriceRow,
} from '../data/procurement.repository';
import {
  createMaterialItemSchema,
  createMaterialVendorPriceSchema,
  deleteMaterialVendorPriceSchema,
  updateMaterialVendorPriceSchema,
  type CreateMaterialItemInput,
  type CreateMaterialVendorPriceInput,
  type DeleteMaterialVendorPriceInput,
  type UpdateMaterialVendorPriceInput,
} from '../validation/schemas';

export async function listMaterialsForOrg(context: OrgContext) {
  assertPermission(context, PERMISSIONS.MATERIALS_READ);
  return listMaterialItems(context.db, context.organizationId);
}

export async function getMaterialById(context: OrgContext, materialItemId: string) {
  assertPermission(context, PERMISSIONS.MATERIALS_READ);
  const item = await findMaterialItemById(context.db, context.organizationId, materialItemId);
  if (!item || item.archivedAt) return null;
  return item;
}

export async function listVendorPricesForMaterial(context: OrgContext, materialItemId: string) {
  assertPermission(context, PERMISSIONS.MATERIALS_READ);
  const item = await findMaterialItemById(context.db, context.organizationId, materialItemId);
  if (!item || item.archivedAt) throw new NotFoundError('Material item');
  return listMaterialVendorPrices(context.db, context.organizationId, materialItemId);
}

export async function createMaterialItem(context: OrgContext, raw: CreateMaterialItemInput) {
  assertPermission(context, PERMISSIONS.MATERIALS_MANAGE);
  const parsed = createMaterialItemSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const data = parsed.data;
  const currency = data.currency ?? context.organization.baseCurrency;
  const defaultUnitPrice = data.defaultUnitPrice
    ? toNumericString(money(data.defaultUnitPrice, currency))
    : null;

  const item = await insertMaterialItem(context.db, {
    organizationId: context.organizationId,
    name: data.name,
    sku: data.sku ?? null,
    manufacturer: data.manufacturer ?? null,
    model: data.model ?? null,
    unit: data.unit,
    defaultUnitPrice,
    currency: defaultUnitPrice ? currency : (data.currency ?? null),
    notes: data.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'materials');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MATERIAL_CREATED,
    entityType: 'material_item',
    entityId: item.id,
    after: { id: item.id, name: item.name },
  });
  return item;
}

export async function createMaterialVendorPrice(
  context: OrgContext,
  raw: CreateMaterialVendorPriceInput,
) {
  assertPermission(context, PERMISSIONS.MATERIALS_MANAGE);
  const parsed = createMaterialVendorPriceSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const material = await findMaterialItemById(
    context.db,
    context.organizationId,
    input.materialItemId,
  );
  if (!material || material.archivedAt) throw new NotFoundError('Material item');

  const vendor = await findVendorById(context.db, context.organizationId, input.vendorId);
  if (!vendor || vendor.archivedAt) throw new NotFoundError('Vendor');

  const unitPrice = toNumericString(money(input.unitPrice, input.currency));

  const row = await insertMaterialVendorPrice(context.db, {
    organizationId: context.organizationId,
    materialItemId: input.materialItemId,
    vendorId: input.vendorId,
    unitPrice,
    currency: input.currency,
    effectiveFrom: input.effectiveFrom ?? null,
    notes: input.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'materials');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MATERIAL_VENDOR_PRICE_CREATED,
    entityType: 'material_vendor_price',
    entityId: row.id,
    after: {
      id: row.id,
      materialItemId: row.materialItemId,
      vendorId: row.vendorId,
      unitPrice: row.unitPrice,
      currency: row.currency,
    },
  });
  return row;
}

export async function updateMaterialVendorPriceForOrg(
  context: OrgContext,
  raw: UpdateMaterialVendorPriceInput,
) {
  assertPermission(context, PERMISSIONS.MATERIALS_MANAGE);
  const parsed = updateMaterialVendorPriceSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findMaterialVendorPriceById(
    context.db,
    context.organizationId,
    input.id,
  );
  if (!existing) throw new NotFoundError('Material vendor price');

  if (input.vendorId) {
    const vendor = await findVendorById(context.db, context.organizationId, input.vendorId);
    if (!vendor || vendor.archivedAt) throw new NotFoundError('Vendor');
  }

  const currency = input.currency ?? existing.currency;
  const unitPrice =
    input.unitPrice !== undefined
      ? toNumericString(money(input.unitPrice, currency))
      : undefined;

  const updated = await updateMaterialVendorPrice(context.db, context.organizationId, input.id, {
    vendorId: input.vendorId,
    unitPrice,
    currency: input.currency,
    effectiveFrom: input.effectiveFrom === undefined ? undefined : input.effectiveFrom,
    notes: input.notes === undefined ? undefined : input.notes,
  });
  if (!updated) throw new NotFoundError('Material vendor price');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MATERIAL_VENDOR_PRICE_UPDATED,
    entityType: 'material_vendor_price',
    entityId: updated.id,
    before: {
      unitPrice: existing.unitPrice,
      currency: existing.currency,
      vendorId: existing.vendorId,
    },
    after: {
      unitPrice: updated.unitPrice,
      currency: updated.currency,
      vendorId: updated.vendorId,
    },
  });
  return updated;
}

export async function deleteMaterialVendorPriceForOrg(
  context: OrgContext,
  raw: DeleteMaterialVendorPriceInput,
) {
  assertPermission(context, PERMISSIONS.MATERIALS_MANAGE);
  const parsed = deleteMaterialVendorPriceSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findMaterialVendorPriceById(
    context.db,
    context.organizationId,
    parsed.data.id,
  );
  if (!existing || existing.materialItemId !== parsed.data.materialItemId) {
    throw new NotFoundError('Material vendor price');
  }

  const deleted = await deleteMaterialVendorPrice(
    context.db,
    context.organizationId,
    parsed.data.id,
  );
  if (!deleted) throw new NotFoundError('Material vendor price');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MATERIAL_VENDOR_PRICE_DELETED,
    entityType: 'material_vendor_price',
    entityId: deleted.id,
    before: {
      id: deleted.id,
      materialItemId: deleted.materialItemId,
      vendorId: deleted.vendorId,
    },
  });
  return deleted;
}

export type { MaterialVendorPriceRow };
