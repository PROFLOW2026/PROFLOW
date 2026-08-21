'use client';

import { useTranslations } from 'next-intl';

export type DailyLogLinkOption = { id: string; name: string; hint?: string };

export function DailyLogRelationshipFields({
  vendors,
  employees,
  assets,
  selectedVendorIds = [],
  selectedEmployeeIds = [],
  selectedAssetIds = [],
}: {
  vendors: readonly DailyLogLinkOption[];
  employees: readonly DailyLogLinkOption[];
  assets: readonly DailyLogLinkOption[];
  selectedVendorIds?: readonly string[];
  selectedEmployeeIds?: readonly string[];
  selectedAssetIds?: readonly string[];
}) {
  const t = useTranslations('fieldOps.createLog');

  if (vendors.length === 0 && employees.length === 0 && assets.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="syncSiteLinks" value="1" />
      {vendors.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t('vendorsOnSite')}</legend>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('vendorsOnSiteHint')}</p>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-[var(--pf-border-default)] p-3">
            {vendors.map((vendor) => (
              <label key={vendor.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="vendorIds"
                  value={vendor.id}
                  defaultChecked={selectedVendorIds.includes(vendor.id)}
                  className="mt-1"
                />
                <span>
                  {vendor.name}
                  {vendor.hint ? (
                    <span className="ms-1 text-xs text-[var(--pf-text-muted)]">({vendor.hint})</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {employees.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t('employeesOnSite')}</legend>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('employeesOnSiteHint')}</p>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-[var(--pf-border-default)] p-3">
            {employees.map((employee) => (
              <label key={employee.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="employeeIds"
                  value={employee.id}
                  defaultChecked={selectedEmployeeIds.includes(employee.id)}
                  className="mt-1"
                />
                <span>{employee.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {assets.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t('assetsOnSite')}</legend>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('assetsOnSiteHint')}</p>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-[var(--pf-border-default)] p-3">
            {assets.map((asset) => (
              <label key={asset.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="assetIds"
                  value={asset.id}
                  defaultChecked={selectedAssetIds.includes(asset.id)}
                  className="mt-1"
                />
                <span>{asset.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
