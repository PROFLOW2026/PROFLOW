import { getAdminDb } from '@/shared/db/client';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
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
 * Cross-tenant read by code hash (service connection). Does not consume the code.
 */
export async function previewCode(rawCode: string): Promise<PreviewCodeResult> {
  const code = rawCode.trim();
  if (!isPlausibleConnectionCode(code)) throw err('invalid_code');

  const codeHash = hashConnectionCode(code);
  const db = getAdminDb();
  const invitation = await findInvitationByCodeHash(db, codeHash);
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

  const preview = await loadDeveloperEngagementPreview(db, invitation);
  return { preview, invitationId: invitation.id, invitationState };
}
