import { DEFAULT_COST_CATEGORIES } from '@/modules/tenancy/domain/organization-defaults';
import {
  looksLikeEnglishDisplayName,
  looksLikeInternalCode,
} from '@/shared/i18n/code-display';

const SYSTEM_COST_CATEGORY_KEYS = new Set<string>([
  ...DEFAULT_COST_CATEGORIES.map((row) => row.key),
  'labor',
  'internal_employee_payroll',
]);

export type CostCategoryDisplayInput = {
  readonly key: string;
  readonly name: string;
  readonly isSystem?: boolean;
};

/**
 * Owner-facing cost-category label. System keys overlay the locale catalog;
 * stored English names / raw keys are never shown.
 */
export function displayCostCategoryName(
  category: CostCategoryDisplayInput,
  translate: (key: string) => string,
  fallback = 'קטגוריה',
): string {
  const overlayKey = `costCategories.${category.key}`;
  const known = SYSTEM_COST_CATEGORY_KEYS.has(category.key) || category.isSystem === true;
  if (known) {
    const translated = translate(overlayKey);
    if (translated && translated !== overlayKey) return translated;
  }

  const stored = category.name.trim();
  if (stored && !looksLikeInternalCode(stored) && !looksLikeEnglishDisplayName(stored)) {
    return stored;
  }

  const byKey = translate(overlayKey);
  if (byKey && byKey !== overlayKey) return byKey;
  return fallback;
}

export function displayCostCategoryKey(
  categoryKey: string | null | undefined,
  translate: (key: string) => string,
  fallback = 'קטגוריה',
): string | null {
  const key = categoryKey?.trim() ?? '';
  if (!key) return null;
  return displayCostCategoryName({ key, name: key, isSystem: true }, translate, fallback);
}
