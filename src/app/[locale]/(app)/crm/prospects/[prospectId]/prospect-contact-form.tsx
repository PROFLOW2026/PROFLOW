'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { createProspectContactAction, type CrmFormState } from '../../actions';

export function ProspectContactForm({ prospectId }: { prospectId: string }) {
  const t = useTranslations('crm.prospect');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    createProspectContactAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="prospectId" value={prospectId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={t('contactName')} required>
        {(control) => <Input {...control} name="name" required />}
      </Field>
      <Field label={t('emailLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="email" type="email" />}
      </Field>
      <Field label={t('phoneLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="phone" type="tel" />}
      </Field>
      <Field label={t('contactRole')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="role" />}
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        {t('addContact')}
      </Button>
    </form>
  );
}
