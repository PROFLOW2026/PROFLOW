'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  archiveInventoryLocationAction,
  createInventoryLocationAction,
  updateInventoryLocationAction,
  type AssetsFormState,
} from '../actions';

export function InventoryLocationsPanel({
  locations,
  canManage,
}: {
  locations: readonly { id: string; name: string; code: string | null }[];
  canManage: boolean;
}) {
  const t = useTranslations('assets.inventory');
  const tList = useTranslations('assets.list.columns');
  const tCommon = useTranslations('common');
  const [createState, createAction, createPending] = useActionState<AssetsFormState, FormData>(
    createInventoryLocationAction,
    {},
  );

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <div>
        <h2 className="text-lg font-semibold">{t('locationsTitle')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('locationsHint')}</p>
      </div>

      {canManage ? (
        <form action={createAction} className="grid min-w-0 gap-3 sm:grid-cols-[1fr_8rem_auto]">
          {createState.error ? (
            <Alert tone="danger" className="sm:col-span-3">
              {createState.error}
            </Alert>
          ) : null}
          <Field label={t('locationNameLabel')} required>
            {(control) => <Input {...control} name="name" required />}
          </Field>
          <Field label={t('locationCodeLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="code" />}
          </Field>
          <div className="flex items-end">
            <Button type="submit" size="sm" loading={createPending} className="min-h-11 md:min-h-8">
              {createPending ? tCommon('states.saving') : t('submitLocation')}
            </Button>
          </div>
        </form>
      ) : null}

      {locations.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('locationsEmpty')}</p>
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('locationNameLabel')}</TableHead>
                <TableHead>{t('locationCodeLabel')}</TableHead>
                {canManage ? <TableHead>{tList('actions')}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((location) => (
                <LocationRow key={location.id} location={location} canManage={canManage} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function LocationRow({
  location,
  canManage,
}: {
  location: { id: string; name: string; code: string | null };
  canManage: boolean;
}) {
  const t = useTranslations('assets.inventory');
  const [updateState, updateAction, updatePending] = useActionState<AssetsFormState, FormData>(
    updateInventoryLocationAction,
    {},
  );
  const [archiveState, archiveAction, archivePending] = useActionState<AssetsFormState, FormData>(
    archiveInventoryLocationAction,
    {},
  );

  if (!canManage) {
    return (
      <TableRow>
        <TableCell className="font-medium">{location.name}</TableCell>
        <TableCell>{location.code ?? '—'}</TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell colSpan={3}>
        <form action={updateAction} className="flex min-w-0 flex-wrap items-end gap-2">
          <input type="hidden" name="locationId" value={location.id} />
          <Field label={t('locationNameLabel')} className="min-w-40 flex-1">
            {(control) => <Input {...control} name="name" required defaultValue={location.name} />}
          </Field>
          <Field label={t('locationCodeLabel')} className="w-28">
            {(control) => <Input {...control} name="code" defaultValue={location.code ?? ''} />}
          </Field>
          <Button type="submit" size="sm" variant="secondary" loading={updatePending}>
            {t('saveLocation')}
          </Button>
          {updateState.error ? <Alert tone="danger">{updateState.error}</Alert> : null}
        </form>
        <form action={archiveAction} className="mt-2">
          <input type="hidden" name="locationId" value={location.id} />
          <Button type="submit" size="sm" variant="ghost" loading={archivePending}>
            {t('archiveLocation')}
          </Button>
          {archiveState.error ? <Alert tone="danger">{archiveState.error}</Alert> : null}
        </form>
      </TableCell>
    </TableRow>
  );
}

export function LocationSelect({
  id,
  name,
  locations,
  value,
  onValueChange,
  placeholder,
}: {
  id?: string;
  name: string;
  locations: readonly { id: string; name: string; code: string | null }[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select value={value || undefined} onValueChange={onValueChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {locations.map((location) => (
            <SelectItem key={location.id} value={location.id}>
              {location.name}
              {location.code ? ` (${location.code})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
