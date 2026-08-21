'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InventoryMovementForm } from './inventory-movement-form';

/**
 * List-page transfer / adjust without opening item detail.
 * Quantity-only — never GL / expense.
 */
export function InventoryTransferAdjustPanel({
  items,
  locations,
  defaultDate,
  canManage,
}: {
  items: readonly { id: string; name: string }[];
  locations: readonly { id: string; name: string; code: string | null }[];
  defaultDate: string;
  canManage: boolean;
}) {
  const t = useTranslations('assets.inventory');
  const [itemId, setItemId] = useState(items[0]?.id ?? '');

  if (!canManage || items.length === 0) return null;

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <div>
        <h2 className="text-lg font-semibold">{t('opsTitle')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('opsHint')}</p>
      </div>

      <Field label={t('nameLabel')} required>
        {(control) => (
          <Select value={itemId} onValueChange={setItemId}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {itemId ? (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <InventoryMovementForm
            inventoryItemId={itemId}
            movementType="transfer"
            defaultDate={defaultDate}
            locations={locations}
            defaultLocationId={locations[0]?.id}
          />
          <InventoryMovementForm
            inventoryItemId={itemId}
            movementType="adjust"
            defaultDate={defaultDate}
            locations={locations}
            defaultLocationId={locations[0]?.id}
          />
        </div>
      ) : null}
    </section>
  );
}
