import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { findProjectById } from '@/modules/projects/data/projects.repository';
import {
  findAssetById,
  findFleetByAssetId,
  insertAsset,
  insertFleetVehicle,
  listAssets,
} from '../data/assets.repository';
import { createAssetSchema, type CreateAssetInput } from '../validation/schemas';

export async function listAssetsForOrg(context: OrgContext) {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  return listAssets(context.db, context.organizationId);
}

export async function getAssetById(context: OrgContext, assetId: string) {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  const asset = await findAssetById(context.db, context.organizationId, assetId);
  if (!asset) return null;
  const fleet = await findFleetByAssetId(context.db, context.organizationId, assetId);
  return { asset, fleet };
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
    },
  });

  return { asset, fleet };
}
