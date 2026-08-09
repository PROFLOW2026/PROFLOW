'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Link } from '@/shared/i18n/navigation';
import { signUpAction, type AuthFormState } from '../actions';

export function SignUpForm() {
  const t = useTranslations('auth.signUp');
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signUpAction, {});

  if (state.notice === 'check-email') {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">{t('checkEmailTitle')}</h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t('checkEmailBody', { email: state.email ?? '' })}
        </p>
        <Link href="/sign-in" className="text-sm font-medium text-[var(--pf-text-brand)] hover:underline">
          {t('signInInstead')}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('displayName')} required>
        {(control) => <Input {...control} name="displayName" autoComplete="name" required />}
      </Field>

      <Field label={t('email')} required>
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

      <Field label={t('password')} required description={t('passwordHint')}>
        {(control) => (
          <Input {...control} name="password" type="password" autoComplete="new-password" minLength={10} required />
        )}
      </Field>

      <Button type="submit" loading={pending} block>
        {t('submit')}
      </Button>

      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t('haveAccount')}{' '}
        <Link href="/sign-in" className="font-medium text-[var(--pf-text-brand)] hover:underline">
          {t('signInInstead')}
        </Link>
      </p>
    </form>
  );
}
