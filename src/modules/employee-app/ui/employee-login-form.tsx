'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  employeeLoginAction,
  type EmployeeAuthFormState,
} from '@/app/[locale]/employee/actions';

export function EmployeeLoginForm({ organizationId }: { organizationId: string }) {
  const t = useTranslations('employeeApp.login');
  const [state, formAction, pending] = useActionState(employeeLoginAction, {} as EmployeeAuthFormState);
  const hasOrg = organizationId.trim().length > 0;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        {!hasOrg ? (
          <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t('companyHint')}</p>
        ) : null}
      </div>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <input type="hidden" name="organizationId" value={organizationId} />
      {!hasOrg ? (
        <div className="space-y-2">
          <Label htmlFor="companyName">{t('companyName')}</Label>
          <Input id="companyName" name="companyName" autoComplete="organization" className="text-lg" />
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('companyNameHelp')}</p>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="username">{t('username')}</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          required
          dir="ltr"
          className="text-lg"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pin">{t('pin')}</Label>
        <Input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="current-password"
          required
          dir="ltr"
          className="text-lg tracking-widest"
        />
      </div>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {t('submit')}
      </Button>
    </form>
  );
}
