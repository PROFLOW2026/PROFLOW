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
import { ASSET_KINDS, ASSET_STATUSES, type AssetKind, type AssetStatus } from '@/modules/assets/domain/types';
import { createAssetAction, type AssetsFormState } from '../actions';

export function AssetCreateForm({
  projects,
  defaultCurrency,
}: {
  projects: readonly { id: string; name: string }[];
  defaultCurrency: string;
}) {
  const t = useTranslations('assets.createAsset');
  const tKinds = useTranslations('assets.kinds');
  const tStatus = useTranslations('status.asset');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    createAssetAction,
    {},
  );
  const [kind, setKind] = useState<AssetKind>('equipment');
  const [status, setStatus] = useState<AssetStatus>('active');
  const [projectId, setProjectId] = useState('__none__');

  return (
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <MainAppFormGrid dense>
        <Field label={t('nameLabel')} required error={state.fieldErrors?.name} className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="name" required autoFocus />}
        </Field>

        <Field label={t('kindLabel')} className={mainAppFieldSpan.md}>
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

        <Field label={t('statusLabel')} className={mainAppFieldSpan.md}>
          {(control) => (
            <>
              <input type="hidden" name="status" value={status} />
              <Select value={status} onValueChange={(v) => setStatus(v as AssetStatus)}>
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tStatus(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>

        <Field label={t('identifierLabel')} className={mainAppFieldSpan.md}>
          {(control) => <Input {...control} name="identifier" dir="ltr" />}
        </Field>

        <Field label={t('manufacturerLabel')}>
          {(control) => <Input {...control} name="manufacturer" />}
        </Field>

        <Field label={t('modelLabel')}>
          {(control) => <Input {...control} name="model" />}
        </Field>

        <Field label={t('serialNumberLabel')} className={mainAppFieldSpan.md}>
          {(control) => <Input {...control} name="serialNumber" dir="ltr" />}
        </Field>

        <Field label={t('assignedProjectLabel')} className={mainAppFieldSpan.lg}>
          {(control) => (
            <>
              <input type="hidden" name="assignedProjectId" value={projectId} />
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('assignedProjectNone')}</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>

        <Field label={t('notesLabel')} className={mainAppFieldSpan.full}>
          {(control) => <Textarea {...control} name="notes" rows={3} />}
        </Field>
      </MainAppFormGrid>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
        <legend className="px-1 text-sm font-medium">{t('acquisitionTitle')}</legend>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('acquisitionHint')}</p>
        <MainAppFormGrid dense>
          <Field
            label={t('acquisitionAmountLabel')}
            error={state.fieldErrors?.acquisitionAmount}
            className={mainAppFieldSpan.md}
          >
            {(control) => (
              <Input {...control} name="acquisitionAmount" inputMode="decimal" numeric dir="ltr" />
            )}
          </Field>
          <Field
            label={t('acquisitionCurrencyLabel')}
            error={state.fieldErrors?.acquisitionCurrency}
            className={mainAppFieldSpan.sm}
          >
            {(control) => (
              <Input
                {...control}
                name="acquisitionCurrency"
                placeholder={defaultCurrency}
                maxLength={3}
                dir="ltr"
                className="uppercase"
              />
            )}
          </Field>
          <Field label={t('acquiredOnLabel')} error={state.fieldErrors?.acquiredOn} className={mainAppFieldSpan.md}>
            {(control) => <Input {...control} name="acquiredOn" type="date" dir="ltr" />}
          </Field>
          <Field label={t('sourceExpenseIdLabel')} error={state.fieldErrors?.sourceExpenseId} className={mainAppFieldSpan.lg}>
            {(control) => <Input {...control} name="sourceExpenseId" dir="ltr" placeholder="UUID" />}
          </Field>
          <Field label={t('sourceApBillIdLabel')} error={state.fieldErrors?.sourceApBillId} className={mainAppFieldSpan.lg}>
            {(control) => <Input {...control} name="sourceApBillId" dir="ltr" placeholder="UUID" />}
          </Field>
        </MainAppFormGrid>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
        <legend className="px-1 text-sm font-medium">{t('fleetTitle')}</legend>
        <MainAppFormGrid dense>
          <Field label={t('plateNumberLabel')} className={mainAppFieldSpan.md}>
            {(control) => <Input {...control} name="plateNumber" dir="ltr" />}
          </Field>
          <Field label={t('vinLabel')} className={mainAppFieldSpan.lg}>
            {(control) => <Input {...control} name="vin" dir="ltr" />}
          </Field>
          <Field label={t('odometerLabel')} className={mainAppFieldSpan.md}>
            {(control) => <Input {...control} name="odometer" inputMode="decimal" numeric />}
          </Field>
        </MainAppFormGrid>
      </fieldset>

      <Button type="submit" className="self-start" loading={pending}>
        {pending ? tCommon('states.saving') : t('submit')}
      </Button>
    </form>
  );
}
