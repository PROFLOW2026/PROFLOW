import { DomainRuleError } from '@/shared/errors';
import { templateRequiresAcknowledgement } from './schema';
import type {
  FormChecklistAnswer,
  FormFieldDefinition,
  FormPhotoAnswer,
  FormTemplateSchema,
} from './types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

function parseChecklistAnswer(
  field: FormFieldDefinition,
  raw: unknown,
  requireComplete: boolean,
): FormChecklistAnswer {
  const items = field.items ?? [];
  const itemKeys = new Set(items.map((item) => item.key));
  const result: Record<string, boolean> = {};
  for (const item of items) result[item.key] = false;

  if (raw === null || raw === undefined) {
    if (requireComplete && field.required) {
      throw new DomainRuleError(
        `Checklist "${field.label}" is required.`,
        'errors.validationFailed',
        { fieldKey: field.key },
      );
    }
    return result;
  }

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'string' && itemKeys.has(entry)) result[entry] = true;
    }
  } else if (isPlainObject(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (itemKeys.has(key)) result[key] = value === true || value === 'true' || value === 'on';
    }
  } else {
    throw new DomainRuleError(
      `Checklist "${field.label}" has an invalid answer.`,
      'errors.validationFailed',
      { fieldKey: field.key },
    );
  }

  if (requireComplete && field.required) {
    const anyChecked = Object.values(result).some(Boolean);
    if (!anyChecked) {
      throw new DomainRuleError(
        `Checklist "${field.label}" requires at least one checked item.`,
        'errors.validationFailed',
        { fieldKey: field.key },
      );
    }
  }

  return result;
}

function parsePhotoAnswer(field: FormFieldDefinition, raw: unknown, requireComplete: boolean): FormPhotoAnswer {
  let documentIds: string[] = [];
  if (raw === null || raw === undefined) {
    documentIds = [];
  } else if (Array.isArray(raw)) {
    documentIds = raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } else if (isPlainObject(raw) && Array.isArray(raw.documentIds)) {
    documentIds = raw.documentIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
  } else {
    throw new DomainRuleError(
      `Photo field "${field.label}" has an invalid answer.`,
      'errors.validationFailed',
      { fieldKey: field.key },
    );
  }

  if (requireComplete && field.required && documentIds.length === 0) {
    throw new DomainRuleError(
      `Photo field "${field.label}" requires at least one photo.`,
      'errors.validationFailed',
      { fieldKey: field.key },
    );
  }

  return { documentIds };
}

function parseFieldAnswer(
  field: FormFieldDefinition,
  raw: unknown,
  requireComplete: boolean,
): unknown {
  switch (field.type) {
    case 'checklist':
      return parseChecklistAnswer(field, raw, requireComplete);
    case 'yes_no': {
      if (raw === null || raw === undefined || raw === '') {
        if (requireComplete && field.required) {
          throw new DomainRuleError(
            `"${field.label}" is required.`,
            'errors.validationFailed',
            { fieldKey: field.key },
          );
        }
        return null;
      }
      if (raw === true || raw === 'true' || raw === 'yes' || raw === 'on') return true;
      if (raw === false || raw === 'false' || raw === 'no') return false;
      throw new DomainRuleError(
        `"${field.label}" must be yes or no.`,
        'errors.validationFailed',
        { fieldKey: field.key },
      );
    }
    case 'text':
    case 'notes': {
      const text = asTrimmedString(raw);
      if (!text) {
        if (requireComplete && field.required) {
          throw new DomainRuleError(
            `"${field.label}" is required.`,
            'errors.validationFailed',
            { fieldKey: field.key },
          );
        }
        return null;
      }
      const max = field.type === 'notes' ? 8000 : 2000;
      if (text.length > max) {
        throw new DomainRuleError(
          `"${field.label}" is too long.`,
          'errors.validationFailed',
          { fieldKey: field.key },
        );
      }
      return text;
    }
    case 'number': {
      if (raw === null || raw === undefined || raw === '') {
        if (requireComplete && field.required) {
          throw new DomainRuleError(
            `"${field.label}" is required.`,
            'errors.validationFailed',
            { fieldKey: field.key },
          );
        }
        return null;
      }
      const num = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isFinite(num)) {
        throw new DomainRuleError(
          `"${field.label}" must be a number.`,
          'errors.validationFailed',
          { fieldKey: field.key },
        );
      }
      return num;
    }
    case 'date': {
      const text = asTrimmedString(raw);
      if (!text) {
        if (requireComplete && field.required) {
          throw new DomainRuleError(
            `"${field.label}" is required.`,
            'errors.validationFailed',
            { fieldKey: field.key },
          );
        }
        return null;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new DomainRuleError(
          `"${field.label}" must be YYYY-MM-DD.`,
          'errors.validationFailed',
          { fieldKey: field.key },
        );
      }
      return text;
    }
    case 'photo':
      return parsePhotoAnswer(field, raw, requireComplete);
    case 'signature': {
      // Acknowledgement name/time live on submission columns; answer is a flag only.
      const acknowledged =
        raw === true ||
        (isPlainObject(raw) &&
          (raw.acknowledged === true || raw.acknowledged === 'true' || raw.acknowledged === 'on'));
      if (requireComplete && field.required && !acknowledged) {
        throw new DomainRuleError(
          `"${field.label}" acknowledgement is required.`,
          'errors.validationFailed',
          { fieldKey: field.key },
        );
      }
      return { acknowledged: Boolean(acknowledged) };
    }
    default:
      return raw ?? null;
  }
}

export interface NormalizedFormAnswers {
  readonly answers: Record<string, unknown>;
  readonly requiresAcknowledgement: boolean;
}

/**
 * Validate and normalize answers against a template schema.
 * When `requireComplete` is true (submit), required fields must be filled.
 */
export function normalizeFormAnswers(
  schema: FormTemplateSchema,
  rawAnswers: unknown,
  options: { readonly requireComplete?: boolean } = {},
): NormalizedFormAnswers {
  const requireComplete = options.requireComplete === true;
  const source = isPlainObject(rawAnswers) ? rawAnswers : {};
  const answers: Record<string, unknown> = {};

  for (const field of schema.fields) {
    answers[field.key] = parseFieldAnswer(field, source[field.key], requireComplete);
  }

  return {
    answers,
    requiresAcknowledgement: templateRequiresAcknowledgement(schema),
  };
}
