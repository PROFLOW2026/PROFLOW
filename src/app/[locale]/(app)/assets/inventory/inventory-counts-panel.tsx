'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { InventoryCountLineRecord, InventoryCountRecord, InventoryCountStatus } from '@/modules/assets';
import {
  createInventoryCountAction,
  finalizeInventoryCountAction,
  upsertInventoryCountLineAction,
  voidInventoryCountAction,
  type AssetsFormState,
} from '../actions';
import { LocationSelect } from './inventory-locations-panel';

function countTone(status: InventoryCountStatus): 'neutral' | 'success' | 'warning' {
  if (status === 'finalized') return 'success';
  if (status === 'void') return 'neutral';
  return 'warning';
}

export function InventoryCountsPanel({
  locations,
  items,
  counts,
  linesByCount,
  canManage,
  defaultDate,
}: {
  locations: readonly { id: string; name: string; code: string | null }[];
  items: readonly { id: string; name: string }[];
  counts: readonly InventoryCountRecord[];
  linesByCount: ReadonlyMap<string, readonly InventoryCountLineRecord[]>;
  canManage: boolean;
  defaultDate: string;
}) {
  const t = useTranslations('assets.inventory');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    createInventoryCountAction,
    {},
  );
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <div>
        <h2 className="text-lg font-semibold">{t('countsTitle')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('countsHint')}</p>
      </div>

      {canManage && locations.length > 0 ? (
        <form action={formAction} className="grid min-w-0 gap-3 sm:grid-cols-[1fr_10rem_auto]">
          {state.error ? (
            <Alert tone="danger" className="sm:col-span-3">
              {state.error}
            </Alert>
          ) : null}
          <Field label={t('locationLabel')} required>
            {(control) => (
              <LocationSelect
                id={control.id}
                name="locationId"
                locations={locations}
                value={locationId}
                onValueChange={setLocationId}
                placeholder={t('locationLabel')}
              />
            )}
          </Field>
          <Field label={t('countDate')} required>
            {(control) => (
              <Input
                {...control}
                type="date"
                name="countedOn"
                required
                defaultValue={defaultDate}
                dir="ltr"
              />
            )}
          </Field>
          <div className="flex items-end">
            <Button type="submit" size="sm" loading={pending} className="min-h-11 md:min-h-8">
              {pending ? tCommon('states.saving') : t('createCount')}
            </Button>
          </div>
        </form>
      ) : null}

      <p className="text-xs text-[var(--pf-text-secondary)]">{t('countNotActual')}</p>

      {counts.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('countsEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {counts.map((count) => (
            <CountCard
              key={count.id}
              count={count}
              lines={linesByCount.get(count.id) ?? []}
              items={items}
              locationName={
                locations.find((location) => location.id === count.locationId)?.name ?? count.locationId
              }
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CountCard({
  count,
  lines,
  items,
  locationName,
  canManage,
}: {
  count: InventoryCountRecord;
  lines: readonly InventoryCountLineRecord[];
  items: readonly { id: string; name: string }[];
  locationName: string;
  canManage: boolean;
}) {
  const t = useTranslations('assets.inventory');
  const itemNames = new Map(items.map((item) => [item.id, item.name] as const));
  const isDraft = count.status === 'draft';

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{locationName}</p>
          <p className="text-xs text-[var(--pf-text-secondary)]" dir="ltr">
            {count.countedOn}
          </p>
        </div>
        <Badge tone={countTone(count.status)}>{t(`countStatus.${count.status}`)}</Badge>
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('countLinesEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{itemNames.get(line.inventoryItemId) ?? line.inventoryItemId}</span>
              <span dir="ltr">
                {line.countedQuantity} / {line.expectedQuantity}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canManage && isDraft ? (
        <>
          <CountLineForm countId={count.id} items={items} />
          <div className="flex flex-wrap gap-2">
            <CountStatusForm countId={count.id} action={finalizeInventoryCountAction} label={t('finalizeCount')} />
            <CountStatusForm countId={count.id} action={voidInventoryCountAction} label={t('voidCount')} ghost />
          </div>
        </>
      ) : null}
    </div>
  );
}

function CountLineForm({
  countId,
  items,
}: {
  countId: string;
  items: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('assets.inventory');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    upsertInventoryCountLineAction,
    {},
  );
  const [itemId, setItemId] = useState(items[0]?.id ?? '');

  if (items.length === 0) return null;

  return (
    <form action={formAction} className="grid min-w-0 gap-2 sm:grid-cols-[1fr_7rem_auto]">
      <input type="hidden" name="countId" value={countId} />
      {state.error ? <Alert tone="danger" className="sm:col-span-3">{state.error}</Alert> : null}
      <Field label={t('nameLabel')} required>
        {(control) => (
          <>
            <input type="hidden" name="inventoryItemId" value={itemId} />
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
          </>
        )}
      </Field>
      <Field label={t('countedQuantity')} required>
        {(control) => (
          <Input {...control} name="countedQuantity" inputMode="decimal" numeric required defaultValue="0" />
        )}
      </Field>
      <div className="flex items-end">
        <Button type="submit" size="sm" variant="secondary" loading={pending} className="min-h-11 md:min-h-8">
          {pending ? tCommon('states.saving') : t('addCountLine')}
        </Button>
      </div>
    </form>
  );
}

function CountStatusForm({
  countId,
  action,
  label,
  ghost = false,
}: {
  countId: string;
  action: (prev: AssetsFormState, formData: FormData) => Promise<AssetsFormState>;
  label: string;
  ghost?: boolean;
}) {
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(action, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="countId" value={countId} />
      <Button
        type="submit"
        size="sm"
        variant={ghost ? 'ghost' : 'secondary'}
        loading={pending}
        className="min-h-11 md:min-h-8"
      >
        {label}
      </Button>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
    </form>
  );
}
