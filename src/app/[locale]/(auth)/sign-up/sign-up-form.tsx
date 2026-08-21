'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import {
  MIN_PASSWORD_LENGTH,
  isPasswordLongEnough,
  passwordsMatch,
} from '@/shared/auth/password-policy';
import { signUpAction, type AuthFormState } from '../actions';

export function SignUpForm() {
  const t = useTranslations('auth.signUp');
  const tValidation = useTranslations('validation');
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signUpAction, {});
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

  if (state.notice === 'check-email') {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">{t('checkEmailTitle')}</h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t('checkEmailBody', { email: state.email ?? '' })}
        </p>
        <Link href="/sign-in" className={cn(textNavLinkClassName, 'text-sm font-medium')}>
          {t('signInInstead')}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field id="sign-up-display-name" label={t('displayName')} required>
        {(control) => <Input {...control} name="displayName" autoComplete="name" required />}
      </Field>

      <Field id="sign-up-email" label={t('email')} required>
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            defaultValue={state.email}
            required
          />
        )}
      </Field>

      <Field
        id="sign-up-password"
        label={t('password')}
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
        id="sign-up-confirm-password"
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

      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t('haveAccount')}{' '}
        <Link href="/sign-in" className={cn(textNavLinkClassName, 'font-medium')}>
          {t('signInInstead')}
        </Link>
      </p>
    </form>
  );
}
