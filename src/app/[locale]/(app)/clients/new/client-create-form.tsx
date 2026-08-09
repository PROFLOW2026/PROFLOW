'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createClientAction, type ClientFormState } from '../actions';

export function ClientCreateForm() {
  const t = useTranslations('clients');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(
    createClientAction,
    {},
  );
  const [showMore, setShowMore] = useState(false);

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('create.nameLabel')} required error={state.fieldErrors?.name}>
        {(control) => (
          <Input
            {...control}
            name="name"
            placeholder={t('create.namePlaceholder')}
            autoFocus
            required
          />
        )}
      </Field>

      <Button type="button" variant="ghost" className="self-start" onClick={() => setShowMore((open) => !open)}>
        {t('create.moreDetails')}
      </Button>

      {showMore ? (
        <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] pt-4">
          <Field label={t('create.legalNameLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="legalName" />}
          </Field>
          <Field label={t('create.emailLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="email" type="email" dir="ltr" />}
          </Field>
          <Field label={t('create.phoneLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="phone" type="tel" dir="ltr" />}
          </Field>
          <Field label={t('create.websiteLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="website" type="url" dir="ltr" />}
          </Field>
          <Field label={t('create.addressLine1Label')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="addressLine1" />}
          </Field>
          <Field label={t('create.cityLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="city" />}
          </Field>
          <Field label={t('create.notesLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Textarea {...control} name="notes" rows={2} />}
          </Field>
        </div>
      ) : null}

      <Button type="submit" loading={pending} block>
        {t('create.submit')}
      </Button>
    </form>
  );
}
