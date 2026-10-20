'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
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
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <MainAppFormGrid dense>
        <Field label={t('assetLabel')} className={mainAppFieldSpan.lg}>
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
          <Field label={t('nameLabel')} required error={state.fieldErrors?.name} className={mainAppFieldSpan.lg}>
            {(control) => <Input {...control} name="name" required />}
          </Field>
        ) : null}

        <Field label={t('plateNumberLabel')} className={mainAppFieldSpan.md}>
          {(control) => <Input {...control} name="plateNumber" dir="ltr" />}
        </Field>
        <Field label={t('vinLabel')} className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="vin" dir="ltr" />}
        </Field>
        <Field label={t('odometerLabel')} className={mainAppFieldSpan.md}>
          {(control) => <Input {...control} name="odometer" inputMode="decimal" numeric />}
        </Field>
        <Field label={t('notesLabel')} className={mainAppFieldSpan.full}>
          {(control) => <Textarea {...control} name="notes" rows={2} />}
        </Field>
      </MainAppFormGrid>

      <Button type="submit" className="self-start" loading={pending}>
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
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      <input type="hidden" name="fleetVehicleId" value={fleetVehicleId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{tCommon('states.saved')}</Alert> : null}
      <MainAppFormGrid dense>
        <Field label={t('plateNumberLabel')} className={mainAppFieldSpan.md}>
          {(control) => (
            <Input {...control} name="plateNumber" defaultValue={plateNumber ?? ''} dir="ltr" />
          )}
        </Field>
        <Field label={t('vinLabel')} className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="vin" defaultValue={vin ?? ''} dir="ltr" />}
        </Field>
        <Field label={t('odometerLabel')} className={mainAppFieldSpan.md}>
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
        <Field label={t('notesLabel')} className={mainAppFieldSpan.full}>
          {(control) => <Input {...control} name="notes" defaultValue={notes ?? ''} />}
        </Field>
      </MainAppFormGrid>
      <Button type="submit" size="sm" loading={pending} className="self-start">
        {pending ? tCommon('states.saving') : t('updateSubmit')}
      </Button>
    </form>
  );
}
