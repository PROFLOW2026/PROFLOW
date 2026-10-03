import 'server-only';
import { getTranslations } from 'next-intl/server';
import { mapServerActionError } from '@/shared/errors';
import type { CollabActionState } from './action-state.types';

export type { CollabActionState };

export const COLLAB_ACTION_OK = (): CollabActionState => ({ success: true, nonce: Date.now() });

export async function mapCollabActionError(error: unknown): Promise<CollabActionState> {
  const [tErrors, tCollab] = await Promise.all([
    getTranslations('errors'),
    getTranslations('collaboration'),
  ]);
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: { collaboration: (key) => tCollab(key as never) },
  });
}
