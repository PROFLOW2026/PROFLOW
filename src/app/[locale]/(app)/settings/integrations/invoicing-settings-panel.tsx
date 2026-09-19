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
  mode: OrgInvoicingSettings['mode'];
  canManage: boolean;
  transactionInvoiceSupported: boolean;
  providerConnected: boolean;
  onModeChange: (mode: OrgInvoicingSettings['mode']) => void;
}

function RadioOption({
  name,
  value,
  checked,
  defaultChecked,
  id,
  label,
  description,
  disabled,
  onSelect,
}: {
  name: string;
  value: string;
  checked?: boolean;
  defaultChecked?: boolean;
  id: string;
  label: string;
  description?: string;
  disabled: boolean;
  onSelect?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-[var(--pf-border-default)] p-3">
      <div className="flex items-start gap-2">
        <input
          type="radio"
          name={name}
          value={value}
          id={id}
          checked={checked}
          defaultChecked={defaultChecked}
          disabled={disabled}
          className="mt-1 h-4 w-4"
          onChange={() => onSelect?.()}
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor={id} className="font-medium">
            {label}
          </Label>
          {description ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{description}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function InvoicingSettingsPanel({
  settings,
  mode,
  canManage,
  transactionInvoiceSupported,
  providerConnected,
  onModeChange,
}: InvoicingSettingsPanelProps) {
  const t = useTranslations('invoicingIntegration.settings');
  const [state, formAction, pending] = useActionState(saveInvoicingSettingsAction, {});
  const accountingMode = mode === 'external_provider';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('intro')}</p>
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
                checked={mode === 'manual'}
                label={t('modeManual')}
                description={t('modeManualDescription')}
                disabled={!canManage || pending}
                onSelect={() => onModeChange('manual')}
              />
              <RadioOption
                name="mode"
                value="external_provider"
                id="mode-external"
                checked={mode === 'external_provider'}
                label={t('modeExternal')}
                description={t('modeExternalDescription')}
                disabled={!canManage || pending}
                onSelect={() => onModeChange('external_provider')}
              />
            </div>

            {accountingMode ? (
              <div className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
                <Label>{t('accountingSystemLabel')}</Label>
                {providerConnected ? (
                  <p className="text-sm text-[var(--pf-text-secondary)]">
                    {t('providerConnectedInline', { provider: 'SUMIT' })}
                  </p>
                ) : (
                  <p className="text-sm text-[var(--pf-text-secondary)]">{t('providerNotConnected')}</p>
                )}
              </div>
            ) : null}

            {accountingMode ? (
              <>
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
                    defaultChecked={
                      settings.paymentDocumentPolicy === 'tax_invoice_receipt_on_payment'
                    }
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
              </>
            ) : null}
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
