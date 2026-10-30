'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useState, type FormEvent } from 'react';
import { MainAppFormActions, MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CONTACT_ROLES } from '@/modules/clients/domain/types';
import { createClientAction, type ClientFormState } from '../actions';

const CLIENT_NAME_MAX = 200;
const CONTACT_NAME_MAX = 120;

function showValidationBanner(state: ClientFormState): boolean {
  if (!state.error) return false;
  const messages = Object.values(state.fieldErrors ?? {});
  if (messages.length > 0 && messages.every((message) => message === state.error)) return false;
  return true;
}

export function ClientCreateForm() {
  const t = useTranslations('clients');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(
    createClientAction,
    {},
  );
  const [showMore, setShowMore] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const contactNameRequired = contactPhone.trim() !== '' || contactEmail.trim() !== '';
  const contactPhoneRequired = contactName.trim() !== '' || contactEmail.trim() !== '';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full min-w-0 flex-col gap-4">
      {showValidationBanner(state) ? <Alert tone="danger">{state.error}</Alert> : null}

      <p className="text-sm text-[var(--pf-text-secondary)]">{t('create.walkInHint')}</p>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-medium text-[var(--pf-text-primary)]">
          {t('create.companySection')}
        </legend>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('create.companySectionHint')}</p>

        <MainAppFormGrid dense>
          <Field
            label={t('create.nameLabel')}
            required
            error={state.fieldErrors?.name}
            className={mainAppFieldSpan.lg}
          >
            {(control) => (
              <Input
                {...control}
                name="name"
                placeholder={t('create.namePlaceholder')}
                autoFocus
                required
                maxLength={CLIENT_NAME_MAX}
                autoComplete="organization"
              />
            )}
          </Field>
        </MainAppFormGrid>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] pt-4">
        <legend className="text-sm font-medium text-[var(--pf-text-primary)]">
          {t('create.contactSection')}
        </legend>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('create.contactSectionHint')}</p>

        <MainAppFormGrid dense>
          <Field
            label={t('create.contactNameLabel')}
            required={contactNameRequired}
            optionalLabel={contactNameRequired ? undefined : tCommon('labels.optional')}
            error={state.fieldErrors?.primaryContactName}
            className={mainAppFieldSpan.lg}
          >
            {(control) => (
              <Input
                {...control}
                name="primaryContactName"
                placeholder={t('create.contactNamePlaceholder')}
                autoComplete="name"
                maxLength={CONTACT_NAME_MAX}
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
              />
            )}
          </Field>

          <Field
            label={t('create.contactPhoneLabel')}
            required={contactPhoneRequired}
            optionalLabel={contactPhoneRequired ? undefined : tCommon('labels.optional')}
            error={state.fieldErrors?.primaryContactPhone}
            className={mainAppFieldSpan.lg}
          >
            {(control) => (
              <Input
                {...control}
                name="primaryContactPhone"
                type="tel"
                dir="ltr"
                autoComplete="tel"
                placeholder={t('create.contactPhonePlaceholder')}
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
              />
            )}
          </Field>

          <Field
            label={t('create.contactEmailLabel')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.primaryContactEmail}
            className={mainAppFieldSpan.lg}
          >
            {(control) => (
              <Input
                {...control}
                name="primaryContactEmail"
                type="email"
                dir="ltr"
                autoComplete="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
              />
            )}
          </Field>

          <Field
            label={t('create.contactRoleLabel')}
            optionalLabel={tCommon('labels.optional')}
            className={mainAppFieldSpan.lg}
          >
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
        </MainAppFormGrid>
      </fieldset>

      <Button type="button" variant="ghost" className="self-start" onClick={() => setShowMore((open) => !open)}>
        {t('create.moreDetails')}
      </Button>

      {showMore ? (
        <div className="border-t border-[var(--pf-border-default)] pt-4">
          <MainAppFormGrid dense>
            <Field
              label={t('create.legalNameLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => <Input {...control} name="legalName" />}
            </Field>
            <Field
              label={t('create.companyEmailLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => <Input {...control} name="email" type="email" dir="ltr" />}
            </Field>
            <Field
              label={t('create.companyPhoneLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => (
                <Input {...control} name="phone" type="tel" dir="ltr" autoComplete="organization-tel" />
              )}
            </Field>
            <Field
              label={t('create.websiteLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => <Input {...control} name="website" type="url" dir="ltr" />}
            </Field>
            <Field
              label={t('create.addressLine1Label')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => <Input {...control} name="addressLine1" />}
            </Field>
            <Field
              label={t('create.cityLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => <Input {...control} name="city" />}
            </Field>
            <Field
              label={t('create.notesLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.full}
            >
              {(control) => <Textarea {...control} name="notes" rows={2} />}
            </Field>
          </MainAppFormGrid>
        </div>
      ) : null}

      <MainAppFormActions
        cancelHref="/clients"
        cancelLabel={tCommon('actions.cancel')}
        submitLabel={t('create.submit')}
        submitLoading={pending}
        sticky
      />
    </form>
  );
}
