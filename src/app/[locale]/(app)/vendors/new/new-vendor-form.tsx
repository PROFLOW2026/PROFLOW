'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { VENDOR_TYPES } from '@/modules/vendors/domain/types';
import { createVendorAction, type VendorFormState } from '../actions';

export function NewVendorForm() {
  const t = useTranslations('vendors.create');
  const tCommon = useTranslations('common');
  const tTypes = useTranslations('vendors.types');
  const [type, setType] = useState<(typeof VENDOR_TYPES)[number]>('supplier');
  const [showMore, setShowMore] = useState(false);
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(
    createVendorAction,
    {},
  );

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('nameLabel')} required>
        {(control) => (
          <Input {...control} name="name" placeholder={t('namePlaceholder')} autoFocus required />
        )}
      </Field>

      <Field label={t('typeLabel')} description={t('typeHint')}>
        {(control) => (
          <>
            <input type="hidden" name="type" value={type} />
            <Select value={type} onValueChange={(value) => setType(value as typeof type)}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENDOR_TYPES.map((vendorType) => (
                  <SelectItem key={vendorType} value={vendorType}>
                    {tTypes(vendorType)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Button type="button" variant="ghost" className="self-start" onClick={() => setShowMore((v) => !v)}>
        {showMore ? tCommon('actions.showLess') : t('moreDetails')}
      </Button>

      {showMore ? (
        <div className="flex flex-col gap-4">
          <Field label={t('emailLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="email" type="email" dir="ltr" />}
          </Field>
          <Field label={t('phoneLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="phone" type="tel" dir="ltr" />}
          </Field>
          <Field label={t('websiteLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="website" type="url" dir="ltr" />}
          </Field>
          <Field label={t('addressLine1Label')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="addressLine1" />}
          </Field>
          <Field label={t('cityLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="city" />}
          </Field>
          <Field label={t('countryLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="countryCode" maxLength={2} />}
          </Field>
          <Field label={t('notesLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Textarea {...control} name="notes" rows={3} />}
          </Field>
        </div>
      ) : null}

      <Button type="submit" loading={pending} block>
        {t('submit')}
      </Button>
    </form>
  );
}
