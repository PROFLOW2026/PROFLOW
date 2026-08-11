import { DomainRuleError } from '@/shared/errors';
import {
  FORM_FIELD_TYPES,
  FORM_TEMPLATE_SCHEMA_VERSION,
  type FormChecklistItem,
  type FormFieldDefinition,
  type FormFieldType,
  type FormTemplateSchema,
} from './types';

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseChecklistItems(raw: unknown, fieldKey: string): FormChecklistItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new DomainRuleError(
      `Checklist field "${fieldKey}" requires at least one item.`,
      'errors.validationFailed',
      { fieldKey },
    );
  }

  const items: FormChecklistItem[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of raw.entries()) {
    if (typeof entry === 'string') {
      const label = entry.trim();
      if (!label) {
        throw new DomainRuleError(
          `Checklist item ${index} on "${fieldKey}" is empty.`,
          'errors.validationFailed',
        );
      }
      const key = `item_${index + 1}`;
      items.push({ key, label });
      continue;
    }
    if (!isPlainObject(entry)) {
      throw new DomainRuleError(
        `Checklist item ${index} on "${fieldKey}" is invalid.`,
        'errors.validationFailed',
      );
    }
    const key = typeof entry.key === 'string' ? entry.key.trim() : '';
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    if (!KEY_PATTERN.test(key) || !label) {
      throw new DomainRuleError(
        `Checklist item ${index} on "${fieldKey}" needs key + label.`,
        'errors.validationFailed',
      );
    }
    if (seen.has(key)) {
      throw new DomainRuleError(
        `Duplicate checklist item key "${key}" on "${fieldKey}".`,
        'errors.validationFailed',
      );
    }
    seen.add(key);
    items.push({ key, label });
  }
  return items;
}

function parseField(raw: unknown, index: number): FormFieldDefinition {
  if (!isPlainObject(raw)) {
    throw new DomainRuleError(`Field ${index} is invalid.`, 'errors.validationFailed');
  }

  const key = typeof raw.key === 'string' ? raw.key.trim() : '';
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  const type = raw.type;
  if (!KEY_PATTERN.test(key)) {
    throw new DomainRuleError(
      `Field ${index} key must be snake_case starting with a letter.`,
      'errors.validationFailed',
    );
  }
  if (!label || label.length > 200) {
    throw new DomainRuleError(`Field "${key}" label is required (max 200).`, 'errors.validationFailed');
  }
  if (typeof type !== 'string' || !(FORM_FIELD_TYPES as readonly string[]).includes(type)) {
    throw new DomainRuleError(`Field "${key}" has unknown type.`, 'errors.validationFailed');
  }

  const helpText =
    raw.helpText === null || raw.helpText === undefined
      ? null
      : typeof raw.helpText === 'string'
        ? raw.helpText.trim().slice(0, 500) || null
        : null;

  const field: FormFieldDefinition = {
    key,
    type: type as FormFieldType,
    label,
    required: raw.required === true,
    helpText,
    ...(type === 'checklist' ? { items: parseChecklistItems(raw.items, key) } : {}),
  };
  return field;
}

/**
 * Normalize and validate template schema_json.
 * Throws DomainRuleError on invalid shape.
 */
export function parseFormTemplateSchema(raw: unknown): FormTemplateSchema {
  if (!isPlainObject(raw)) {
    throw new DomainRuleError('Form schema must be an object.', 'errors.validationFailed');
  }

  const version = raw.version === undefined ? FORM_TEMPLATE_SCHEMA_VERSION : raw.version;
  if (version !== FORM_TEMPLATE_SCHEMA_VERSION) {
    throw new DomainRuleError(
      `Unsupported form schema version: ${String(version)}`,
      'errors.validationFailed',
    );
  }

  if (!Array.isArray(raw.fields) || raw.fields.length === 0) {
    throw new DomainRuleError('Form schema needs at least one field.', 'errors.validationFailed');
  }
  if (raw.fields.length > 80) {
    throw new DomainRuleError('Form schema exceeds field limit (80).', 'errors.validationFailed');
  }

  const fields: FormFieldDefinition[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of raw.fields.entries()) {
    const field = parseField(entry, index);
    if (seen.has(field.key)) {
      throw new DomainRuleError(
        `Duplicate field key "${field.key}".`,
        'errors.validationFailed',
      );
    }
    seen.add(field.key);
    fields.push(field);
  }

  return { version: FORM_TEMPLATE_SCHEMA_VERSION, fields };
}

export function templateRequiresAcknowledgement(schema: FormTemplateSchema): boolean {
  return schema.fields.some((field) => field.type === 'signature');
}

export function emptyAnswersForSchema(schema: FormTemplateSchema): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const field of schema.fields) {
    switch (field.type) {
      case 'checklist': {
        const checked: Record<string, boolean> = {};
        for (const item of field.items ?? []) checked[item.key] = false;
        answers[field.key] = checked;
        break;
      }
      case 'yes_no':
        answers[field.key] = null;
        break;
      case 'photo':
        answers[field.key] = { documentIds: [] };
        break;
      case 'signature':
        answers[field.key] = { acknowledged: false };
        break;
      default:
        answers[field.key] = null;
    }
  }
  return answers;
}
