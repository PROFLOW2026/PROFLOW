'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CONTACT_ROLES } from '@/modules/vendors';
import { addVendorContactAction, type VendorFormState } from '../actions';

export function VendorContactForm({ vendorId }: { vendorId: string }) {
  const t = useTranslations('vendors.detail');
  const tCommon = useTranslations('common');
  const [role, setRole] = useState<(typeof CONTACT_ROLES)[number]>('primary');
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(
    addVendorContactAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 border-t border-[var(--pf-border-default)] pt-4">
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="role" value={role} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('contactNameLabel')} required>
          {(control) => <Input {...control} name="name" required />}
        </Field>
        <Field label={t('contactRoleLabel')}>
          {(control) => (
            <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_ROLES.map((contactRole) => (
                  <SelectItem key={contactRole} value={contactRole}>
                    {t(`contactRoles.${contactRole}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label={tCommon('labels.email')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Input {...control} name="email" type="email" />}
        </Field>
        <Field label={tCommon('labels.phone')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Input {...control} name="phone" type="tel" />}
        </Field>
      </div>

      <Button type="submit" variant="secondary" size="sm" loading={pending} className="self-start">
        {t('addContact')}
      </Button>
    </form>
  );
}
