import type { OrgContext } from '@/shared/auth/context';
import { PROJECT_CAPABILITIES as C, assertProjectCapability } from '@/modules/project-team';
import { findAgreementScope } from '@/modules/contractor-compliance';
import { NotFoundError } from '@/shared/errors';
import { computePerformanceMetrics, PERFORMANCE_FORMULA_VERSION, type PerformanceInputs } from '../domain/metrics';
import { insertPerformanceSnapshot, listSnapshotsForAgreement } from '../data/performance.repository';

/** Collects factual counts available in this wave; extend as domain tracks expose query ports. */
async function collectPerformanceInputs(
  _context: OrgContext,
  _projectId: string,
  _agreementId: string,
): Promise<PerformanceInputs> {
  return {
    tasksAssigned: 0,
    tasksCompletedOnTime: 0,
    defectsReported: 0,
    defectsReopened: 0,
    rfisAnsweredWithinSla: 0,
    rfisTotalAnswered: 0,
    inspectionsPassed: 0,
    inspectionsTotal: 0,
    complianceDocumentsApproved: 0,
    complianceDocumentsRequired: 0,
  };
}

export async function computeAgreementPerformanceSnapshot(
  context: OrgContext,
  input: { readonly projectId: string; readonly agreementId: string },
) {
  await assertProjectCapability(context, input.projectId, C.CONTRACTOR_COORDINATE);
  const scope = await findAgreementScope(context.db, context.organizationId, input.agreementId);
  if (!scope || scope.projectId !== input.projectId) throw new NotFoundError('Subcontract agreement');
  const inputs = await collectPerformanceInputs(context, input.projectId, input.agreementId);
  const metrics = computePerformanceMetrics(inputs);
  const snapshotId = await insertPerformanceSnapshot(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    vendorId: scope.vendorId,
    subcontractAgreementId: input.agreementId,
    formulaVersion: PERFORMANCE_FORMULA_VERSION,
    metricsJson: metrics,
    computedByUserId: context.userId,
  });
  return { snapshotId, metrics };
}

export async function listAgreementPerformanceSnapshots(
  context: OrgContext,
  input: { readonly projectId: string; readonly agreementId: string },
) {
  await assertProjectCapability(context, input.projectId, C.PROJECT_VIEW);
  const scope = await findAgreementScope(context.db, context.organizationId, input.agreementId);
  if (!scope || scope.projectId !== input.projectId) throw new NotFoundError('Subcontract agreement');
  return listSnapshotsForAgreement(context.db, context.organizationId, input.agreementId);
}
