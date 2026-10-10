import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { loadDeveloperEngagementPreview } from './load-engagement-preview';
import { provisionContractorProject } from './provision-contractor-project';
import {
  findInvitationById,
  findMappingByIdForContractorOrg,
  updateMappingProvisioning,
} from '../data/connection.repository';
import type { AcceptCodeResult } from './accept-code';

const err = (key: string) => new DomainRuleError(key, `connectedProjects.errors.${key}`);

/** Resume failed provisioning without a new connection code (idempotent). */
export async function retryConnectedProjectProvisioning(
  context: OrgContext,
  mappingId: string,
): Promise<AcceptCodeResult> {
  const mapping = await findMappingByIdForContractorOrg(context.db, mappingId, context.organizationId);
  if (!mapping) throw new NotFoundError('Connection mapping');

  if (mapping.provisioningStatus === 'succeeded' && mapping.contractorProjectId) {
    return {
      mappingId: mapping.id,
      contractorProjectId: mapping.contractorProjectId,
      idempotentReplay: true,
    };
  }

  if (mapping.provisioningStatus !== 'failed' && mapping.status !== 'failed') {
    throw err('provisioning_not_retryable');
  }

  if (!mapping.invitationId) throw new NotFoundError('Connection invitation');
  const invitation = await findInvitationById(
    context.db,
    mapping.developerOrganizationId,
    mapping.invitationId,
  );
  if (!invitation) throw new NotFoundError('Connection invitation');
  const preview = await loadDeveloperEngagementPreview(context.db, invitation);

  await asServiceRoleWrite(context.db, () =>
    updateMappingProvisioning(context.db, mapping.id, context.organizationId, {
      provisioningStatus: 'in_progress',
      status: 'provisioning',
    }),
  );

  try {
    const provisioned = await provisionContractorProject(context, { preview });

    await asServiceRoleWrite(context.db, () =>
      updateMappingProvisioning(context.db, mapping.id, context.organizationId, {
        provisioningStatus: 'succeeded',
        status: 'active',
        contractorClientId: provisioned.clientId,
        contractorProjectId: provisioned.projectId,
      }),
    );

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.CONNECTED_PROJECT_PROVISION_RETRY,
      entityType: 'connected_project_mapping',
      entityId: mapping.id,
      after: { contractorProjectId: provisioned.projectId },
    });

    return {
      mappingId: mapping.id,
      contractorProjectId: provisioned.projectId,
      idempotentReplay: false,
    };
  } catch (error) {
    await asServiceRoleWrite(context.db, () =>
      updateMappingProvisioning(context.db, mapping.id, context.organizationId, {
        provisioningStatus: 'failed',
        status: 'failed',
      }),
    );
    throw error;
  }
}
