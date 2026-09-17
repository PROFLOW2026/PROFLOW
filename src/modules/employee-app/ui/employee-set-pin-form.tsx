'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  employeeSetPinAction,
  type EmployeeAuthFormState,
} from '@/app/[locale]/employee/actions';

export function EmployeeSetPinForm() {
  const t = useTranslations('employeeApp.setPin');
  const [state, formAction, pending] = useActionState(employeeSetPinAction, {} as EmployeeAuthFormState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
      </div>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="space-y-2">
        <Label htmlFor="newPin">{t('newPin')}</Label>
        <Input
          id="newPin"
          name="newPin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          className="text-lg tracking-widest"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPin">{t('confirmPin')}</Label>
        <Input
          id="confirmPin"
          name="confirmPin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          className="text-lg tracking-widest"
        />
      </div>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {t('submit')}
      </Button>
    </form>
  );
}
