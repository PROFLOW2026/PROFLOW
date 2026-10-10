'use server';

import { refresh } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  grantContractorAccess,
  inviteContractor,
  issueContractorPasswordReset,
  reissueContractorInvite,
  revokeContractorGrant,
  revokeContractorSessions,
  setContractorAccountDisabled,
  updateContractorGrantCapabilities,
  updateHomeContractorPrincipal,
} from '@/modules/contractor-access';
import {
  contractorAccessDeps,
  contractorErrorState,
} from '@/modules/contractor-access/application/action-support';
import {
  formToObject,
  grantContractorSchema,
  grantRefSchema,
  inviteContractorSchema,
  principalRefSchema,
  updateGrantSchema,
  updateHomePrincipalSchema,
} from '@/modules/contractor-access/validation/schemas';
import { withOrgContext } from '@/shared/auth/session';
import { isRedirectError } from '@/modules/workforce/application/map-workforce-action-error';

export interface ContractorAccessActionState {
  readonly error?: string;
  readonly success?: string;
  /** Single-use link shown once (activation or reset); relative path, the client prefixes the origin. */
  readonly link?: { readonly kind: 'invite' | 'reset'; readonly path: string; readonly expiresAt: string; readonly username?: string };
}

async function run(
  fn: (t: Awaited<ReturnType<typeof getTranslations>>) => Promise<ContractorAccessActionState>,
): Promise<ContractorAccessActionState> {
  const t = await getTranslations('contractorAccess');
  try {
    const state = await fn(t);
    refresh();
    return state;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return contractorErrorState(t, error);
  }
}

export async function inviteContractorAction(
  _prev: ContractorAccessActionState,
  formData: FormData,
): Promise<ContractorAccessActionState> {
  const raw = formToObject(formData);
  const parsed = inviteContractorSchema.safeParse(raw);
  if (!parsed.success) {
    const t = await getTranslations('contractorAccess');
    return { error: t('errors.validation') };
  }
  return run(async (t) => {
    const result = await withOrgContext((context) => inviteContractor(context, contractorAccessDeps(), parsed.data));
    return {
      success: t('manage.inviteResult.title'),
      link: {
        kind: 'invite',
        path: result.activationPath,
        expiresAt: result.activationExpiresAt.toISOString(),
        username: result.username,
      },
    };
  });
}

export async function grantContractorAccessAction(
  _prev: ContractorAccessActionState,
  formData: FormData,
): Promise<ContractorAccessActionState> {
  const raw = formToObject(formData);
  const parsed = grantContractorSchema.safeParse(raw);
  if (!parsed.success) {
    const t = await getTranslations('contractorAccess');
    return { error: t('errors.validation') };
  }
  return run(async (t) => {
    await withOrgContext((context) => grantContractorAccess(context, parsed.data));
    return { success: t('manage.actions.saved') };
  });
}

export async function updateContractorGrantAction(
  _prev: ContractorAccessActionState,
  formData: FormData,
): Promise<ContractorAccessActionState> {
  const raw = formToObject(formData);
  const parsed = updateGrantSchema.safeParse(raw);
  if (!parsed.success) {
    const t = await getTranslations('contractorAccess');
    return { error: t('errors.validation') };
  }
  return run(async (t) => {
    await withOrgContext((context) => updateContractorGrantCapabilities(context, parsed.data));
    return { success: t('manage.actions.saved') };
  });
}

export async function revokeContractorGrantAction(
  _prev: ContractorAccessActionState,
  formData: FormData,
): Promise<ContractorAccessActionState> {
  const parsed = grantRefSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const t = await getTranslations('contractorAccess');
    return { error: t('errors.validation') };
  }
  return run(async (t) => {
    await withOrgContext((context) => revokeContractorGrant(context, parsed.data));
    return { success: t('manage.actions.revoked') };
  });
}

type PrincipalCommand = 'reissue_invite' | 'issue_reset' | 'revoke_sessions' | 'disable' | 'enable';

export async function updateContractorPrincipalProfileAction(
  _prev: ContractorAccessActionState,
  formData: FormData,
): Promise<ContractorAccessActionState> {
  const parsed = updateHomePrincipalSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const t = await getTranslations('contractorAccess');
    return { error: t('errors.validation') };
  }
  return run(async (t) => {
    await withOrgContext((context) => updateHomeContractorPrincipal(context, contractorAccessDeps(), parsed.data));
    return { success: t('manage.actions.profileSaved') };
  });
}

export async function contractorPrincipalCommandAction(
  _prev: ContractorAccessActionState,
  formData: FormData,
): Promise<ContractorAccessActionState> {
  const raw = formToObject(formData);
  const parsed = principalRefSchema.safeParse(raw);
  const command = String(raw.command ?? '') as PrincipalCommand;
  if (!parsed.success) {
    const t = await getTranslations('contractorAccess');
    return { error: t('errors.validation') };
  }
  return run(async (t) => {
    switch (command) {
      case 'reissue_invite': {
        const link = await withOrgContext((context) => reissueContractorInvite(context, parsed.data));
        return { success: t('manage.actions.linkReady'), link: { kind: 'invite', path: link.activationPath, expiresAt: link.expiresAt.toISOString() } };
      }
      case 'issue_reset': {
        const link = await withOrgContext((context) => issueContractorPasswordReset(context, parsed.data));
        return { success: t('manage.actions.linkReady'), link: { kind: 'reset', path: link.resetPath, expiresAt: link.expiresAt.toISOString() } };
      }
      case 'revoke_sessions':
        await withOrgContext((context) => revokeContractorSessions(context, parsed.data));
        return { success: t('manage.actions.sessionsRevoked') };
      case 'disable':
      case 'enable':
        await withOrgContext((context) =>
          setContractorAccountDisabled(context, contractorAccessDeps(), { ...parsed.data, disabled: command === 'disable' }),
        );
        return { success: t(command === 'disable' ? 'manage.actions.disabled' : 'manage.actions.enabled') };
      default:
        return { error: t('errors.validation') };
    }
  });
}
