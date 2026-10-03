import 'server-only';
import { getTranslations } from 'next-intl/server';
import { mapServerActionError } from '@/shared/errors';

/** Result shape of every Track O server action (forms use it with useActionState). */
export interface FieldActionState {
  readonly error?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly success?: boolean;
  /** Bumps on every success so client forms can reset themselves. */
  readonly nonce?: number;
}

export const FIELD_ACTION_OK = (): FieldActionState => ({ success: true, nonce: Date.now() });

export async function mapFieldActionError(error: unknown): Promise<FieldActionState> {
  const [tErrors, tSiteOps] = await Promise.all([getTranslations('errors'), getTranslations('siteOps')]);
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: { siteOps: (key) => tSiteOps(key as never) },
  });
}
