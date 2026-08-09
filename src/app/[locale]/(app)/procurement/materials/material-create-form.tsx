'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createMaterialItemAction, type ProcurementFormState } from '../actions';

export function MaterialCreateForm({ defaultCurrency }: { defaultCurrency: string }) {
  const t = useTranslations('procurement.material');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ProcurementFormState, FormData>(
    createMaterialItemAction,
    {},
  );
  const [defaultUnitPrice, setDefaultUnitPrice] = useState('');

  return (
    <form
      action={formAction}
      className="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4"
    >
      <h2 className="text-sm font-semibold">{t('createTitle')}</h2>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="currency" value={defaultCurrency} />
      <input type="hidden" name="defaultUnitPrice" value={defaultUnitPrice} />

      <Field label={t('nameLabel')} required error={state.fieldErrors?.name}>
        {(control) => <Input {...control} name="name" required autoFocus />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('skuLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Input {...control} name="sku" />}
        </Field>
        <Field label={t('unitLabel')}>
          {(control) => <Input {...control} name="unit" defaultValue="ea" />}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('manufacturerLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Input {...control} name="manufacturer" />}
        </Field>
        <Field label={t('modelLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Input {...control} name="model" />}
        </Field>
      </div>

      <Field label={t('defaultPriceLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <MoneyInput {...control} value={defaultUnitPrice} onValueChange={setDefaultUnitPrice} />
        )}
      </Field>

      <Field label={t('notesLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Textarea {...control} name="notes" rows={2} />}
      </Field>

      <Button type="submit" loading={pending}>
        {t('submit')}
      </Button>
    </form>
  );
}
