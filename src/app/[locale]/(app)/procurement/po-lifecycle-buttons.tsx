'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  cancelPurchaseOrderAction,
  closePurchaseOrderAction,
  type ProcurementFormState,
} from './actions';

export function CancelPurchaseOrderButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const t = useTranslations('procurement');
  const [state, action, pending] = useActionState<ProcurementFormState, FormData>(
    cancelPurchaseOrderAction,
    {},
  );

  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t('cancel.pending') : t('cancel.action')}
      </Button>
      {state.error ? <p className="text-xs text-[var(--pf-status-danger-fg)]">{state.error}</p> : null}
    </form>
  );
}

export function ClosePurchaseOrderButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const t = useTranslations('procurement');
  const [state, action, pending] = useActionState<ProcurementFormState, FormData>(
    closePurchaseOrderAction,
    {},
  );

  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t('close.pending') : t('close.action')}
      </Button>
      {state.error ? <p className="text-xs text-[var(--pf-status-danger-fg)]">{state.error}</p> : null}
    </form>
  );
}
