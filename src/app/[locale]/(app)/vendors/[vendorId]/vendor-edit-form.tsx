'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { VENDOR_TYPES, type VendorDetail } from '@/modules/vendors/domain/types';
import {
  archiveVendorAction,
  restoreVendorAction,
  updateVendorAction,
  type VendorFormState,
} from '../actions';

interface VendorEditFormProps {
  vendor: VendorDetail;
}

export function VendorEditForm({ vendor }: VendorEditFormProps) {
  const tCreate = useTranslations('vendors.create');
  const tDetail = useTranslations('vendors.detail');
  const tCommon = useTranslations('common');
  const tTypes = useTranslations('vendors.types');
  const [type, setType] = useState<(typeof VENDOR_TYPES)[number]>(vendor.type);
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(
    updateVendorAction,
    {},
  );
  const [lifecyclePending, startLifecycle] = useTransition();
  const isArchived = vendor.archivedAt != null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{tDetail('editSection')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="vendorId" value={vendor.id} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <Field label={tCreate('nameLabel')} required>
            {(control) => (
              <Input {...control} name="name" defaultValue={vendor.name} required />
            )}
          </Field>

          <Field label={tCreate('typeLabel')} description={tCreate('typeHint')}>
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
          <p className="text-xs text-[var(--pf-text-muted)]">{tDetail('typeClearHint')}</p>

          <Field label={tCreate('emailLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input
                {...control}
                name="email"
                type="email"
                defaultValue={vendor.email ?? ''}
                dir="ltr"
              />
            )}
          </Field>
          <Field label={tCreate('phoneLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input
                {...control}
                name="phone"
                type="tel"
                defaultValue={vendor.phone ?? ''}
                dir="ltr"
              />
            )}
          </Field>
          <Field label={tCreate('websiteLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input
                {...control}
                name="website"
                type="url"
                defaultValue={vendor.website ?? ''}
                dir="ltr"
              />
            )}
          </Field>
          <Field label={tCreate('addressLine1Label')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input {...control} name="addressLine1" defaultValue={vendor.addressLine1 ?? ''} />
            )}
          </Field>
          <Field label={tCreate('cityLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="city" defaultValue={vendor.city ?? ''} />}
          </Field>
          <Field label={tCreate('countryLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input
                {...control}
                name="countryCode"
                defaultValue={vendor.countryCode ?? ''}
                maxLength={2}
                dir="ltr"
              />
            )}
          </Field>
          <Field label={tCreate('notesLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Textarea {...control} name="notes" rows={3} defaultValue={vendor.notes ?? ''} />
            )}
          </Field>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="submit" loading={pending} size="lg" block className="sm:w-auto sm:min-w-32">
              {tDetail('save')}
            </Button>
            {isArchived ? (
              <Button
                type="button"
                variant="secondary"
                loading={lifecyclePending}
                onClick={() => {
                  startLifecycle(async () => {
                    await restoreVendorAction(vendor.id);
                  });
                }}
              >
                {tDetail('restore')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                loading={lifecyclePending}
                onClick={() => {
                  if (window.confirm(tDetail('archiveConfirm'))) {
                    startLifecycle(async () => {
                      await archiveVendorAction(vendor.id);
                    });
                  }
                }}
              >
                {tDetail('archive')}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
