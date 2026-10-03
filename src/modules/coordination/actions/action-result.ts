import { getTranslations } from 'next-intl/server';
import { mapServerActionError } from '@/shared/errors';

export type CoordinationActionResult<T = undefined> =
  | ({ readonly ok: true } & (T extends undefined ? object : { readonly data: T }))
  | { readonly ok: false; readonly error: string; readonly fieldErrors?: Record<string, string> };

/** Maps AppErrors to localized, UI-safe messages (coordination.* keys first, then errors.*). */
export async function coordinationActionError(
  error: unknown,
): Promise<{ ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const [tErrors, tValidation, tCoordination] = await Promise.all([
    getTranslations('errors'),
    getTranslations('validation'),
    getTranslations('coordination'),
  ]);
  const mapped = mapServerActionError(error, {
    tErrors: (key) => tErrors(key as never),
    tValidation: (key) => tValidation(key as never),
    namespaces: { coordination: (key) => tCoordination(key as never) },
  });
  return { ok: false, error: mapped.error, ...(mapped.fieldErrors ? { fieldErrors: mapped.fieldErrors } : {}) };
}
