import { z } from 'zod';
import { ValidationError } from '@/shared/errors';
import { isIsoDate } from '../domain/dates';

/** Zod helpers shared by the field modules (site-log, site-meetings, site-instructions). */

export const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

export const optionalText = (max = 4000) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

export const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());

export const isoDate = z
  .string()
  .trim()
  .refine((value) => isIsoDate(value), 'Date must be YYYY-MM-DD');

export const optionalIsoDate = z.preprocess(emptyToNull, isoDate.nullable().optional());

export const optionalNonNegativeInt = z.preprocess(
  emptyToNull,
  z.coerce.number().int().min(0).max(100000).nullable().optional(),
);

export const optionalNonNegativeDecimal = z.preprocess(
  emptyToNull,
  z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
);

export function parseOrThrow<T>(
  result:
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } },
): T {
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    );
  }
  return result.data;
}

/** FormData -> plain object (last value wins; empty strings kept for the preprocessors). */
export function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}
