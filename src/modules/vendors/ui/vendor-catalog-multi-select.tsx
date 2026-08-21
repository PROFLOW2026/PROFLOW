'use client';

import { useTranslations } from 'next-intl';

interface CatalogOption {
  readonly id: string;
  readonly name: string;
}

interface VendorCatalogMultiSelectProps {
  categories: readonly CatalogOption[];
  specialties: readonly CatalogOption[];
  selectedCategoryIds?: readonly string[];
  selectedSpecialtyIds?: readonly string[];
}

/**
 * Checkbox multi-select for vendor categories & specialties.
 * Posts as repeated form fields: categoryIds / specialtyIds.
 */
export function VendorCatalogMultiSelect({
  categories,
  specialties,
  selectedCategoryIds = [],
  selectedSpecialtyIds = [],
}: VendorCatalogMultiSelectProps) {
  const t = useTranslations('vendors.catalog');

  return (
    <div className="flex flex-col gap-4">
      {categories.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-[var(--pf-text-primary)]">
            {t('categoriesLabel')}
          </legend>
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('categoriesHint')}</p>
          <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
            {categories.map((entry) => (
              <label
                key={entry.id}
                className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="categoryIds"
                  value={entry.id}
                  defaultChecked={selectedCategoryIds.includes(entry.id)}
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 truncate">{entry.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {specialties.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-[var(--pf-text-primary)]">
            {t('specialtiesLabel')}
          </legend>
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('specialtiesHint')}</p>
          <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
            {specialties.map((entry) => (
              <label
                key={entry.id}
                className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="specialtyIds"
                  value={entry.id}
                  defaultChecked={selectedSpecialtyIds.includes(entry.id)}
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 truncate">{entry.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
