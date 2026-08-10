'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/patterns/money-input';
import type { ExpenseDetail } from '@/modules/expenses/domain/types';
import { businessDate, type BusinessDate } from '@/shared/dates';
import { correctExpenseAction, type ExpenseActionState } from '../actions';

export function ExpenseCorrectDialog({
  expense,
  disabled = false,
}: {
  readonly expense: ExpenseDetail;
  readonly disabled?: boolean;
}) {
  const t = useTranslations('expenses');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(expense.netAmount.amount.replace(/^-/, ''));
  const [description, setDescription] = useState(expense.description ?? '');
  const [expenseDate, setExpenseDate] = useState<BusinessDate>(expense.expenseDate);
  const [state, formAction, pending] = useActionState<ExpenseActionState, FormData>(
    correctExpenseAction,
    {},
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" disabled={disabled}>
          {t('actions.correct')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('correction.title')}</DialogTitle>
          <DialogDescription>{t('correction.subtitle')}</DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <DialogBody className="flex flex-col gap-4">
            <p className="text-xs text-[var(--pf-text-muted)]">{t('correction.exampleHint')}</p>
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

            <input type="hidden" name="adjustsExpenseId" value={expense.id} />
            <input type="hidden" name="reverseOriginal" value="true" />
            <input type="hidden" name="currency" value={expense.netAmount.currency} />
            <input type="hidden" name="amount" value={amount} />
            <input type="hidden" name="amountIncludesTax" value="false" />
            <input type="hidden" name="netAmount" value={amount} />
            {expense.projectId ? <input type="hidden" name="projectId" value={expense.projectId} /> : null}
            {expense.workPackageId ? (
              <input type="hidden" name="workPackageId" value={expense.workPackageId} />
            ) : null}
            <input type="hidden" name="costFamily" value={expense.costFamily} />
            {expense.costCategoryId ? (
              <input type="hidden" name="costCategoryId" value={expense.costCategoryId} />
            ) : null}
            {expense.vendorId ? <input type="hidden" name="vendorId" value={expense.vendorId} /> : null}
            {expense.supplierName ? (
              <input type="hidden" name="supplierName" value={expense.supplierName} />
            ) : null}
            {expense.paymentMethod ? (
              <input type="hidden" name="paymentMethod" value={expense.paymentMethod} />
            ) : null}
            {expense.notes ? <input type="hidden" name="notes" value={expense.notes} /> : null}
            {expense.allocationDriverMethod ? (
              <input type="hidden" name="allocationDriverMethod" value={expense.allocationDriverMethod} />
            ) : null}
            {expense.allocationPeriodStart ? (
              <input type="hidden" name="allocationPeriodStart" value={expense.allocationPeriodStart} />
            ) : null}
            {expense.allocationPeriodEnd ? (
              <input type="hidden" name="allocationPeriodEnd" value={expense.allocationPeriodEnd} />
            ) : null}
            {expense.allocationScheduleMode ? (
              <input type="hidden" name="allocationScheduleMode" value={expense.allocationScheduleMode} />
            ) : null}
            <input type="hidden" name="allocations" value="[]" />

            <Field label={t('correction.amountLabel')} required>
              {(controlProps) => (
                <MoneyInput
                  {...controlProps}
                  value={amount}
                  onValueChange={setAmount}
                  className="text-lg"
                />
              )}
            </Field>

            <Field label={t('fields.description')} optionalLabel={tCommon('labels.optional')}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  name="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              )}
            </Field>

            <Field label={t('fields.date')}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="date"
                  name="expenseDate"
                  value={expenseDate}
                  onChange={(event) => setExpenseDate(businessDate(event.target.value))}
                  dir="ltr"
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              {t('correction.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
