import { findAssetById, findFleetById, findMaintenanceById } from '@/modules/assets';
import { findComplianceArtifactById } from '@/modules/compliance';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import type { OpsRecordCostSnapshot, OpsRecordKind } from '../domain/types';

export async function loadOpsRecordCostSnapshot(
  context: OrgContext,
  opsRecordKind: OpsRecordKind,
  opsRecordId: string,
): Promise<OpsRecordCostSnapshot> {
  switch (opsRecordKind) {
    case 'maintenance_record': {
      const record = await findMaintenanceById(
        context.db,
        context.organizationId,
        opsRecordId,
      );
      if (!record || record.archivedAt) throw new NotFoundError('Maintenance record');
      const asset = await findAssetById(context.db, context.organizationId, record.assetId);
      return {
        opsRecordKind,
        opsRecordId: record.id,
        costAmount: record.costAmount,
        currency: record.currency,
        title: record.title,
        vendorId: record.vendorId,
        projectId: asset?.assignedProjectId ?? null,
        occurredOn: record.performedOn,
        notes: record.notes,
      };
    }
    case 'compliance_artifact': {
      const artifact = await findComplianceArtifactById(
        context.db,
        context.organizationId,
        opsRecordId,
      );
      if (!artifact || artifact.archivedAt) throw new NotFoundError('Compliance artifact');
      return {
        opsRecordKind,
        opsRecordId: artifact.id,
        costAmount: null,
        currency: null,
        title: artifact.name,
        vendorId: artifact.subjectType === 'vendor' ? artifact.subjectId : null,
        projectId: artifact.subjectType === 'project' ? artifact.subjectId : null,
        occurredOn: artifact.issuedOn,
        notes: artifact.notes,
      };
    }
    case 'fleet_vehicle': {
      const fleet = await findFleetById(context.db, context.organizationId, opsRecordId);
      if (!fleet || fleet.archivedAt) throw new NotFoundError('Fleet vehicle');
      const asset = await findAssetById(context.db, context.organizationId, fleet.assetId);
      return {
        opsRecordKind,
        opsRecordId: fleet.id,
        costAmount: null,
        currency: null,
        title: asset?.name ?? 'Fleet vehicle',
        vendorId: null,
        projectId: asset?.assignedProjectId ?? null,
        occurredOn: null,
        notes: fleet.notes,
      };
    }
    case 'recurring_business_cost': {
      // Until a dedicated table exists, recurring business costs reuse compliance
      // artifacts (typically insurance) as the ops anchor.
      const artifact = await findComplianceArtifactById(
        context.db,
        context.organizationId,
        opsRecordId,
      );
      if (!artifact || artifact.archivedAt) throw new NotFoundError('Recurring business cost');
      return {
        opsRecordKind,
        opsRecordId: artifact.id,
        costAmount: null,
        currency: null,
        title: artifact.name,
        vendorId: artifact.subjectType === 'vendor' ? artifact.subjectId : null,
        projectId: artifact.subjectType === 'project' ? artifact.subjectId : null,
        occurredOn: artifact.issuedOn,
        notes: artifact.notes,
      };
    }
    default: {
      const _exhaustive: never = opsRecordKind;
      throw new NotFoundError(`Ops record ${_exhaustive}`);
    }
  }
}
