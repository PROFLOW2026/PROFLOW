'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CONTACT_ROLES } from '@/modules/clients/domain/types';
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

      <p className="text-sm text-[var(--pf-text-secondary)]">{t('create.walkInHint')}</p>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-medium text-[var(--pf-text-primary)]">
          {t('create.companySection')}
        </legend>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('create.companySectionHint')}</p>

        <Field label={t('create.nameLabel')} required error={state.fieldErrors?.name}>
          {(control) => (
            <Input
              {...control}
              name="name"
              placeholder={t('create.namePlaceholder')}
              autoFocus
              required
              autoComplete="organization"
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] pt-4">
        <legend className="text-sm font-medium text-[var(--pf-text-primary)]">
          {t('create.contactSection')}
        </legend>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('create.contactSectionHint')}</p>

        <Field
          label={t('create.contactNameLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.primaryContactName}
        >
          {(control) => (
            <Input
              {...control}
              name="primaryContactName"
              placeholder={t('create.contactNamePlaceholder')}
              autoComplete="name"
            />
          )}
        </Field>

        <Field
          label={t('create.contactPhoneLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.primaryContactPhone}
        >
          {(control) => (
            <Input
              {...control}
              name="primaryContactPhone"
              type="tel"
              dir="ltr"
              autoComplete="tel"
              placeholder={t('create.contactPhonePlaceholder')}
            />
          )}
        </Field>

        <Field
          label={t('create.contactEmailLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.primaryContactEmail}
        >
          {(control) => (
            <Input {...control} name="primaryContactEmail" type="email" dir="ltr" autoComplete="email" />
          )}
        </Field>

        <Field label={t('create.contactRoleLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Select name="primaryContactRole" defaultValue="primary">
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(`detail.contactRoles.${role}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </fieldset>

      <Button type="button" variant="ghost" className="self-start" onClick={() => setShowMore((open) => !open)}>
        {t('create.moreDetails')}
      </Button>

      {showMore ? (
        <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] pt-4">
          <Field label={t('create.legalNameLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="legalName" />}
          </Field>
          <Field label={t('create.companyEmailLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="email" type="email" dir="ltr" />}
          </Field>
          <Field label={t('create.companyPhoneLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="phone" type="tel" dir="ltr" autoComplete="organization-tel" />}
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
