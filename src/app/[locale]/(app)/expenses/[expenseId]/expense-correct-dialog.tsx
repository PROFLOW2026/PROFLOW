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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatMoneyAmountForInput, MoneyInput } from '@/components/patterns/money-input';
import type { CostCategoryRow, CostFamily, ExpenseDetail, ProjectOption } from '@/modules/expenses/domain/types';
import { AllocationEditor, type AllocationDraft } from '@/modules/expenses/ui/allocation-editor';
import { businessDate, type BusinessDate } from '@/shared/dates';
import { correctExpenseAction, type ExpenseActionState } from '../actions';

const OVERHEAD_VALUE = '__overhead__';

function initialAmount(expense: ExpenseDetail): string {
  const abs = expense.netAmount.amount.replace(/^-/, '');
  return formatMoneyAmountForInput(abs, expense.netAmount.currency);
}

function initialAllocations(expense: ExpenseDetail): AllocationDraft[] {
  return expense.allocations.map((line) => ({
    targetType: line.targetType,
    projectId: line.projectId,
    workPackageId: line.workPackageId,
    costCategoryId: line.costCategoryId,
    method: line.method,
    amount: formatMoneyAmountForInput(line.amount.amount, line.amount.currency),
    percent: line.percent ?? '',
    notes: line.notes ?? '',
    sortOrder: line.sortOrder,
  }));
}

function resolveCostFamilyForTarget(
  isOverhead: boolean,
  current: CostFamily,
): CostFamily {
  if (isOverhead && current === 'direct_project') return 'business_overhead';
  if (!isOverhead && current === 'business_overhead') return 'direct_project';
  return current;
}

export function ExpenseCorrectDialog({
  expense,
  projects,
  categories,
  disabled = false,
}: {
  readonly expense: ExpenseDetail;
  readonly projects: readonly ProjectOption[];
  readonly categories: readonly CostCategoryRow[];
  readonly disabled?: boolean;
}) {
  const t = useTranslations('expenses');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const currency = expense.netAmount.currency;
  const [amount, setAmount] = useState(() => initialAmount(expense));
  const [description, setDescription] = useState(expense.description ?? '');
  const [expenseDate, setExpenseDate] = useState<BusinessDate>(expense.expenseDate);
  const [targeting, setTargeting] = useState(
    () => expense.projectId ?? OVERHEAD_VALUE,
  );
  const [costFamily, setCostFamily] = useState<CostFamily>(expense.costFamily);
  const [allocations, setAllocations] = useState<AllocationDraft[]>(() =>
    initialAllocations(expense),
  );
  const [state, formAction, pending] = useActionState<ExpenseActionState, FormData>(
    correctExpenseAction,
    {},
  );

  const isOverhead = targeting === OVERHEAD_VALUE;
  const projectId = isOverhead ? '' : targeting;

  function handleTargetingChange(value: string) {
    const nextOverhead = value === OVERHEAD_VALUE;
    setTargeting(value);
    setCostFamily((prev) => resolveCostFamilyForTarget(nextOverhead, prev));
    if (!nextOverhead) {
      setAllocations([]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" disabled={disabled}>
          {t('actions.correct')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('correction.title')}</DialogTitle>
          <DialogDescription>{t('correction.subtitle')}</DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <DialogBody className="flex flex-col gap-4">
            <p className="text-xs text-[var(--pf-text-muted)]">{t('correction.historyHint')}</p>
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

            <input type="hidden" name="adjustsExpenseId" value={expense.id} />
            <input type="hidden" name="reverseOriginal" value="true" />
            <input type="hidden" name="currency" value={currency} />
            <input type="hidden" name="amount" value={amount} />
            <input type="hidden" name="amountIncludesTax" value="false" />
            <input type="hidden" name="netAmount" value={amount} />
            <input type="hidden" name="projectId" value={projectId} />
            {expense.workPackageId && projectId && projectId === expense.projectId ? (
              <input type="hidden" name="workPackageId" value={expense.workPackageId} />
            ) : null}
            <input type="hidden" name="costFamily" value={costFamily} />
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
            <input
              type="hidden"
              name="allocations"
              value={isOverhead ? JSON.stringify(allocations) : '[]'}
            />

            <Field label={t('correction.amountLabel')} required>
              {(controlProps) => (
                <MoneyInput
                  {...controlProps}
                  value={amount}
                  onValueChange={setAmount}
                  currency={currency}
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

            <Field label={t('fields.target')}>
              {(controlProps) => (
                <Select value={targeting} onValueChange={handleTargetingChange}>
                  <SelectTrigger {...controlProps}>
                    <SelectValue placeholder={t('placeholders.target')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OVERHEAD_VALUE}>{t('targeting.overhead')}</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            {isOverhead ? (
              <>
                <p className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-start text-sm text-[var(--pf-text-secondary)]">
                  {t('allocation.subtitle')}
                </p>
                <AllocationEditor
                  currency={currency}
                  totalAmount={amount}
                  projects={projects}
                  categories={categories}
                  value={allocations}
                  onChange={setAllocations}
                />
              </>
            ) : null}
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
