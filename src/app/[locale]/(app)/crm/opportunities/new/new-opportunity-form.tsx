'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createOpportunityAction, type CrmFormState } from '../../actions';

export function NewOpportunityForm({
  prospects,
  leads,
  defaultCurrency,
  defaultLeadId,
}: {
  prospects: readonly { id: string; name: string }[];
  leads: readonly { id: string; title: string }[];
  defaultCurrency: string;
  defaultLeadId?: string;
}) {
  const t = useTranslations('crm.opportunity');
  const tFollowUp = useTranslations('crm.followUp');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    createOpportunityAction,
    {},
  );

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={t('nameLabel')} required>
        {(control) => <Input {...control} name="name" required autoFocus />}
      </Field>
      {prospects.length > 0 ? (
        <Field label={t('prospectLabel')} optionalLabel={tCommon('labels.optional')}>
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
        <Field label={t('leadLabel')} optionalLabel={tCommon('labels.optional')}>
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
      <Field label={t('expectedValueLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="expectedValueAmount" inputMode="decimal" numeric />}
      </Field>
      <Field label={t('currencyLabel')} optionalLabel={tCommon('labels.optional')}>
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
      <Field label={t('expectedStartLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="expectedStartDate" type="date" />}
      </Field>
      <Field label={t('referralLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="referralSource" />}
      </Field>
      <Field label={t('notesLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Textarea {...control} name="notes" rows={3} />}
      </Field>
      <Field label={tFollowUp('nextActionLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="nextActionText" />}
      </Field>
      <Field label={tFollowUp('nextActionAtLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="nextActionAt" type="datetime-local" dir="ltr" />}
      </Field>
      <Button type="submit" loading={pending} block>
        {t('submit')}
      </Button>
    </form>
  );
}
