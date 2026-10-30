'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { MainAppFormActions, MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CrmFormState } from '@/app/[locale]/(app)/crm/actions';

type CreateOpportunityAction = (
  prev: CrmFormState,
  formData: FormData,
) => Promise<CrmFormState>;

export function CrmNewOpportunityForm({
  prospects,
  leads,
  defaultCurrency,
  defaultLeadId,
  createOpportunityAction,
  cancelHref,
}: {
  prospects: readonly { id: string; name: string }[];
  leads: readonly { id: string; title: string }[];
  defaultCurrency: string;
  defaultLeadId?: string;
  createOpportunityAction: CreateOpportunityAction;
  cancelHref: string;
}) {
  const t = useTranslations('crm.opportunity');
  const tFollowUp = useTranslations('crm.followUp');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    createOpportunityAction,
    {},
  );

  return (
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <MainAppFormGrid dense>
        <Field label={t('nameLabel')} required className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="name" required autoFocus />}
        </Field>
        {prospects.length > 0 ? (
          <Field
            label={t('prospectLabel')}
            optionalLabel={tCommon('labels.optional')}
            className={mainAppFieldSpan.lg}
          >
            {(control) => (
              <select
                {...control}
                name="prospectId"
                className="h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-start"
              >
                <option value="">—</option>
                {prospects.map((prospect) => (
                  <option key={prospect.id} value={prospect.id}>
                    {prospect.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        {leads.length > 0 ? (
          <Field
            label={t('leadLabel')}
            optionalLabel={tCommon('labels.optional')}
            className={mainAppFieldSpan.lg}
          >
            {(control) => (
              <select
                {...control}
                name="leadId"
                defaultValue={defaultLeadId ?? ''}
                className="h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-start"
              >
                <option value="">—</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <Field
          label={t('expectedValueLabel')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.lg}
        >
          {(control) => <Input {...control} name="expectedValueAmount" inputMode="decimal" numeric />}
        </Field>
        <Field
          label={t('currencyLabel')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.md}
        >
          {(control) => (
            <Input
              {...control}
              name="currency"
              defaultValue={defaultCurrency}
              maxLength={3}
              dir="ltr"
            />
          )}
        </Field>
        <Field
          label={t('expectedStartLabel')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.lg}
        >
          {(control) => <Input {...control} name="expectedStartDate" type="date" />}
        </Field>
        <Field
          label={t('referralLabel')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.lg}
        >
          {(control) => <Input {...control} name="referralSource" />}
        </Field>
        <Field
          label={t('notesLabel')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.full}
        >
          {(control) => <Textarea {...control} name="notes" rows={3} />}
        </Field>
        <Field
          label={tFollowUp('nextActionLabel')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.lg}
        >
          {(control) => <Input {...control} name="nextActionText" />}
        </Field>
        <Field
          label={tFollowUp('nextActionAtLabel')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.lg}
        >
          {(control) => <Input {...control} name="nextActionAt" type="datetime-local" dir="ltr" />}
        </Field>
      </MainAppFormGrid>
      <MainAppFormActions
        cancelHref={cancelHref}
        cancelLabel={tCommon('actions.cancel')}
        submitLabel={t('submit')}
        submitLoading={pending}
        sticky
      />
    </form>
  );
}
