'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { OrgInvoicingSettings } from '@/modules/invoicing-integration/domain/org-invoicing-settings';
import { saveInvoicingSettingsAction } from './invoicing-settings-actions';

export interface InvoicingSettingsPanelProps {
  settings: OrgInvoicingSettings;
  canManage: boolean;
  transactionInvoiceSupported: boolean;
}

function RadioOption({
  name,
  value,
  defaultChecked,
  id,
  label,
  disabled,
}: {
  name: string;
  value: string;
  defaultChecked: boolean;
  id: string;
  label: string;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="radio"
        name={name}
        value={value}
        id={id}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="h-4 w-4"
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

export function InvoicingSettingsPanel({
  settings,
  canManage,
  transactionInvoiceSupported,
}: InvoicingSettingsPanelProps) {
  const t = useTranslations('invoicingIntegration.settings');
  const [state, formAction, pending] = useActionState(saveInvoicingSettingsAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          <fieldset disabled={!canManage || pending} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>{t('modeLabel')}</Label>
              <RadioOption
                name="mode"
                value="manual"
                id="mode-manual"
                defaultChecked={settings.mode === 'manual'}
                label={t('modeManual')}
                disabled={!canManage || pending}
              />
              <RadioOption
                name="mode"
                value="external_provider"
                id="mode-external"
                defaultChecked={settings.mode === 'external_provider'}
                label={t('modeExternal')}
                disabled={!canManage || pending}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t('policyLabel')}</Label>
              <RadioOption
                name="paymentDocumentPolicy"
                value="tax_invoice_then_receipt"
                id="policy-split"
                defaultChecked={settings.paymentDocumentPolicy === 'tax_invoice_then_receipt'}
                label={t('policySplit')}
                disabled={!canManage || pending}
              />
              <RadioOption
                name="paymentDocumentPolicy"
                value="tax_invoice_receipt_on_payment"
                id="policy-combined"
                defaultChecked={settings.paymentDocumentPolicy === 'tax_invoice_receipt_on_payment'}
                label={t('policyCombined')}
                disabled={!canManage || pending}
              />
              {transactionInvoiceSupported ? (
                <RadioOption
                  name="paymentDocumentPolicy"
                  value="transaction_invoice_before_payment"
                  id="policy-transaction"
                  defaultChecked={
                    settings.paymentDocumentPolicy === 'transaction_invoice_before_payment'
                  }
                  label={t('policyTransaction')}
                  disabled={!canManage || pending}
                />
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t('receiptIssuanceLabel')}</Label>
              <RadioOption
                name="receiptIssuance"
                value="automatic"
                id="receipt-auto"
                defaultChecked={settings.receiptIssuance === 'automatic'}
                label={t('receiptAutomatic')}
                disabled={!canManage || pending}
              />
              <RadioOption
                name="receiptIssuance"
                value="manual"
                id="receipt-manual"
                defaultChecked={settings.receiptIssuance === 'manual'}
                label={t('receiptManual')}
                disabled={!canManage || pending}
              />
            </div>
          </fieldset>

          {canManage ? (
            <Button type="submit" disabled={pending}>
              {t('save')}
            </Button>
          ) : null}

          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{t('saved')}</Alert> : null}
        </form>
      </CardContent>
    </Card>
  );
}
