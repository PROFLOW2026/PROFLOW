'use client';

import { useActionState, useState } from 'react';
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
import { ASSET_STATUSES, type AssetStatus } from '@/modules/assets/domain/types';
import { updateAssetAction, type AssetsFormState } from '../actions';

export function AssetAssignmentForm({
  assetId,
  assignedProjectId,
  projects,
}: {
  assetId: string;
  assignedProjectId: string | null;
  projects: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('assets.detail');
  const tCommon = useTranslations('common');
  const [projectId, setProjectId] = useState(assignedProjectId ?? '__none__');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    updateAssetAction,
    {},
  );

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-3">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="assignedProjectId" value={projectId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{tCommon('states.saved')}</Alert> : null}
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('assignmentHint')}</p>
      <Field label={t('assignedProject')}>
        {(control) => (
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('unassigned')}</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Button type="submit" loading={pending} size="sm">
        {pending ? tCommon('states.saving') : t('saveAssignment')}
      </Button>
    </form>
  );
}

export function AssetStatusForm({
  assetId,
  currentStatus,
}: {
  assetId: string;
  currentStatus: AssetStatus;
}) {
  const t = useTranslations('assets.detail');
  const tStatus = useTranslations('status.asset');
  const tCommon = useTranslations('common');
  const [status, setStatus] = useState(currentStatus);
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    updateAssetAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="status" value={status} />
      {state.error ? (
        <span role="alert" className="w-full text-sm text-[var(--pf-status-danger-fg)]">
          {state.error}
        </span>
      ) : null}
      <Select value={status} onValueChange={(v) => setStatus(v as AssetStatus)}>
        <SelectTrigger className="min-h-11 w-full sm:w-[12rem] md:h-9 md:min-h-9" aria-label={t('statusLabel')}>
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
      <Button type="submit" size="sm" variant="secondary" disabled={pending || status === currentStatus} className="min-h-11 md:min-h-8">
        {pending ? tCommon('states.saving') : t('saveStatus')}
      </Button>
    </form>
  );
}

export function AssetAcquisitionForm({
  assetId,
  acquisitionAmount,
  acquisitionCurrency,
  acquiredOn,
  sourceExpenseId,
  sourceApBillId,
  defaultCurrency,
}: {
  assetId: string;
  acquisitionAmount: string | null;
  acquisitionCurrency: string | null;
  acquiredOn: string | null;
  sourceExpenseId: string | null;
  sourceApBillId: string | null;
  defaultCurrency: string;
}) {
  const t = useTranslations('assets.detail');
  const tCreate = useTranslations('assets.createAsset');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    updateAssetAction,
    {},
  );

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-3">
      <input type="hidden" name="assetId" value={assetId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{tCommon('states.saved')}</Alert> : null}
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('acquisitionHint')}</p>
      <Field label={tCreate('acquisitionAmountLabel')} error={state.fieldErrors?.acquisitionAmount}>
        {(control) => (
          <Input
            {...control}
            name="acquisitionAmount"
            defaultValue={acquisitionAmount ?? ''}
            inputMode="decimal"
            numeric
            dir="ltr"
          />
        )}
      </Field>
      <Field
        label={tCreate('acquisitionCurrencyLabel')}
        error={state.fieldErrors?.acquisitionCurrency}
      >
        {(control) => (
          <Input
            {...control}
            name="acquisitionCurrency"
            defaultValue={acquisitionCurrency ?? defaultCurrency}
            maxLength={3}
            dir="ltr"
            className="uppercase"
          />
        )}
      </Field>
      <Field label={tCreate('acquiredOnLabel')} error={state.fieldErrors?.acquiredOn}>
        {(control) => (
          <Input
            {...control}
            name="acquiredOn"
            type="date"
            defaultValue={acquiredOn ?? ''}
            dir="ltr"
          />
        )}
      </Field>
      <Field label={tCreate('sourceExpenseIdLabel')} error={state.fieldErrors?.sourceExpenseId}>
        {(control) => (
          <Input
            {...control}
            name="sourceExpenseId"
            defaultValue={sourceExpenseId ?? ''}
            dir="ltr"
            placeholder="UUID"
          />
        )}
      </Field>
      <Field label={tCreate('sourceApBillIdLabel')} error={state.fieldErrors?.sourceApBillId}>
        {(control) => (
          <Input
            {...control}
            name="sourceApBillId"
            defaultValue={sourceApBillId ?? ''}
            dir="ltr"
            placeholder="UUID"
          />
        )}
      </Field>
      <Button type="submit" loading={pending} size="sm">
        {pending ? tCommon('states.saving') : t('saveAcquisition')}
      </Button>
    </form>
  );
}
