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
import { ASSET_KINDS, type AssetKind } from '@/modules/assets';
import { createAssetAction, type AssetsFormState } from '../actions';

export function AssetCreateForm() {
  const t = useTranslations('assets.createAsset');
  const tKinds = useTranslations('assets.kinds');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    createAssetAction,
    {},
  );
  const [kind, setKind] = useState<AssetKind>('equipment');

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('nameLabel')} required error={state.fieldErrors?.name}>
        {(control) => <Input {...control} name="name" required autoFocus />}
      </Field>

      <Field label={t('kindLabel')}>
        {(control) => (
          <>
            <input type="hidden" name="assetKind" value={kind} />
            <Select value={kind} onValueChange={(v) => setKind(v as AssetKind)}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {tKinds(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('identifierLabel')}>
        {(control) => <Input {...control} name="identifier" />}
      </Field>

      <Field label={t('manufacturerLabel')}>
        {(control) => <Input {...control} name="manufacturer" />}
      </Field>

      <Field label={t('modelLabel')}>
        {(control) => <Input {...control} name="model" />}
      </Field>

      <Field label={t('serialNumberLabel')}>
        {(control) => <Input {...control} name="serialNumber" />}
      </Field>

      <Field label={t('notesLabel')}>
        {(control) => <Textarea {...control} name="notes" rows={3} />}
      </Field>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
        <legend className="px-1 text-sm font-medium">{t('fleetTitle')}</legend>
        <Field label={t('plateNumberLabel')}>
          {(control) => <Input {...control} name="plateNumber" />}
        </Field>
        <Field label={t('vinLabel')}>
          {(control) => <Input {...control} name="vin" />}
        </Field>
        <Field label={t('odometerLabel')}>
          {(control) => <Input {...control} name="odometer" inputMode="decimal" />}
        </Field>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? tCommon('states.saving') : t('submit')}
      </Button>
    </form>
  );
}
