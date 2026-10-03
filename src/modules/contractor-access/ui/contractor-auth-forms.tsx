'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import type { ContractorFormState } from '../application/action-support';
import { PasswordRules, PasswordViolationList } from './password-rules';

type FormAction = (state: ContractorFormState, formData: FormData) => Promise<ContractorFormState>;

export function ContractorSignInForm({
  action,
  next,
  notice,
}: {
  action: FormAction;
  next?: string;
  notice?: string | null;
}) {
  const t = useTranslations('contractorAccess.auth.signIn');
  const [state, formAction, pending] = useActionState<ContractorFormState, FormData>(action, {});
  const [username, setUsername] = useState(state.values?.username ?? '');
  const [password, setPassword] = useState('');

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>
      {notice ? <Alert tone="warning">{notice}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field id="contractor-username" label={t('username')} required>
        {(control) => (
          <Input
            {...control}
            name="username"
            dir="ltr"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        )}
      </Field>
      <Field id="contractor-password" label={t('password')} required>
        {(control) => (
          <PasswordInput
            {...control}
            name="password"
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
      <Link href="/contractor/forgot-password" className={`${textNavLinkClassName} text-sm`}>
        {t('forgot')}
      </Link>
    </form>
  );
}

export function ContractorSetPasswordForm({
  action,
  token,
  username,
  mode,
}: {
  action: FormAction;
  token: string;
  username: string;
  mode: 'activate' | 'reset';
}) {
  const t = useTranslations(mode === 'activate' ? 'contractorAccess.auth.activate' : 'contractorAccess.auth.reset');
  const [state, formAction, pending] = useActionState<ContractorFormState, FormData>(action, {});
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>
      {state.error ? (
        <Alert tone="danger">
          {state.error}
          <PasswordViolationList violations={state.passwordViolations} />
        </Alert>
      ) : null}
      <input type="hidden" name="token" value={token} />

      <div className="rounded-md bg-[var(--pf-bg-subtle)] p-3 text-sm">
        <span className="text-[var(--pf-text-secondary)]">{t('usernameLabel')}</span>{' '}
        <bdi dir="ltr" className="font-mono font-semibold">
          {username}
        </bdi>
      </div>

      <Field id="contractor-new-password" label={t('password')} required>
        {(control) => (
          <PasswordInput
            {...control}
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        )}
      </Field>
      <Field id="contractor-confirm-password" label={t('confirmation')} required>
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
      <PasswordRules password={password} confirmation={confirmation} username={username} />
      <Button type="submit" loading={pending} block>
        {t('submit')}
      </Button>
    </form>
  );
}

export function ContractorForgotPasswordForm({ action }: { action: FormAction }) {
  const t = useTranslations('contractorAccess.auth.forgot');
  const [state, formAction, pending] = useActionState<ContractorFormState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field id="contractor-forgot-username" label={t('username')} required>
        {(control) => (
          <Input {...control} name="username" dir="ltr" autoComplete="username" autoCapitalize="none" required />
        )}
      </Field>
      <Button type="submit" loading={pending} block>
        {t('submit')}
      </Button>
      <Link href="/contractor/sign-in" className={`${textNavLinkClassName} text-sm`}>
        {t('backToSignIn')}
      </Link>
    </form>
  );
}

/** Shown on activate / reset pages when the link cannot be used. */
export function ContractorLinkProblem({ message }: { message: string }) {
  const t = useTranslations('contractorAccess.auth');
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="warning">{message}</Alert>
      <Link href="/contractor/sign-in" className={`${textNavLinkClassName} text-sm`}>
        {t('forgot.backToSignIn')}
      </Link>
    </div>
  );
}
