'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { VendorOption } from '@/modules/expenses/domain/types';

export interface VendorSelectorProps {
  readonly vendors: readonly VendorOption[];
  readonly vendorId: string;
  readonly supplierName: string;
  readonly onVendorIdChange: (vendorId: string) => void;
  readonly onSupplierNameChange: (name: string) => void;
  readonly disabled?: boolean;
  readonly onVendorSelected?: (vendor: VendorOption | null) => void;
}

export function VendorSelector({
  vendors,
  vendorId,
  supplierName,
  onVendorIdChange,
  onSupplierNameChange,
  disabled = false,
  onVendorSelected,
}: VendorSelectorProps) {
  const t = useTranslations('expenses');
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);

  const selectedVendor = vendorId ? vendors.find((v) => v.id === vendorId) ?? null : null;

  React.useEffect(() => {
    if (selectedVendor && !supplierName.trim()) {
      onSupplierNameChange(selectedVendor.name);
    }
  }, [selectedVendor, supplierName, onSupplierNameChange]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vendors.slice(0, 20);
    return vendors.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 20);
  }, [query, vendors]);

  function selectVendor(id: string) {
    const vendor = vendors.find((v) => v.id === id) ?? null;
    onVendorIdChange(id);
    if (vendor) onSupplierNameChange(vendor.name);
    onVendorSelected?.(vendor);
    setOpen(false);
    setQuery(vendor?.name ?? '');
  }

  function clearVendor() {
    onVendorIdChange('');
    onVendorSelected?.(null);
    setQuery('');
  }

  const displayValue = selectedVendor?.name ?? supplierName;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Field label={t('fields.supplier')} optionalLabel={t('vendor.optional')}>
        {(controlProps) => (
          <div className="relative min-w-0">
            <Input
              {...controlProps}
              value={open ? query : displayValue}
              onChange={(event) => {
                const next = event.target.value;
                setQuery(next);
                onSupplierNameChange(next);
                if (vendorId) onVendorIdChange('');
                setOpen(true);
              }}
              onFocus={() => {
                setQuery(displayValue);
                setOpen(true);
              }}
              onBlur={() => {
                window.setTimeout(() => setOpen(false), 150);
              }}
              disabled={disabled}
              placeholder={t('placeholders.supplierSearch')}
              autoComplete="off"
            />
            {open && filtered.length > 0 ? (
              <ul
                role="listbox"
                className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] py-1 shadow-md"
              >
                <li>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-start text-sm hover:bg-[var(--pf-bg-muted)]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={clearVendor}
                  >
                    {t('vendor.noVendor')}
                  </button>
                </li>
                {filtered.map((vendor) => (
                  <li key={vendor.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-start text-sm hover:bg-[var(--pf-bg-muted)]"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectVendor(vendor.id)}
                    >
                      {vendor.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </Field>
      <input type="hidden" name="supplierName" value={supplierName} />
      <input type="hidden" name="vendorId" value={vendorId} />
      {selectedVendor ? (
        <p className="text-xs text-[var(--pf-text-muted)]">{t('vendor.linkedHint', { name: selectedVendor.name })}</p>
      ) : null}
    </div>
  );
}
