'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { restoreApBillAction, type ApFormState } from '../actions';

export function RestoreApBillPanel({
  billId,
  canManage,
  billStatus,
}: {
  billId: string;
  canManage: boolean;
  billStatus: string;
}) {
  const t = useTranslations('ap.restore');
  const [state, action, pending] = useActionState<ApFormState, FormData>(restoreApBillAction, {});

  if (!canManage || billStatus !== 'void') return null;

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('note')}</p>
      <form action={action}>
        <input type="hidden" name="apBillId" value={billId} />
        <Button type="submit" variant="secondary" loading={pending} size="lg" block className="sm:w-auto">
          {t('action')}
        </Button>
      </form>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('success')}</Alert> : null}
    </section>
  );
}
