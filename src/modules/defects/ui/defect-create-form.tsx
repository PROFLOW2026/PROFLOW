'use client';



import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { Textarea } from '@/components/ui/textarea';

import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';

import type { QualityFormData } from '../application/query-defects';

import { DEFECT_MODES, DEFECT_SEVERITIES } from '../domain/lifecycle';

import { createDefectAction } from './actions';

import { AgreementSelect, LocationSelect, PersonSelect, WorkLineSelect } from './form-controls';

import { INITIAL_QUALITY_FORM_STATE } from './form-state';



export function DefectCreateForm({

  projectId,

  formData,

  cancelHref,
  returnBase,

}: {

  readonly projectId: string;

  readonly formData: QualityFormData;

  readonly cancelHref: string;
  /** List route to open after create. Defaults to the Owner app path. */
  readonly returnBase?: string;

}) {

  const t = useTranslations('defects');

  const [state, formAction, pending] = useActionState(createDefectAction.bind(null, projectId), INITIAL_QUALITY_FORM_STATE);



  return (

    <form action={formAction} className="flex max-w-xl flex-col gap-4 rounded-lg border border-[var(--pf-border-subtle)] p-4">
      {returnBase ? <input type="hidden" name="returnBase" value={returnBase} /> : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <label className="text-sm">

        {t('fields.title')}

        <Input name="title" required maxLength={300} className="mt-1" />

      </label>

      <label className="text-sm">

        {t('fields.description')}

        <Textarea name="description" rows={3} maxLength={5000} className="mt-1" />

      </label>

      <label className="text-sm">

        {t('fields.severity')}

        <select name="severity" defaultValue="medium" className="mt-1 w-full rounded-md border px-3 py-2 text-sm">

          {DEFECT_SEVERITIES.map((severity) => (

            <option key={severity} value={severity}>

              {t(`severity.${severity}`)}

            </option>

          ))}

        </select>

      </label>

      <label className="text-sm">

        {t('fields.dueDate')}

        <Input name="dueDate" type="date" className="mt-1" />

      </label>

      <label className="text-sm">

        {t('fields.location')}

        <LocationSelect name="locationId" options={formData.locations} allowEmpty emptyLabel={t('fields.noLocation')} />

      </label>

      <label className="text-sm">

        {t('fields.contractor')}

        <AgreementSelect

          name="agreementId"

          options={formData.agreements}

          allowEmpty

          emptyLabel={t('fields.noContractor')}

        />

      </label>

      <label className="text-sm">

        {t('fields.workLine')}

        <WorkLineSelect

          name="workLineId"

          options={formData.workLines}

          allowEmpty

          emptyLabel={t('fields.noWorkLine')}

        />

      </label>

      <label className="text-sm">

        {t('fields.inspector')}

        <PersonSelect name="inspectorUserId" people={formData.people} allowEmpty emptyLabel={t('fields.noAssignee')} />

      </label>

      <label className="text-sm">

        {t('fields.mode')}

        <select name="mode" defaultValue="construction" className="mt-1 w-full rounded-md border px-3 py-2 text-sm">

          {DEFECT_MODES.map((mode) => (

            <option key={mode} value={mode}>

              {t(`mode.${mode}`)}

            </option>

          ))}

        </select>

      </label>

      <label className="flex items-center gap-2 text-sm">

        <input type="checkbox" name="contractorVisible" defaultChecked className="size-4" />

        {t('fields.contractorVisible')}

      </label>

      <div className="flex flex-wrap gap-2">

        <Button type="submit" variant="primary" disabled={pending}>

          {t('create.submit')}

        </Button>

        <Button type="button" variant="secondary" asChild>

          <Link href={cancelHref}>{t('filters.clear')}</Link>

        </Button>

      </div>

    </form>

  );

}


