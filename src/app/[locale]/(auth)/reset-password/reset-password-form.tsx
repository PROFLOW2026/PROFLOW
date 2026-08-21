'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import {
  MIN_PASSWORD_LENGTH,
  isPasswordLongEnough,
  passwordsMatch,
} from '@/shared/auth/password-policy';
import { updatePasswordAction, type AuthFormState } from '../actions';

export function ResetPasswordForm() {
  const t = useTranslations('auth.resetPassword');
  const tValidation = useTranslations('validation');
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    updatePasswordAction,
    {},
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState({ password: false, confirm: false });

  const passwordError = useMemo(() => {
    if (!touched.password || !password) return null;
    if (!isPasswordLongEnough(password)) return tValidation('passwordTooWeak');
    return null;
  }, [password, touched.password, tValidation]);

  const confirmError = useMemo(() => {
    if (!touched.confirm || !confirmPassword) return null;
    if (!passwordsMatch(password, confirmPassword)) return tValidation('passwordsDoNotMatch');
    return null;
  }, [confirmPassword, password, touched.confirm, tValidation]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <h1 className="text-xl font-semibold">{t('title')}</h1>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field
        id="reset-password"
        label={t('newPassword')}
        required
        description={t('passwordHint')}
        error={passwordError}
      >
        {(control) => (
          <PasswordInput
            {...control}
            name="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onBlur={() => setTouched((current) => ({ ...current, password: true }))}
          />
        )}
      </Field>

      <Field
        id="reset-confirm-password"
        label={t('confirmPassword')}
        required
        error={confirmError}
      >
        {(control) => (
          <PasswordInput
            {...control}
            name="confirmPassword"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            onBlur={() => setTouched((current) => ({ ...current, confirm: true }))}
          />
        )}
      </Field>

      <Button type="submit" loading={pending} block>
        {t('submit')}
      </Button>
    </form>
  );
}
