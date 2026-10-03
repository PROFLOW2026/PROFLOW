import { getTranslations } from 'next-intl/server';
import { mapServerActionError } from '@/shared/errors';

export type SubmittalActionResult<T = undefined> =
  | ({ readonly ok: true } & (T extends undefined ? object : { readonly data: T }))
  | { readonly ok: false; readonly error: string; readonly fieldErrors?: Record<string, string> };

export async function submittalActionError(
  error: unknown,
): Promise<{ ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const [tErrors, tValidation, tSubmittals] = await Promise.all([
    getTranslations('errors'),
    getTranslations('validation'),
    getTranslations('submittals'),
  ]);
  const mapped = mapServerActionError(error, {
    tErrors: (key) => tErrors(key as never),
    tValidation: (key) => tValidation(key as never),
    namespaces: { submittals: (key) => tSubmittals(key as never) },
  });
  return { ok: false, error: mapped.error, ...(mapped.fieldErrors ? { fieldErrors: mapped.fieldErrors } : {}) };
}
