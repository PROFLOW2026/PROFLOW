import { displayCostCategoryKey } from '@/modules/expenses/domain/cost-category-display';
import {
  looksLikeEnglishDisplayName,
  looksLikeInternalCode,
} from '@/shared/i18n/code-display';

export type ActualAtomDisplayInput = {
  readonly sourceKind?: string | null;
  readonly sourceId?: string | null;
  readonly label?: string | null;
  readonly vendorName?: string | null;
  readonly categoryKey?: string | null;
};

export type ActualAtomDisplayCopy = {
  readonly employees: string;
  readonly monthClose: string;
  readonly unnamed: string;
  readonly translateCostCategory: (key: string) => string;
};

export function displayActualAtomLabel(
  atom: ActualAtomDisplayInput,
  copy: ActualAtomDisplayCopy,
): string {
  const raw = atom.label?.trim() ?? '';
  if (raw && !looksLikeInternalCode(raw) && !looksLikeEnglishDisplayName(raw)) {
    return raw;
  }

  const vendor = atom.vendorName?.trim();
  if (vendor && !looksLikeInternalCode(vendor) && !looksLikeEnglishDisplayName(vendor)) {
    return vendor;
  }

  if (atom.sourceKind === 'labor') return copy.employees;
  if (atom.sourceKind === 'month_close') return copy.monthClose;

  const fromCategory = displayCostCategoryKey(atom.categoryKey, copy.translateCostCategory);
  if (fromCategory) return fromCategory;

  if (raw) {
    const mappedLabel = displayCostCategoryKey(raw, copy.translateCostCategory);
    if (mappedLabel) return mappedLabel;
  }

  return copy.unnamed;
}
