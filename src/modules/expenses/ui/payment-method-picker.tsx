'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PAYMENT_METHOD_KEYS,
  type PaymentMethodKey,
  isPaymentMethodKey,
  PAYMENT_METHOD_CREDIT_CARD,
} from '@/modules/expenses/domain/payment-method';
import type { PaymentInstrumentRow } from '@/modules/payment-instruments/domain/types';
import { formatPaymentInstrumentLabel } from '@/modules/payment-instruments/domain/types';

const NONE_VALUE = '__none__';

export interface PaymentMethodPickerProps {
  readonly paymentMethod: string;
  readonly paymentMethodOther: string;
  readonly paymentInstrumentId: string;
  readonly instruments: readonly PaymentInstrumentRow[];
  readonly onPaymentMethodChange: (method: string) => void;
  readonly onPaymentMethodOtherChange: (text: string) => void;
  readonly onPaymentInstrumentChange: (id: string) => void;
  readonly disabled?: boolean;
}

export function PaymentMethodPicker({
  paymentMethod,
  paymentMethodOther,
  paymentInstrumentId,
  instruments,
  onPaymentMethodChange,
  onPaymentMethodOtherChange,
  onPaymentInstrumentChange,
  disabled = false,
}: PaymentMethodPickerProps) {
  const t = useTranslations('expenses');

  const activeKey = isPaymentMethodKey(paymentMethod) ? paymentMethod : '';
  const showOther = activeKey === 'other' || (!activeKey && paymentMethodOther.trim().length > 0);
  const showCardSelect = activeKey === PAYMENT_METHOD_CREDIT_CARD;

  function selectKey(key: PaymentMethodKey | '') {
    if (!key) {
      onPaymentMethodChange('');
      onPaymentInstrumentChange('');
      return;
    }
    onPaymentMethodChange(key);
    if (key !== PAYMENT_METHOD_CREDIT_CARD) {
      onPaymentInstrumentChange('');
    }
    if (key !== 'other') {
      onPaymentMethodOtherChange('');
    }
  }

  const storedMethod =
    activeKey === 'other' ? paymentMethodOther.trim() || 'other' : paymentMethod;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Field label={t('payment.methodLabel')} optionalLabel={t('payment.optional')}>
        {() => (
          <div className="flex min-w-0 flex-wrap gap-2">
            {PAYMENT_METHOD_KEYS.map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={activeKey === key ? 'primary' : 'secondary'}
                onClick={() => selectKey(activeKey === key ? '' : key)}
                disabled={disabled}
              >
                {t(`payment.methods.${key}`)}
              </Button>
            ))}
          </div>
        )}
      </Field>

      <input type="hidden" name="paymentMethod" value={storedMethod} />
      <input type="hidden" name="paymentInstrumentId" value={paymentInstrumentId} />

      {showOther ? (
        <Field label={t('payment.otherDetail')} optionalLabel={t('payment.optional')}>
          {(controlProps) => (
            <Input
              {...controlProps}
              value={paymentMethodOther}
              onChange={(event) => {
                onPaymentMethodOtherChange(event.target.value);
                onPaymentMethodChange('other');
              }}
              disabled={disabled}
              placeholder={t('payment.otherPlaceholder')}
            />
          )}
        </Field>
      ) : null}

      {showCardSelect && instruments.length > 0 ? (
        <Field label={t('payment.cardSelect')} optionalLabel={t('payment.optional')}>
          {(controlProps) => (
            <Select
              value={paymentInstrumentId || NONE_VALUE}
              onValueChange={(value) => onPaymentInstrumentChange(value === NONE_VALUE ? '' : value)}
              disabled={disabled}
            >
              <SelectTrigger {...controlProps}>
                <SelectValue placeholder={t('payment.cardSelectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>{t('payment.cardGeneric')}</SelectItem>
                {instruments.map((instrument) => (
                  <SelectItem key={instrument.id} value={instrument.id}>
                    {formatPaymentInstrumentLabel(instrument)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      ) : null}
    </div>
  );
}
