'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { textNavLinkClassName } from '@/components/ui/pressable';
import {
  employeeLoginAction,
  type EmployeeAuthFormState,
} from '@/app/[locale]/employee/actions';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export function EmployeeLoginForm({ defaultUsername = '' }: { defaultUsername?: string }) {
  const t = useTranslations('employeeApp.login');
  const [state, formAction, pending] = useActionState(employeeLoginAction, {} as EmployeeAuthFormState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t('hint')}</p>
      </div>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="space-y-2">
        <Label htmlFor="username">{t('username')}</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          required
          dir="ltr"
          defaultValue={defaultUsername}
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
      <p className="text-center text-sm text-[var(--pf-text-secondary)]">
        <Link href="/sign-in" className={cn(textNavLinkClassName, 'font-medium')}>
          {t('backToCustomerLogin')}
        </Link>
      </p>
    </form>
  );
}
