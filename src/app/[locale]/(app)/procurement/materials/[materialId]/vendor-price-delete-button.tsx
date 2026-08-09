'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  deleteMaterialVendorPriceAction,
  type ProcurementFormState,
} from '../../actions';

export function VendorPriceDeleteButton({
  id,
  materialItemId,
}: {
  id: string;
  materialItemId: string;
}) {
  const t = useTranslations('procurement.vendorPrice');
  const [state, formAction, pending] = useActionState<ProcurementFormState, FormData>(
    deleteMaterialVendorPriceAction,
    {},
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="materialItemId" value={materialItemId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? t('deleting') : t('delete')}
      </Button>
      {state.error ? <p className="mt-1 text-xs text-[var(--pf-status-danger-fg)]">{state.error}</p> : null}
    </form>
  );
}
