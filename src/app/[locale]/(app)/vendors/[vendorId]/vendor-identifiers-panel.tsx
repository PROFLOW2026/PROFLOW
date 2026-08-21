'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  VENDOR_IDENTIFIER_TYPES,
  type VendorIdentifierRecord,
} from '@/modules/vendors/domain/types';
import {
  deleteVendorIdentifierAction,
  upsertVendorIdentifierAction,
  type VendorFormState,
} from '../actions';

interface VendorIdentifiersPanelProps {
  vendorId: string;
  identifiers: readonly VendorIdentifierRecord[];
  canManage: boolean;
}

export function VendorIdentifiersPanel({
  vendorId,
  identifiers,
  canManage,
}: VendorIdentifiersPanelProps) {
  const t = useTranslations('vendors.detail');
  const tCommon = useTranslations('common');

  if (!canManage && identifiers.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('identifiersSection')}</CardTitle>
        <CardDescription>{t('identifiersHint')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {identifiers.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('identifiersEmpty')}</p>
        ) : (
          identifiers.map((identifier) => (
            <div
              key={identifier.id}
              className="flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-0"
            >
              <div className="min-w-0 flex-1 text-start">
                <p className="font-medium">{t(`identifierTypes.${identifier.type}`)}</p>
                <p className="text-sm" dir="ltr">
                  {identifier.value}
                </p>
              </div>
              {canManage ? (
                <div className="shrink-0">
                  <ConfirmAction
                    title={tCommon('actions.remove')}
                    description={
                      <>
                        <p>
                          {t('removeIdentifierQuestion', {
                            type: t(`identifierTypes.${identifier.type}`),
                            value: identifier.value,
                          })}
                        </p>
                        <p>{t('removeIdentifierConsequence')}</p>
                      </>
                    }
                    confirmLabel={tCommon('actions.remove')}
                    successMessage={t('removeIdentifierSuccess')}
                    onConfirm={async () => {
                      try {
                        await deleteVendorIdentifierAction(identifier.id, vendorId);
                        return { ok: true };
                      } catch {
                        return { error: tCommon('states.errorHint') };
                      }
                    }}
                    trigger={
                      <Button type="button" variant="ghost" size="sm">
                        {tCommon('actions.remove')}
                      </Button>
                    }
                  />
                </div>
              ) : null}
            </div>
          ))
        )}
        {canManage ? <AddVendorIdentifierForm vendorId={vendorId} /> : null}
      </CardContent>
    </Card>
  );
}

function AddVendorIdentifierForm({ vendorId }: { vendorId: string }) {
  const t = useTranslations('vendors.detail');
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(
    upsertVendorIdentifierAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 border-t pt-4">
      <input type="hidden" name="vendorId" value={vendorId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={t('addIdentifier')}>
        {(control) => (
          <Select name="type" defaultValue="tax_id">
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VENDOR_IDENTIFIER_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`identifierTypes.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label={t('addIdentifier')} required>
        {(control) => <Input {...control} name="value" required />}
      </Field>
      <Button type="submit" loading={pending} variant="secondary" size="sm">
        {t('addIdentifier')}
      </Button>
    </form>
  );
}
