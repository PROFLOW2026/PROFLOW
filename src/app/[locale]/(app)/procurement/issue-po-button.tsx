'use client';

import { useEffect, useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/shared/i18n/navigation';
import { issuePurchaseOrderAction, type ProcurementFormState } from './actions';

export function IssuePurchaseOrderButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const t = useTranslations('procurement.issue');
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ProcurementFormState, FormData>(
    issuePurchaseOrderAction,
    {},
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <Button type="submit" size="sm" variant="secondary" loading={pending} title={t('hint')}>
        {pending ? t('pending') : t('action')}
      </Button>
      {state.error ? (
        <span className="text-xs text-[var(--pf-status-danger-fg)]">{state.error}</span>
      ) : null}
    </form>
  );
}
