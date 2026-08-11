'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  isZeroMoney,
  money,
  percentOfMoney,
  toDecimalValue,
  toNumericString,
} from '@/shared/money/money';

export function RetentionCaptureFields({
  namespace,
  currency,
  totalAmount,
  defaultAmount,
  embedded = false,
}: {
  namespace: 'ap.retention' | 'billing.retention';
  currency: string;
  totalAmount: string;
  defaultAmount?: string;
  embedded?: boolean;
}) {
  const t = useTranslations(namespace);
  const tCommon = useTranslations('common');
  const [amount, setAmount] = useState(defaultAmount ?? '');
  const [percent, setPercent] = useState(() =>
    percentFromAmount(defaultAmount ?? '', totalAmount, currency),
  );

  const percentRef = useRef(percent);
  useEffect(() => {
    percentRef.current = percent;
  }, [percent]);
  useEffect(() => {
    const currentPercent = percentRef.current;
    if (!currentPercent.trim()) return;
    setAmount(amountFromPercent(currentPercent, totalAmount, currency));
  }, [totalAmount, currency]);

  const previewHeld = useMemo(() => {
    try {
      if (amount.trim()) return toNumericString(money(amount, currency));
      if (percent.trim()) return toNumericString(percentOfMoney(money(totalAmount || '0', currency), percent));
      return '0';
    } catch {
      return '0';
    }
  }, [amount, percent, currency, totalAmount]);

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      {embedded ? null : (
        <div>
          <h2 className="text-sm font-semibold">{t('title')}</h2>
          <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('disclosure')}</p>
          <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('captureHint')}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('amountLabel')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <MoneyInput
              {...props}
              value={amount}
              onValueChange={(next) => {
                setAmount(next);
                setPercent(percentFromAmount(next, totalAmount, currency));
              }}
            />
          )}
        </Field>
        <Field
          label={t('percentLabel')}
          optionalLabel={tCommon('labels.optional')}
          description={t('percentHint')}
        >
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              inputMode="decimal"
              value={percent}
              onChange={(event) => {
                const next = event.target.value;
                setPercent(next);
                setAmount(amountFromPercent(next, totalAmount, currency));
              }}
            />
          )}
        </Field>
      </div>

      <input type="hidden" name="retentionAmount" value={amount} />
      <input type="hidden" name="retentionPercent" value={percent} />

      {!isZeroMoney(money(previewHeld || '0', currency)) ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t('held')}:{' '}
          <span dir="ltr" className="pf-numeric">
            {previewHeld} {currency}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function percentFromAmount(amount: string, total: string, currency: string): string {
  if (!amount.trim() || !total.trim()) return '';
  try {
    const totalMoney = money(total, currency);
    if (isZeroMoney(totalMoney)) return '';
    const pct = toDecimalValue(money(amount, currency))
      .dividedBy(toDecimalValue(totalMoney))
      .times(100);
    return pct.toFixed(2).replace(/\.?0+$/, '');
  } catch {
    return '';
  }
}

function amountFromPercent(percent: string, total: string, currency: string): string {
  if (!percent.trim() || !total.trim()) return '';
  try {
    return toNumericString(percentOfMoney(money(total, currency), percent));
  } catch {
    return '';
  }
}
