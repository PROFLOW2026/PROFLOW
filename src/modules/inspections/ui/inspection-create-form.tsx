'use client';



import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { Textarea } from '@/components/ui/textarea';

import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { cn } from '@/shared/ui/cn';
import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';

import type { InspectionFormData } from '../application/query-inspections';

import type { InspectionTemplateOption } from '../domain/types';

import { createInspectionAction } from './actions';

import { AgreementSelect, LocationSelect, PersonSelect, WorkLineSelect } from '@/modules/defects/ui/form-controls';

import { INITIAL_QUALITY_FORM_STATE } from '@/modules/defects/ui/form-state';



export function InspectionCreateForm({

  projectId,

  formData,

  templates,

  cancelHref,
  returnBase,

}: {

  readonly projectId: string;

  readonly formData: InspectionFormData;

  readonly templates: readonly InspectionTemplateOption[];

  readonly cancelHref: string;
  /** List route to open after create. Defaults to the Owner app path. */
  readonly returnBase?: string;

}) {

  const t = useTranslations('inspections');

  const [state, formAction, pending] = useActionState(createInspectionAction.bind(null, projectId), INITIAL_QUALITY_FORM_STATE);



  return (

    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-[var(--pf-border-subtle)] p-4">
      {returnBase ? <input type="hidden" name="returnBase" value={returnBase} /> : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <MainAppFormGrid dense>

      <label className={cn('flex flex-col gap-1 text-sm', mainAppFieldSpan.lg)}>

        {t('fields.template')}

        <select name="templateRef" className="mt-1 w-full rounded-md border px-3 py-2 text-sm">

          <option value="">{t('fields.noTemplate')}</option>

          {templates.map((template) => (

            <option key={template.ref} value={template.ref}>

              {template.name} ({t('templates.itemCount', { count: template.itemCount })})

            </option>

          ))}

        </select>

      </label>

      <label className={cn('flex flex-col gap-1 text-sm', mainAppFieldSpan.lg)}>

        {t('fields.title')}

        <Input name="title" required maxLength={300} className="mt-1" />

      </label>

      <label className={cn('flex flex-col gap-1 text-sm', mainAppFieldSpan.lg)}>

        {t('fields.scheduledFor')}

        <Input name="scheduledFor" type="date" className="mt-1" />

      </label>

      <label className={cn('flex flex-col gap-1 text-sm', mainAppFieldSpan.lg)}>

        {t('fields.location')}

        <LocationSelect name="locationId" options={formData.locations} allowEmpty emptyLabel={t('fields.noLocation')} />

      </label>

      <label className={cn('flex flex-col gap-1 text-sm', mainAppFieldSpan.lg)}>

        {t('fields.contractor')}

        <AgreementSelect

          name="agreementId"

          options={formData.agreements}

          allowEmpty

          emptyLabel={t('fields.noContractor')}

        />

      </label>

      <label className={cn('flex flex-col gap-1 text-sm', mainAppFieldSpan.lg)}>

        {t('fields.workLine')}

        <WorkLineSelect

          name="workLineId"

          options={formData.workLines}

          allowEmpty

          emptyLabel={t('fields.noWorkLine')}

        />

      </label>

      <label className={cn('flex flex-col gap-1 text-sm', mainAppFieldSpan.lg)}>

        {t('fields.inspector')}

        <PersonSelect name="inspectorUserId" people={formData.people} allowEmpty emptyLabel={t('fields.noAssignee')} />

      </label>

      <label className={cn('flex flex-col gap-1 text-sm', mainAppFieldSpan.full)}>

        {t('fields.extraItems')}

        <Textarea name="extraItems" rows={3} className="mt-1" placeholder={t('fields.extraItemsHint')} />

      </label>

      <label className={cn('flex items-center gap-2 text-sm', mainAppFieldSpan.full)}>

        <input type="checkbox" name="contractorVisible" defaultChecked className="size-4" />

        {t('fields.contractorVisible')}

      </label>

      </MainAppFormGrid>

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


