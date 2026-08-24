import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { findProjectById } from '@/modules/projects';
import { findExpenseById } from '@/modules/expenses';
import { findApBillById } from '@/modules/ap';
import {
  findAssetById,
  findFleetByAssetId,
  insertAsset,
  insertFleetVehicle,
  listAssets,
  updateAssetById,
} from '../data/assets.repository';
import { assetDocumentOwnerType } from '../domain/maintenance';
import {
  createAssetSchema,
  updateAssetSchema,
  type CreateAssetInput,
  type UpdateAssetInput,
} from '../validation/schemas';

export async function listAssetsForOrg(context: OrgContext) {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  return listAssets(context.db, context.organizationId);
}

export async function getAssetById(context: OrgContext, assetId: string) {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  const asset = await findAssetById(context.db, context.organizationId, assetId);
  if (!asset) return null;
  const fleet = await findFleetByAssetId(context.db, context.organizationId, assetId);
  return {
    asset,
    fleet,
    documentsOwnerType: assetDocumentOwnerType(),
  };
}

/**
 * Resolve optional acquisition source links.
 * Storing sourceExpenseId / sourceApBillId is traceability only —
 * does NOT create Actual (Expense/AP remains the recognition source).
 */
async function assertAcquisitionSources(
  context: OrgContext,
  input: {
    readonly sourceExpenseId?: string | null;
    readonly sourceApBillId?: string | null;
  },
): Promise<void> {
  if (input.sourceExpenseId) {
    const expense = await findExpenseById(
      context.db,
      context.organizationId,
      input.sourceExpenseId,
    );
    if (!expense) throw new NotFoundError('Expense');
  }
  if (input.sourceApBillId) {
    const bill = await findApBillById(context.db, context.organizationId, input.sourceApBillId);
    if (!bill) throw new NotFoundError('AP bill');
  }
}

export async function createAsset(context: OrgContext, raw: CreateAssetInput) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const parsed = createAssetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  if (input.assignedProjectId) {
    const project = await findProjectById(
      context.db,
      context.organizationId,
      input.assignedProjectId,
    );
    if (!project || project.archivedAt) throw new NotFoundError('Project');
  }

  await assertAcquisitionSources(context, input);

  // Acquisition fields are metadata/trace only — no Expense, AP, or Actual posting here.
  const asset = await insertAsset(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    assetKind: input.assetKind ?? 'equipment',
    status: input.status ?? 'active',
    identifier: input.identifier ?? null,
    manufacturer: input.manufacturer ?? null,
    model: input.model ?? null,
    serialNumber: input.serialNumber ?? null,
    assignedProjectId: input.assignedProjectId ?? null,
    acquisitionAmount: input.acquisitionAmount ?? null,
    acquisitionCurrency: input.acquisitionCurrency
      ? input.acquisitionCurrency.toUpperCase()
      : null,
    acquiredOn: input.acquiredOn ?? null,
    sourceExpenseId: input.sourceExpenseId ?? null,
    sourceApBillId: input.sourceApBillId ?? null,
    notes: input.notes ?? null,
  });

  const wantsFleet =
    input.assetKind === 'vehicle' ||
    Boolean(input.plateNumber?.trim()) ||
    Boolean(input.vin?.trim()) ||
    Boolean(input.odometer?.trim());

  let fleet = null;
  if (wantsFleet) {
    fleet = await insertFleetVehicle(context.db, {
      organizationId: context.organizationId,
      assetId: asset.id,
      plateNumber: input.plateNumber ?? null,
      vin: input.vin ?? null,
      odometer: input.odometer ?? null,
    });
  }

  await noteModuleUsage(context.db, context.organizationId, 'assets');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.ASSET_CREATED,
    entityType: 'asset',
    entityId: asset.id,
    after: {
      id: asset.id,
      name: asset.name,
      assetKind: asset.assetKind,
      fleetLinked: Boolean(fleet),
      sourceExpenseId: asset.sourceExpenseId,
      sourceApBillId: asset.sourceApBillId,
    },
  });

  return { asset, fleet };
}

export async function updateAsset(context: OrgContext, raw: UpdateAssetInput) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const parsed = updateAssetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findAssetById(context.db, context.organizationId, input.assetId);
  if (!existing) throw new NotFoundError('Asset');

  if (input.assignedProjectId) {
    const project = await findProjectById(
      context.db,
      context.organizationId,
      input.assignedProjectId,
    );
    if (!project || project.archivedAt) throw new NotFoundError('Project');
  }

  if (input.assetKind && input.assetKind !== 'vehicle') {
    const fleet = await findFleetByAssetId(context.db, context.organizationId, existing.id);
    if (fleet) {
      throw new DomainRuleError(
        'Cannot change kind away from vehicle while a fleet record is linked',
        'assets.errors.fleetKindLocked',
      );
    }
  }

  const nextSourceExpenseId =
    input.sourceExpenseId === undefined ? existing.sourceExpenseId : input.sourceExpenseId;
  const nextSourceApBillId =
    input.sourceApBillId === undefined ? existing.sourceApBillId : input.sourceApBillId;
  if (nextSourceExpenseId && nextSourceApBillId) {
    throw new ValidationError([
      {
        path: 'sourceApBillId',
        message: 'Link either a source expense or a source AP bill, not both',
      },
    ]);
  }

  await assertAcquisitionSources(context, {
    sourceExpenseId: input.sourceExpenseId,
    sourceApBillId: input.sourceApBillId,
  });

  // Acquisition patch is traceability only — never creates Actual.
  const updated = await updateAssetById(context.db, context.organizationId, input.assetId, {
    name: input.name,
    assetKind: input.assetKind,
    status: input.status,
    identifier: input.identifier === undefined ? undefined : input.identifier,
    manufacturer: input.manufacturer === undefined ? undefined : input.manufacturer,
    model: input.model === undefined ? undefined : input.model,
    serialNumber: input.serialNumber === undefined ? undefined : input.serialNumber,
    assignedProjectId:
      input.assignedProjectId === undefined ? undefined : input.assignedProjectId,
    notes: input.notes === undefined ? undefined : input.notes,
    acquisitionAmount:
      input.acquisitionAmount === undefined ? undefined : input.acquisitionAmount,
    acquisitionCurrency:
      input.acquisitionCurrency === undefined
        ? undefined
        : input.acquisitionCurrency
          ? input.acquisitionCurrency.toUpperCase()
          : null,
    acquiredOn: input.acquiredOn === undefined ? undefined : input.acquiredOn,
    sourceExpenseId: input.sourceExpenseId === undefined ? undefined : input.sourceExpenseId,
    sourceApBillId: input.sourceApBillId === undefined ? undefined : input.sourceApBillId,
  });
  if (!updated) throw new NotFoundError('Asset');

  await noteModuleUsage(context.db, context.organizationId, 'assets');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.ASSET_UPDATED,
    entityType: 'asset',
    entityId: updated.id,
    before: {
      status: existing.status,
      assignedProjectId: existing.assignedProjectId,
      sourceExpenseId: existing.sourceExpenseId,
      sourceApBillId: existing.sourceApBillId,
    },
    after: {
      status: updated.status,
      assignedProjectId: updated.assignedProjectId,
      sourceExpenseId: updated.sourceExpenseId,
      sourceApBillId: updated.sourceApBillId,
    },
  });

  return updated;
}
