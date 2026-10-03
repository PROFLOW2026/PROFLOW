import 'server-only';
import { getTranslations } from 'next-intl/server';
import { mapServerActionError } from '@/shared/errors';
import type { QualityFormState } from './form-state';

/** FormData readers shared by the quality server actions. */

export function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

/** undefined when the field is absent from the form (= leave unchanged). */
export function optionalText(formData: FormData, key: string): string | null | undefined {
  if (!formData.has(key)) return undefined;
  return text(formData, key);
}

export function checked(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === 'on' || value === 'true' || value === '1';
}

export async function mapQualityError(error: unknown): Promise<QualityFormState> {
  const [tErrors, tValidation, tDefects, tInspections] = await Promise.all([
    getTranslations('errors'),
    getTranslations('validation'),
    getTranslations('defects'),
    getTranslations('inspections'),
  ]);
  const mapped = mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    tValidation: (key) => tValidation(key as 'invalidDate'),
    namespaces: {
      defects: (key) => tDefects(key as 'title'),
      inspections: (key) => tInspections(key as 'title'),
    },
  });
  return { error: mapped.error, fieldErrors: mapped.fieldErrors };
}
