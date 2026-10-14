import type { OrgContext } from '@/shared/auth/context';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  connectionCodesEqual,
  hashConnectionCode,
  isPlausibleConnectionCode,
} from '../domain/connection-code';
import { invitationRuntimeState } from '../domain/connection-lifecycle';
import { findInvitationByCodeHash } from '../data/connection.repository';
import { loadDeveloperEngagementPreview } from './load-engagement-preview';
import type { DeveloperEngagementPreview } from '../domain/types';

export interface PreviewCodeResult {
  readonly preview: DeveloperEngagementPreview;
  readonly invitationId: string;
  readonly invitationState: 'valid' | 'expired' | 'consumed' | 'revoked';
}

const err = (key: string) => new DomainRuleError(key, `connectedProjects.errors.${key}`);

/**
 * Cross-tenant read by code hash (service role inside the org transaction). Does not consume the code.
 */
export async function previewCode(context: OrgContext, rawCode: string): Promise<PreviewCodeResult> {
  assertPermission(context, PERMISSIONS.PROJECTS_CREATE);

  const code = rawCode.trim();
  if (!isPlausibleConnectionCode(code)) throw err('invalid_code');

  const codeHash = hashConnectionCode(code);

  return asServiceRoleWrite(context.db, async () => {
    const invitation = await findInvitationByCodeHash(context.db, codeHash);
    if (!invitation || !connectionCodesEqual(invitation.codeHash, code)) {
      throw new NotFoundError('Connection code');
    }

    const invitationState = invitationRuntimeState(invitation);
    if (invitationState !== 'valid') {
      throw err(
        invitationState === 'expired'
          ? 'code_expired'
          : invitationState === 'consumed'
            ? 'code_consumed'
            : 'code_revoked',
      );
    }

    const preview = await loadDeveloperEngagementPreview(context.db, invitation);
    return { preview, invitationId: invitation.id, invitationState };
  });
}
