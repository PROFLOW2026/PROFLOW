'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
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
      className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4"
    >
      <h2 className="text-sm font-semibold">{t('createTitle')}</h2>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="currency" value={defaultCurrency} />
      <input type="hidden" name="defaultUnitPrice" value={defaultUnitPrice} />

      <MainAppFormGrid dense>
        <Field label={t('nameLabel')} required error={state.fieldErrors?.name} className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="name" required autoFocus />}
        </Field>

        <Field label={t('skuLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.md}>
          {(control) => <Input {...control} name="sku" />}
        </Field>
        <Field label={t('unitLabel')} className={mainAppFieldSpan.sm}>
          {(control) => <Input {...control} name="unit" defaultValue="ea" />}
        </Field>

        <Field label={t('manufacturerLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Input {...control} name="manufacturer" />}
        </Field>
        <Field label={t('modelLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Input {...control} name="model" />}
        </Field>

        <Field label={t('defaultPriceLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.md}>
          {(control) => (
            <MoneyInput {...control} value={defaultUnitPrice} onValueChange={setDefaultUnitPrice} />
          )}
        </Field>

        <Field label={t('notesLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.full}>
          {(control) => <Textarea {...control} name="notes" rows={2} />}
        </Field>
      </MainAppFormGrid>

      <Button type="submit" loading={pending} className="self-start">
        {t('submit')}
      </Button>
    </form>
  );
}
