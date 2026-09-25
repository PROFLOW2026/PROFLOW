'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/patterns/money-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { businessDate } from '@/shared/dates';
import { money, roundMoney, sumMoney, toNumericString } from '@/shared/money';
import { buildCashInstallmentSchedule } from '../domain/cash-installment-schedule';

export interface InstallmentDraftLine {
  readonly dueDate: string;
  readonly amount: string;
}

export function ExpensePaymentStructureFields({
  initialStructure,
  initialCount,
  initialFirstDate,
  initialLines,
  grossAmount,
  currency,
  paidCount,
  expenseDate,
  readOnly,
  automaticInstallmentPayment,
  onAutomaticInstallmentPaymentChange,
  onStructureChange,
}: {
  readonly initialStructure: 'single' | 'installments';
  readonly initialCount: string;
  readonly initialFirstDate: string;
  readonly initialLines: readonly InstallmentDraftLine[];
  readonly grossAmount: string | null;
  readonly currency: string;
  readonly paidCount: number;
  readonly expenseDate: string;
  readonly readOnly: boolean;
  readonly automaticInstallmentPayment: boolean;
  readonly onAutomaticInstallmentPaymentChange: (value: boolean) => void;
  readonly onStructureChange: (value: 'single' | 'installments') => void;
}) {
  const t = useTranslations('expenses');
  const [structure, setStructure] = useState(initialStructure);
  const [count, setCount] = useState(initialCount);
  const [firstDate, setFirstDate] = useState(initialFirstDate);
  const [manualLines, setManualLines] = useState<InstallmentDraftLine[]>([...initialLines]);
  const [manual, setManual] = useState(initialLines.length > 1);
  const [paidPrefix] = useState(() => initialLines.slice(0, Math.max(0, paidCount)));

  function chooseStructure(next: 'single' | 'installments') {
    setStructure(next);
    if (next === 'single') setManual(false);
    onStructureChange(next);
  }

  const generatedLines = useMemo(() => {
    if (structure !== 'installments' || manual) return null;
    const installmentCount = Number(count);
    const start = firstDate || expenseDate;
    if (!grossAmount || !start || !Number.isInteger(installmentCount) || installmentCount < 2) {
      return null;
    }
    try {
      const built = buildCashInstallmentSchedule({
        totalGross: money(grossAmount, currency),
        installmentCount,
        startDate: businessDate(start),
      });
      return built.map((line, index) => {
        const paidLine = paidPrefix[index];
        if (index < paidCount && paidLine) return paidLine;
        return { dueDate: line.dueDate, amount: line.amount.amount };
      });
    } catch {
      return null;
    }
  }, [
    structure,
    manual,
    count,
    firstDate,
    expenseDate,
    grossAmount,
    currency,
    paidCount,
    paidPrefix,
  ]);

  const lines = generatedLines ?? manualLines;

  const sumMatches = useMemo(() => {
    if (structure !== 'installments' || !grossAmount || lines.length === 0) return true;
    try {
      const total = roundMoney(money(grossAmount, currency));
      const parts = lines.map((line) => money(line.amount || '0', currency));
      const sum = roundMoney(sumMoney(parts, currency));
      return toNumericString(sum) === toNumericString(total);
    } catch {
      return false;
    }
  }, [structure, grossAmount, lines, currency]);

  const payload =
    structure === 'installments'
      ? JSON.stringify({
          interval: 'monthly',
          lines: lines.map((line) => ({ dueDate: line.dueDate, amount: line.amount })),
        })
      : '';

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="text-sm font-medium text-[var(--pf-text-secondary)]">
        {t('fields.paymentStructure')}
      </legend>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="paymentStructureChoice"
            checked={structure === 'single'}
            disabled={readOnly || paidCount > 0}
            onChange={() => chooseStructure('single')}
          />
          {t('fields.paymentStructureSingle')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="paymentStructureChoice"
            checked={structure === 'installments'}
            disabled={readOnly}
            onChange={() => chooseStructure('installments')}
          />
          {t('fields.paymentStructureInstallments')}
        </label>
      </div>
      <input type="hidden" name="paymentStructure" value={structure} />
      <input
        type="hidden"
        name="installmentCount"
        value={structure === 'installments' ? String(Math.max(lines.length, Number(count) || 1)) : '1'}
      />
      <input
        type="hidden"
        name="installmentStartDate"
        value={structure === 'installments' ? (lines[0]?.dueDate ?? firstDate) : ''}
      />
      <input type="hidden" name="cashInstallmentSchedule" value={payload} />

      {structure === 'installments' ? (
        <>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('fields.installmentHint')}</p>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('fields.installmentScheduleReplacesTerms')}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('fields.installmentCount')}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="number"
                  min={Math.max(2, paidCount)}
                  max={120}
                  step={1}
                  value={count}
                  dir="ltr"
                  disabled={readOnly}
                  onChange={(event) => {
                    setManual(false);
                    setCount(event.target.value);
                  }}
                />
              )}
            </Field>
            <Field label={t('fields.installmentStart')}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="date"
                  value={firstDate}
                  dir="ltr"
                  disabled={readOnly || paidCount > 0}
                  onChange={(event) => {
                    setManual(false);
                    setFirstDate(event.target.value);
                  }}
                />
              )}
            </Field>
          </div>
          <Field label={t('fields.installmentFrequency')}>
            {(controlProps) => (
              <Select value="monthly" disabled>
                <SelectTrigger {...controlProps}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t('fields.installmentFrequencyMonthly')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{t('fields.installmentPreview')}</p>
            {manual && !readOnly ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setManual(false)}
              >
                {t('fields.regenerateInstallments')}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            {lines.map((line, index) => {
              const locked = readOnly || index < paidCount;
              return (
                <div key={`${index}-${line.dueDate}`} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    type="date"
                    value={line.dueDate}
                    dir="ltr"
                    disabled={locked}
                    aria-label={t('fields.installmentDueDate')}
                    onChange={(event) => {
                      const dueDate = event.target.value;
                      setManual(true);
                      setManualLines(
                        lines.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, dueDate } : item,
                        ),
                      );
                    }}
                  />
                  <MoneyInput
                    value={line.amount}
                    currency={currency}
                    disabled={locked}
                    aria-label={t('fields.installmentAmount')}
                    onValueChange={(amount) => {
                      setManual(true);
                      setManualLines(
                        lines.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, amount } : item,
                        ),
                      );
                    }}
                  />
                </div>
              );
            })}
          </div>
          {!sumMatches ? (
            <p className="text-sm text-[var(--pf-status-danger-fg,var(--pf-text-secondary))]">
              {t('fields.installmentSumMismatch')}
            </p>
          ) : null}
          <input
            type="hidden"
            name="automaticInstallmentPayment"
            value={automaticInstallmentPayment ? 'true' : 'false'}
          />
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={automaticInstallmentPayment}
              onCheckedChange={(checked) => onAutomaticInstallmentPaymentChange(checked === true)}
              disabled={readOnly}
            />
            <span className="text-sm">{t('fields.automaticInstallmentPaymentHint')}</span>
          </label>
        </>
      ) : (
        <input type="hidden" name="automaticInstallmentPayment" value="false" />
      )}
    </fieldset>
  );
}
