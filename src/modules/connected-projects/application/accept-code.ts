import type { OrgContext } from '@/shared/auth/context';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { getAdminDb } from '@/shared/db/client';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  connectionCodesEqual,
  hashConnectionCode,
  isPlausibleConnectionCode,
} from '../domain/connection-code';
import { invitationRuntimeState } from '../domain/connection-lifecycle';
import {
  findActiveMappingByAgreementAndContractorOrg,
  findInvitationByCodeHash,
  findMappingByInvitationAndContractorOrg,
  insertConnectedProjectMapping,
  markInvitationConsumed,
  updateMappingProvisioning,
} from '../data/connection.repository';
import { previewCode } from './preview-code';
import { provisionContractorProject } from './provision-contractor-project';

export interface AcceptCodeInput {
  readonly code: string;
  readonly projectName?: string | null;
  readonly confirmOrganization?: boolean;
}

export interface AcceptCodeResult {
  readonly mappingId: string;
  readonly contractorProjectId: string;
  readonly idempotentReplay: boolean;
}

const err = (key: string) => new DomainRuleError(key, `connectedProjects.errors.${key}`);

export async function acceptCode(context: OrgContext, input: AcceptCodeInput): Promise<AcceptCodeResult> {
  assertPermission(context, PERMISSIONS.PROJECTS_CREATE);
  if (!input.confirmOrganization) throw err('confirm_org_required');

  const code = input.code.trim();
  if (!isPlausibleConnectionCode(code)) throw err('invalid_code');

  const codeHash = hashConnectionCode(code);
  const adminDb = getAdminDb();
  const invitation = await findInvitationByCodeHash(adminDb, codeHash);
  if (!invitation || !connectionCodesEqual(invitation.codeHash, code)) {
    throw new NotFoundError('Connection code');
  }

  const existingByInvitation = await findMappingByInvitationAndContractorOrg(
    context.db,
    invitation.id,
    context.organizationId,
  );
  if (
    existingByInvitation?.provisioningStatus === 'succeeded' &&
    existingByInvitation.contractorProjectId
  ) {
    return {
      mappingId: existingByInvitation.id,
      contractorProjectId: existingByInvitation.contractorProjectId,
      idempotentReplay: true,
    };
  }

  const existingByAgreement = await findActiveMappingByAgreementAndContractorOrg(
    context.db,
    invitation.subcontractAgreementId,
    context.organizationId,
  );
  if (existingByAgreement && existingByAgreement.invitationId !== invitation.id) {
    throw new ConflictError('Engagement already connected', 'connectedProjects.errors.already_connected');
  }

  const state = invitationRuntimeState(invitation);
  if (state !== 'valid' && !existingByInvitation) {
    throw err(state === 'expired' ? 'code_expired' : state === 'consumed' ? 'code_consumed' : 'code_revoked');
  }

  const preview = (await previewCode(code)).preview;

  let mappingId = existingByInvitation?.id;
  if (!mappingId) {
    mappingId = await asServiceRoleWrite(context.db, async () => {
      await markInvitationConsumed(adminDb, invitation.id, {
        consumedByOrganizationId: context.organizationId,
        consumedByUserId: context.userId,
      });
      return insertConnectedProjectMapping(context.db, {
        invitationId: invitation.id,
        developerOrganizationId: invitation.developerOrganizationId,
        developerProjectId: invitation.developerProjectId,
        subcontractAgreementId: invitation.subcontractAgreementId,
        contractorOrganizationId: context.organizationId,
        acceptedByUserId: context.userId,
        acceptedAt: new Date(),
        provisioningStatus: 'in_progress',
        status: 'provisioning',
      });
    });
  }

  const mappingRow = await findMappingByInvitationAndContractorOrg(
    context.db,
    invitation.id,
    context.organizationId,
  );
  if (!mappingRow) throw new NotFoundError('Connection mapping');

  if (mappingRow.provisioningStatus === 'succeeded' && mappingRow.contractorProjectId) {
    return {
      mappingId: mappingRow.id,
      contractorProjectId: mappingRow.contractorProjectId,
      idempotentReplay: true,
    };
  }

  try {
    const provisioned = await provisionContractorProject(context, {
      preview,
      projectName: input.projectName,
    });

    await asServiceRoleWrite(context.db, () =>
      updateMappingProvisioning(context.db, mappingRow.id, context.organizationId, {
        provisioningStatus: 'succeeded',
        status: 'active',
        contractorClientId: provisioned.clientId,
        contractorProjectId: provisioned.projectId,
      }),
    );

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.CONNECTED_PROJECT_ACCEPTED,
      entityType: 'connected_project_mapping',
      entityId: mappingRow.id,
      after: {
        developerOrganizationId: invitation.developerOrganizationId,
        developerProjectId: invitation.developerProjectId,
        subcontractAgreementId: invitation.subcontractAgreementId,
        contractorProjectId: provisioned.projectId,
      },
    });

    return {
      mappingId: mappingRow.id,
      contractorProjectId: provisioned.projectId,
      idempotentReplay: false,
    };
  } catch (error) {
    await asServiceRoleWrite(context.db, () =>
      updateMappingProvisioning(context.db, mappingRow.id, context.organizationId, {
        provisioningStatus: 'failed',
        status: 'failed',
      }),
    );
    throw error;
  }
}
