'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Link } from '@/shared/i18n/navigation';
import { signInAction, type AuthFormState } from '../actions';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export function SignInForm({ next }: { next?: string }) {
  const t = useTranslations('auth.signIn');
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signInAction, {});
  // Controlled fields survive SSR→client remounts and Playwright fills (defaultValue did not).
  const [email, setEmail] = useState(state.email ?? '');
  const [password, setPassword] = useState('');

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field id="sign-in-email" label={t('email')} required>
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        )}
      </Field>

      <Field id="sign-in-password" label={t('password')} required>
        {(control) => (
          <Input
            {...control}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        )}
      </Field>

      <Button type="submit" loading={pending} block>
        {t('submit')}
      </Button>

      <div className="flex flex-col gap-2 text-sm">
        <Link href="/forgot-password" className={textNavLinkClassName}>
          {t('forgotPassword')}
        </Link>
        <p className="text-[var(--pf-text-secondary)]">
          {t('noAccount')}{' '}
          <Link href="/sign-up" className={cn(textNavLinkClassName, 'font-medium')}>
            {t('createAccount')}
          </Link>
        </p>
      </div>
    </form>
  );
}
