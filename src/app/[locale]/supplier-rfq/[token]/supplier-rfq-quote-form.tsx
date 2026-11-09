'use client';

import { useMemo, useState, useActionState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { addMoney, money, multiplyMoney, toNumericString, zeroMoney } from '@/shared/money/money';
import { submitSupplierRfqQuoteAction, type SupplierRfqFormState } from '../actions';

interface LineDraft {
  key: string;
  description: string;
  quantity: string;
  unitAmount: string;
  lineTotal: string;
}

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyLine(description = '', quantity = '1'): LineDraft {
  return {
    key: newKey(),
    description,
    quantity,
    unitAmount: '',
    lineTotal: '',
  };
}

function computeLineTotal(quantity: string, unitAmount: string, currency: string): string {
  if (!quantity.trim() || !unitAmount.trim()) return '';
  try {
    return toNumericString(multiplyMoney(money(unitAmount, currency), quantity));
  } catch {
    return '';
  }
}

export function SupplierRfqQuoteForm({
  token,
  defaultCurrency,
  seedLines,
}: {
  token: string;
  defaultCurrency: string;
  seedLines: readonly { description: string; quantity: string }[];
}) {
  const t = useTranslations('procurement.supplierRfqLink.form');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<SupplierRfqFormState, FormData>(
    submitSupplierRfqQuoteAction,
    {},
  );

  const currency = defaultCurrency;
  const [lines, setLines] = useState<LineDraft[]>(() =>
    seedLines.length > 0
      ? seedLines.map((line) => emptyLine(line.description, line.quantity || '1'))
      : [emptyLine()],
  );
  const totalAmount = useMemo(() => {
    try {
      return toNumericString(
        lines.reduce((sum, line) => {
          if (!line.lineTotal.trim()) return sum;
          return addMoney(sum, money(line.lineTotal, currency));
        }, zeroMoney(currency)),
      );
    } catch {
      return '0';
    }
  }, [currency, lines]);

  const linesPayload = useMemo(
    () =>
      JSON.stringify(
        lines
          .filter((line) => line.description.trim() && line.unitAmount.trim() && line.lineTotal.trim())
          .map((line) => ({
            description: line.description.trim(),
            quantity: line.quantity.trim() || '1',
            unitAmount: line.unitAmount.trim(),
            lineTotal: line.lineTotal.trim(),
            currency,
          })),
      ),
    [currency, lines],
  );

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.quantity !== undefined || patch.unitAmount !== undefined) {
          next.lineTotal = computeLineTotal(next.quantity, next.unitAmount, currency);
        }
        return next;
      }),
    );
  }

  if (state.success) {
    return <Alert tone="success">{t('success')}</Alert>;
  }

  return (
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="lines" value={linesPayload} />

      <Field label={t('receivedOnLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="receivedOn" type="date" dir="ltr" />}
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{t('linesTitle')}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setLines((prev) => [...prev, emptyLine()])}
        >
          <Plus aria-hidden />
          {t('addLine')}
        </Button>
      </div>

      {lines.map((line, index) => (
        <div
          key={line.key}
          className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3"
        >
          <Field label={t('lineDescription')} required>
            {(control) => (
              <Input
                {...control}
                value={line.description}
                onChange={(event) => updateLine(index, { description: event.target.value })}
              />
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('lineQuantity')}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                />
              )}
            </Field>
            <Field label={t('lineUnitAmount')} required>
              {(control) => (
                <MoneyInput
                  {...control}
                  value={line.unitAmount}
                  onValueChange={(value) => updateLine(index, { unitAmount: value })}
                />
              )}
            </Field>
            <Field label={t('lineTotal')}>
              {(control) => (
                <MoneyInput
                  {...control}
                  value={line.lineTotal}
                  onValueChange={(value) => updateLine(index, { lineTotal: value })}
                />
              )}
            </Field>
          </div>

          {lines.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
            >
              <Trash2 aria-hidden />
              {t('removeLine')}
            </Button>
          ) : null}
        </div>
      ))}

      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t('totalLabel')}: <MoneyText value={money(totalAmount, currency)} className="font-medium" />
      </p>

      <Field label={t('notesLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Textarea {...control} name="notes" rows={2} />}
      </Field>

      <Button type="submit" loading={pending} className="self-start">
        {t('submit')}
      </Button>
    </form>
  );
}
