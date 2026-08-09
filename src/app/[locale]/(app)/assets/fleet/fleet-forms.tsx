'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createFleetVehicleAction,
  updateFleetVehicleAction,
  type AssetsFormState,
} from '../actions';

export function FleetVehicleCreateForm({
  linkableAssets,
}: {
  linkableAssets: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('assets.fleet');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    createFleetVehicleAction,
    {},
  );
  const [assetId, setAssetId] = useState('__none__');

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('assetLabel')}>
        {(control) => (
          <>
            <input type="hidden" name="assetId" value={assetId} />
            <Select value={assetId} onValueChange={setAssetId}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('assetNone')}</SelectItem>
                {linkableAssets.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      {assetId === '__none__' ? (
        <Field label={t('nameLabel')} required error={state.fieldErrors?.name}>
          {(control) => <Input {...control} name="name" required />}
        </Field>
      ) : null}

      <Field label={t('plateNumberLabel')}>
        {(control) => <Input {...control} name="plateNumber" dir="ltr" />}
      </Field>
      <Field label={t('vinLabel')}>
        {(control) => <Input {...control} name="vin" dir="ltr" />}
      </Field>
      <Field label={t('odometerLabel')}>
        {(control) => <Input {...control} name="odometer" inputMode="decimal" numeric />}
      </Field>
      <Field label={t('notesLabel')}>
        {(control) => <Textarea {...control} name="notes" rows={2} />}
      </Field>

      <Button type="submit" className="h-11 w-full sm:w-auto" loading={pending}>
        {pending ? tCommon('states.saving') : t('submit')}
      </Button>
    </form>
  );
}

export function FleetVehicleEditForm({
  fleetVehicleId,
  plateNumber,
  vin,
  odometer,
  notes,
}: {
  fleetVehicleId: string;
  plateNumber: string | null;
  vin: string | null;
  odometer: string | null;
  notes: string | null;
}) {
  const t = useTranslations('assets.fleet');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    updateFleetVehicleAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="fleetVehicleId" value={fleetVehicleId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{tCommon('states.saved')}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={t('plateNumberLabel')}>
          {(control) => (
            <Input {...control} name="plateNumber" defaultValue={plateNumber ?? ''} dir="ltr" />
          )}
        </Field>
        <Field label={t('vinLabel')}>
          {(control) => <Input {...control} name="vin" defaultValue={vin ?? ''} dir="ltr" />}
        </Field>
        <Field label={t('odometerLabel')}>
          {(control) => (
            <Input
              {...control}
              name="odometer"
              defaultValue={odometer ?? ''}
              inputMode="decimal"
              numeric
            />
          )}
        </Field>
      </div>
      <Field label={t('notesLabel')}>
        {(control) => <Input {...control} name="notes" defaultValue={notes ?? ''} />}
      </Field>
      <Button type="submit" size="sm" loading={pending} className="min-h-11 self-start md:min-h-8">
        {pending ? tCommon('states.saving') : t('updateSubmit')}
      </Button>
    </form>
  );
}
