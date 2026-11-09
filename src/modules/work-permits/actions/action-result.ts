import { getTranslations } from 'next-intl/server';
import { mapServerActionError } from '@/shared/errors';

export type WorkPermitActionResult<T = undefined> =
  | ({ readonly ok: true } & (T extends undefined ? object : { readonly data: T }))
  | { readonly ok: false; readonly error: string; readonly fieldErrors?: Record<string, string> };

export async function workPermitActionError(
  error: unknown,
): Promise<{ ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const [tErrors, tValidation, tWorkPermits] = await Promise.all([
    getTranslations('errors'),
    getTranslations('validation'),
    getTranslations('workPermits'),
  ]);
  const mapped = mapServerActionError(error, {
    tErrors: (key) => tErrors(key as never),
    tValidation: (key) => tValidation(key as never),
    namespaces: { workPermits: (key) => tWorkPermits(key as never) },
  });
  return { ok: false, error: mapped.error, ...(mapped.fieldErrors ? { fieldErrors: mapped.fieldErrors } : {}) };
}
