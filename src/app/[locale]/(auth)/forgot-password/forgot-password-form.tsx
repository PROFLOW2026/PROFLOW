'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Link } from '@/shared/i18n/navigation';
import { requestPasswordResetAction, type AuthFormState } from '../actions';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgotPassword');
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordResetAction,
    {},
  );

  if (state.notice === 'sent') {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">{t('sentTitle')}</h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t('sentBody', { email: state.email ?? '' })}
        </p>
        <Link href="/sign-in" className={cn(textNavLinkClassName, 'text-sm font-medium')}>
          {t('backToSignIn')}
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

      <Field label="Email" required>
        {(control) => <Input {...control} name="email" type="email" dir="ltr" autoComplete="email" required />}
      </Field>

      <Button type="submit" loading={pending} block>
        {t('submit')}
      </Button>

      <Link href="/sign-in" className={cn(textNavLinkClassName, 'text-sm font-medium')}>
        {t('backToSignIn')}
      </Link>
    </form>
  );
}
