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
  defaultCurrency,
}: {
  prospects: readonly { id: string; name: string }[];
  defaultCurrency: string;
}) {
  const t = useTranslations('crm.opportunity');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    createOpportunityAction,
    {},
  );

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
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
              className="h-11 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3"
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
      <Field label={t('expectedValueLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="expectedValueAmount" inputMode="decimal" />}
      </Field>
      <Field label={t('currencyLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="currency" defaultValue={defaultCurrency} maxLength={3} />
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
      <Button type="submit" disabled={pending}>
        {t('submit')}
      </Button>
    </form>
  );
}
