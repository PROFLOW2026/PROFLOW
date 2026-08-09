'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { recordInventoryMovementAction, type AssetsFormState } from '../actions';

export function InventoryMovementForm({
  inventoryItemId,
  movementType,
  defaultDate,
}: {
  inventoryItemId: string;
  movementType: 'receive' | 'issue';
  defaultDate: string;
}) {
  const t = useTranslations('assets.inventory');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    recordInventoryMovementAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
      <input type="hidden" name="movementType" value={movementType} />
      <Field label={t('movementQuantity')} className="w-24">
        {(control) => (
          <Input {...control} name="quantity" inputMode="decimal" required defaultValue="1" />
        )}
      </Field>
      <Field label={t('occurredOn')} className="w-40">
        {(control) => (
          <Input {...control} type="date" name="occurredOn" required defaultValue={defaultDate} />
        )}
      </Field>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? t('pending') : movementType === 'receive' ? t('receive') : t('issue')}
      </Button>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
    </form>
  );
}
