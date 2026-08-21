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
import { VendorCatalogMultiSelect } from '@/modules/vendors/ui/vendor-catalog-multi-select';
import {
  archiveVendorAction,
  restoreVendorAction,
  updateVendorAction,
  type VendorFormState,
} from '../actions';

interface CatalogOption {
  readonly id: string;
  readonly name: string;
}

interface VendorEditFormProps {
  vendor: VendorDetail;
  paymentTerms?: readonly CatalogOption[];
  categories?: readonly CatalogOption[];
  specialties?: readonly CatalogOption[];
}

export function VendorEditForm({
  vendor,
  paymentTerms = [],
  categories = [],
  specialties = [],
}: VendorEditFormProps) {
  const tCreate = useTranslations('vendors.create');
  const tDetail = useTranslations('vendors.detail');
  const tCommon = useTranslations('common');
  const tTypes = useTranslations('vendors.types');
  const [type, setType] = useState<(typeof VENDOR_TYPES)[number]>(vendor.type);
  const [status, setStatus] = useState<'active' | 'inactive'>(vendor.status);
  const [paymentTermId, setPaymentTermId] = useState(vendor.defaultPaymentTermId ?? '');
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(
    updateVendorAction,
    {},
  );
  const [lifecyclePending, startLifecycle] = useTransition();
  const isArchived = vendor.archivedAt != null;

  const selectedCategoryIds = vendor.catalogLinks
    .filter((link) => link.linkKind === 'vendor_category')
    .map((link) => link.catalogEntryId);
  const selectedSpecialtyIds = vendor.catalogLinks
    .filter((link) => link.linkKind === 'vendor_specialty')
    .map((link) => link.catalogEntryId);

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

          <Field
            label={tDetail('operationalStatusLabel')}
            description={tDetail('operationalStatusHint')}
          >
            {(control) => (
              <>
                <input type="hidden" name="status" value={status} />
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as 'active' | 'inactive')}
                >
                  <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{tDetail('statusActive')}</SelectItem>
                    <SelectItem value="inactive">{tDetail('statusInactive')}</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>

          {paymentTerms.length > 0 ? (
            <Field label={tDetail('paymentTermLabel')} optionalLabel={tCommon('labels.optional')}>
              {(control) => (
                <>
                  <input type="hidden" name="defaultPaymentTermId" value={paymentTermId} />
                  <Select
                    value={paymentTermId || '__none__'}
                    onValueChange={(value) => setPaymentTermId(value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger id={control.id}>
                      <SelectValue placeholder={tDetail('paymentTermNone')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{tDetail('paymentTermNone')}</SelectItem>
                      {paymentTerms.map((term) => (
                        <SelectItem key={term.id} value={term.id}>
                          {term.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>
          ) : null}

          <VendorCatalogMultiSelect
            categories={categories}
            specialties={specialties}
            selectedCategoryIds={selectedCategoryIds}
            selectedSpecialtyIds={selectedSpecialtyIds}
          />

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
          <p className="text-xs text-[var(--pf-text-secondary)]">{tDetail('archiveVsInactiveHint')}</p>
        </form>
      </CardContent>
    </Card>
  );
}
