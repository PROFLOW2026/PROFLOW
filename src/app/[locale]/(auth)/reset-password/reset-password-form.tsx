'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { updatePasswordAction, type AuthFormState } from '../actions';

export function ResetPasswordForm() {
  const t = useTranslations('auth.resetPassword');
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    updatePasswordAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('title')}</h1>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('newPassword')} required>
        {(control) => (
          <Input {...control} name="password" type="password" autoComplete="new-password" minLength={10} required />
        )}
      </Field>

      <Field label={t('confirmPassword')} required>
        {(control) => (
          <Input {...control} name="confirmPassword" type="password" autoComplete="new-password" required />
        )}
      </Field>

      <Button type="submit" loading={pending} block>
        {t('submit')}
      </Button>
    </form>
  );
}
