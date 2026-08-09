'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createLeadAction, type CrmFormState } from '../../actions';

export function NewLeadForm() {
  const t = useTranslations('crm.lead');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(createLeadAction, {});

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={t('titleLabel')} required>
        {(control) => <Input {...control} name="title" required autoFocus />}
      </Field>
      <Field label={t('sourceLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="source" />}
      </Field>
      <Field label={t('emailLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="email" type="email" />}
      </Field>
      <Field label={t('phoneLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="phone" type="tel" />}
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
