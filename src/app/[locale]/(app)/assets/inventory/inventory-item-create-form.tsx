'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createInventoryItemAction, type AssetsFormState } from '../actions';

export function InventoryItemCreateForm() {
  const t = useTranslations('assets.inventory');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    createInventoryItemAction,
    {},
  );

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('nameLabel')} required error={state.fieldErrors?.name}>
        {(control) => <Input {...control} name="name" required autoFocus />}
      </Field>

      <Field label={t('skuLabel')}>
        {(control) => <Input {...control} name="sku" />}
      </Field>

      <Field label={t('unitLabel')}>
        {(control) => <Input {...control} name="unit" defaultValue="ea" />}
      </Field>

      <Field label={t('quantityLabel')}>
        {(control) => (
          <Input {...control} name="quantityOnHand" inputMode="decimal" defaultValue="0" />
        )}
      </Field>

      <Field label={t('notesLabel')}>
        {(control) => <Textarea {...control} name="notes" rows={2} />}
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? tCommon('states.saving') : t('submitItem')}
      </Button>
    </form>
  );
}
