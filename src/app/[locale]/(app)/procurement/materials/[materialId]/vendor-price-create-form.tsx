'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createMaterialVendorPriceAction,
  type ProcurementFormState,
} from '../../actions';

export function VendorPriceCreateForm({
  materialItemId,
  defaultCurrency,
  vendors,
}: {
  materialItemId: string;
  defaultCurrency: string;
  vendors: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('procurement.vendorPrice');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ProcurementFormState, FormData>(
    createMaterialVendorPriceAction,
    {},
  );
  const [unitPrice, setUnitPrice] = useState('');
  const [vendorId, setVendorId] = useState('');

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <input type="hidden" name="materialItemId" value={materialItemId} />
      <input type="hidden" name="currency" value={defaultCurrency} />
      <input type="hidden" name="unitPrice" value={unitPrice} />
      <input type="hidden" name="vendorId" value={vendorId} />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('saved')}</Alert> : null}

      <Field label={t('vendorLabel')} required>
        {(control) => (
          <Select value={vendorId || undefined} onValueChange={setVendorId}>
            <SelectTrigger id={control.id}>
              <SelectValue placeholder={t('vendorPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('unitPriceLabel')} required>
        {(control) => (
          <MoneyInput {...control} value={unitPrice} onValueChange={setUnitPrice} />
        )}
      </Field>

      <Field label={t('effectiveFromLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} type="date" name="effectiveFrom" />}
      </Field>

      <Field label={t('notesLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Textarea {...control} name="notes" rows={2} />}
      </Field>

      <Button type="submit" loading={pending} disabled={!vendorId || !unitPrice}>
        {t('submit')}
      </Button>
    </form>
  );
}
