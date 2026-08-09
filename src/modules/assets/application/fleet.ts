import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  findAssetById,
  findFleetByAssetId,
  findFleetById,
  insertAsset,
  insertFleetVehicle,
  listFleetVehicles,
  listVehicleAssetsWithoutFleet,
  updateFleetVehicleById,
} from '../data/assets.repository';
import {
  createFleetVehicleSchema,
  updateFleetVehicleSchema,
  type CreateFleetVehicleInput,
  type UpdateFleetVehicleInput,
} from '../validation/schemas';

export async function listFleetVehiclesForOrg(context: OrgContext) {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  return listFleetVehicles(context.db, context.organizationId);
}

export async function listLinkableVehicleAssets(context: OrgContext) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  return listVehicleAssetsWithoutFleet(context.db, context.organizationId);
}

export async function createFleetVehicle(context: OrgContext, raw: CreateFleetVehicleInput) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const parsed = createFleetVehicleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  let assetId = input.assetId;

  if (assetId) {
    const asset = await findAssetById(context.db, context.organizationId, assetId);
    if (!asset || asset.archivedAt) throw new NotFoundError('Asset');
    if (asset.assetKind !== 'vehicle') {
      throw new DomainRuleError(
        'Fleet vehicles must link to an asset with kind vehicle',
        'assets.errors.fleetRequiresVehicle',
      );
    }
    const existing = await findFleetByAssetId(context.db, context.organizationId, assetId);
    if (existing) {
      throw new DomainRuleError(
        'This vehicle asset already has a fleet record',
        'assets.errors.fleetAlreadyLinked',
      );
    }
  } else {
    const asset = await insertAsset(context.db, {
      organizationId: context.organizationId,
      name: input.name!.trim(),
      assetKind: 'vehicle',
      status: 'active',
    });
    assetId = asset.id;
  }

  const fleet = await insertFleetVehicle(context.db, {
    organizationId: context.organizationId,
    assetId,
    plateNumber: input.plateNumber ?? null,
    vin: input.vin ?? null,
    odometer: input.odometer ?? null,
    notes: input.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'assets');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.FLEET_VEHICLE_CREATED,
    entityType: 'fleet_vehicle',
    entityId: fleet.id,
    after: { id: fleet.id, assetId: fleet.assetId, plateNumber: fleet.plateNumber },
  });

  return fleet;
}

export async function updateFleetVehicle(context: OrgContext, raw: UpdateFleetVehicleInput) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const parsed = updateFleetVehicleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findFleetById(context.db, context.organizationId, input.fleetVehicleId);
  if (!existing || existing.archivedAt) throw new NotFoundError('Fleet vehicle');

  const updated = await updateFleetVehicleById(
    context.db,
    context.organizationId,
    input.fleetVehicleId,
    {
      plateNumber: input.plateNumber === undefined ? undefined : input.plateNumber,
      vin: input.vin === undefined ? undefined : input.vin,
      odometer: input.odometer === undefined ? undefined : input.odometer,
      notes: input.notes === undefined ? undefined : input.notes,
    },
  );
  if (!updated) throw new NotFoundError('Fleet vehicle');

  await noteModuleUsage(context.db, context.organizationId, 'assets');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.FLEET_VEHICLE_UPDATED,
    entityType: 'fleet_vehicle',
    entityId: updated.id,
    before: {
      plateNumber: existing.plateNumber,
      vin: existing.vin,
      odometer: existing.odometer,
    },
    after: {
      plateNumber: updated.plateNumber,
      vin: updated.vin,
      odometer: updated.odometer,
    },
  });

  return updated;
}
