'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { LOCALES, LOCALE_METADATA } from '@/shared/i18n/config';
import type { ContractorFormState } from '../application/action-support';
import { PasswordRules, PasswordViolationList } from './password-rules';

type FormAction = (state: ContractorFormState, formData: FormData) => Promise<ContractorFormState>;

const selectClassName =
  'min-h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm';

export function ContractorProfileForm({
  action,
  initial,
}: {
  action: FormAction;
  initial: { displayName: string; phone: string; locale: string };
}) {
  const t = useTranslations('contractorAccess.account.profile');
  const [state, formAction, pending] = useActionState<ContractorFormState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t('title')}</h2>
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field id="account-display-name" label={t('displayName')} required>
        {(control) => <Input {...control} name="displayName" defaultValue={initial.displayName} maxLength={120} required />}
      </Field>
      <Field id="account-phone" label={t('phone')}>
        {(control) => <Input {...control} name="phone" type="tel" dir="ltr" defaultValue={initial.phone} maxLength={40} />}
      </Field>
      <Field id="account-locale" label={t('language')} required>
        {(control) => (
          <select {...control} name="locale" defaultValue={initial.locale} className={selectClassName}>
            {LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {LOCALE_METADATA[locale].label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        {t('save')}
      </Button>
    </form>
  );
}

export function ContractorPasswordForm({ action, username }: { action: FormAction; username: string }) {
  const t = useTranslations('contractorAccess.account.password');
  const [state, formAction, pending] = useActionState<ContractorFormState, FormData>(action, {});
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t('title')}</h2>
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      {state.error ? (
        <Alert tone="danger">
          {state.error}
          <PasswordViolationList violations={state.passwordViolations} />
        </Alert>
      ) : null}
      <Field id="account-current-password" label={t('current')} required>
        {(control) => <PasswordInput {...control} name="currentPassword" autoComplete="current-password" required />}
      </Field>
      <Field id="account-new-password" label={t('next')} required>
        {(control) => (
          <PasswordInput
            {...control}
            name="newPassword"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            required
          />
        )}
      </Field>
      <Field id="account-confirm-password" label={t('confirmation')} required>
        {(control) => (
          <PasswordInput
            {...control}
            name="confirmation"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
        )}
      </Field>
      <PasswordRules password={next} confirmation={confirmation} username={username} />
      <Button type="submit" loading={pending} className="self-start">
        {t('submit')}
      </Button>
    </form>
  );
}
