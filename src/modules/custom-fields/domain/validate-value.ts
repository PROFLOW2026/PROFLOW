/**
 * Type-aware custom field value validation (doc 35).
 * Never replaces canonical financial / status fields — those are blocked by reserved keys.
 */

import { DomainRuleError } from '@/shared/errors';
import type { CustomFieldDefinitionRecord, CustomFieldType } from './types';

export interface CustomFieldValuePayload {
  readonly valueText?: string | null;
  readonly valueNumber?: string | null;
  readonly valueBool?: boolean | null;
  readonly valueDate?: string | null;
  readonly valueJson?: unknown;
}

export function parseSelectOptions(config: Record<string, unknown>): string[] {
  const raw = config.options;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

export function assertSelectOptionsConfig(
  fieldType: CustomFieldType,
  config: Record<string, unknown>,
): void {
  if (fieldType !== 'select' && fieldType !== 'multi_select') return;
  const options = parseSelectOptions(config);
  if (options.length === 0) {
    throw new DomainRuleError(
      'Select fields require at least one option',
      'errors.validationFailed',
    );
  }
}

function isEmptyPayload(payload: CustomFieldValuePayload): boolean {
  const hasText = payload.valueText != null && payload.valueText.trim() !== '';
  const hasNumber = payload.valueNumber != null && payload.valueNumber.trim() !== '';
  const hasDate = payload.valueDate != null && payload.valueDate.trim() !== '';
  const hasBool = payload.valueBool != null;
  const json = payload.valueJson;
  const hasJson =
    json != null &&
    !(Array.isArray(json) && json.length === 0) &&
    !(typeof json === 'object' && !Array.isArray(json) && Object.keys(json).length === 0);
  return !hasText && !hasNumber && !hasDate && !hasBool && !hasJson;
}

function assertOptionAllowed(options: string[], value: string): void {
  if (!options.includes(value)) {
    throw new DomainRuleError(
      `Value is not in the allowed options: ${value}`,
      'errors.validationFailed',
      { value },
    );
  }
}

/**
 * Validates a value against its definition (type, required, select options).
 * Tenant isolation is enforced separately via definition.org + entityExistsInOrganization.
 */
export function assertCustomFieldValueValid(
  definition: Pick<CustomFieldDefinitionRecord, 'fieldType' | 'required' | 'config' | 'label'>,
  payload: CustomFieldValuePayload,
): void {
  if (definition.required && isEmptyPayload(payload)) {
    throw new DomainRuleError(
      `Required custom field is empty: ${definition.label}`,
      'errors.validationFailed',
      { label: definition.label },
    );
  }

  if (isEmptyPayload(payload) && !definition.required) {
    return;
  }

  const options = parseSelectOptions(definition.config);

  switch (definition.fieldType) {
    case 'text':
    case 'select': {
      const text = payload.valueText?.trim() ?? '';
      if (!text && definition.required) {
        throw new DomainRuleError('Text value required', 'errors.validationFailed');
      }
      if (definition.fieldType === 'select' && text) {
        assertOptionAllowed(options, text);
      }
      return;
    }
    case 'number':
    case 'money': {
      const number = payload.valueNumber?.trim() ?? '';
      if (!number) {
        if (definition.required) {
          throw new DomainRuleError('Number value required', 'errors.validationFailed');
        }
        return;
      }
      if (!/^-?\d+(\.\d+)?$/.test(number)) {
        throw new DomainRuleError('Invalid number', 'errors.validationFailed');
      }
      return;
    }
    case 'date': {
      const date = payload.valueDate?.trim() ?? '';
      if (!date) {
        if (definition.required) {
          throw new DomainRuleError('Date value required', 'errors.validationFailed');
        }
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new DomainRuleError('Invalid date', 'errors.validationFailed');
      }
      return;
    }
    case 'boolean': {
      if (payload.valueBool === null || payload.valueBool === undefined) {
        if (definition.required) {
          throw new DomainRuleError('Boolean value required', 'errors.validationFailed');
        }
      }
      return;
    }
    case 'multi_select': {
      const values = Array.isArray(payload.valueJson)
        ? payload.valueJson.filter((item): item is string => typeof item === 'string')
        : [];
      if (values.length === 0 && definition.required) {
        throw new DomainRuleError('Multi-select value required', 'errors.validationFailed');
      }
      for (const value of values) {
        assertOptionAllowed(options, value.trim());
      }
      return;
    }
    case 'reference': {
      const refs = Array.isArray(payload.valueJson)
        ? payload.valueJson.filter((item): item is string => typeof item === 'string')
        : payload.valueText
          ? [payload.valueText]
          : [];
      if (refs.length === 0 && definition.required) {
        throw new DomainRuleError('Reference value required', 'errors.validationFailed');
      }
      return;
    }
    default: {
      const _exhaustive: never = definition.fieldType;
      return _exhaustive;
    }
  }
}
