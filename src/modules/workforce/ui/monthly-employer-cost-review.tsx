'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  applyMonthlyEmployerCostAllocationAction,
  saveMonthlyEmployerCostDraftAction,
} from '@/app/[locale]/(app)/workforce/employees/actions';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoneyInput } from '@/components/patterns/money-input';
import { MoneyText } from '@/components/patterns/money-text';
import { money } from '@/shared/money/money';
import {
  MONTHLY_ALLOCATION_METHODS,
  areEmployeeMonthCostsAvailable,
  previewMonthlyCostStrip,
  type MonthlyAllocationMethod,
} from '@/modules/workforce/domain/monthly-cost-gates';
import type { MonthlyEmployerCostReview as MonthlyEmployerCostReviewData } from '@/modules/workforce/application/employer-month-costs';

export interface MonthlyEmployerCostReviewProps {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly currency: string;
  readonly defaultYearMonth: string;
  /** Permissioned finance / workforce costs viewers only. */
  readonly canReview: boolean;
  /** When true and gate ready, shows Apply (requires cost.manage). */
  readonly canManage?: boolean;
  /** Server-loaded month row for the default month (existing Owner data). */
  readonly initialReview?: MonthlyEmployerCostReviewData | null;
}

/**
 * Optional month review strip (Agent 5 Flow C).
 * Gate off → draft-only preview; Save is a safe no-op that never claims Actual.
 * Gate on → persists draft / apply via server actions (Actual only after apply).
 */
export function MonthlyEmployerCostReview({
  employeeId,
  employeeName,
  currency,
  defaultYearMonth,
  canReview,
  canManage = false,
  initialReview = null,
}: MonthlyEmployerCostReviewProps) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');
  const ready = areEmployeeMonthCostsAvailable();
  const [pending, startTransition] = useTransition();

  const initialMonth = initialReview?.month;
  const [yearMonth, setYearMonth] = useState(initialReview?.yearMonth ?? defaultYearMonth);
  const [estimated, setEstimated] = useState(initialMonth?.estimatedAmount ?? '');
  const [actual, setActual] = useState(initialMonth?.actualAmount ?? initialMonth?.knownAmount ?? '');
  const [allocated, setAllocated] = useState('');
  const [method, setMethod] = useState<MonthlyAllocationMethod>('hours');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const preview = useMemo(
    () =>
      previewMonthlyCostStrip({
        estimatedAmount: estimated,
        actualAmount: actual,
        allocatedAmount: allocated,
      }),
    [estimated, actual, allocated],
  );

  if (!canReview) return null;

  function handleSaveDraft() {
    setActionError(null);
    if (!ready) {
      setSavedDraft(true);
      return;
    }
    startTransition(async () => {
      const result = await saveMonthlyEmployerCostDraftAction({
        employeeId,
        yearMonth,
        estimatedAmount: estimated,
        actualAmount: actual,
        method: showAdvanced ? method : undefined,
      });
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setSavedDraft(true);
      setApplied(false);
    });
  }

  function handleApply() {
    setActionError(null);
    if (!ready || !canManage) return;
    startTransition(async () => {
      const saveResult = await saveMonthlyEmployerCostDraftAction({
        employeeId,
        yearMonth,
        estimatedAmount: estimated,
        actualAmount: actual,
        method: showAdvanced ? method : 'fixed_amount',
      });
      if (saveResult.error) {
        setActionError(saveResult.error);
        return;
      }
      const applyResult = await applyMonthlyEmployerCostAllocationAction({
        employeeId,
        yearMonth,
      });
      if (applyResult.error) {
        setActionError(applyResult.error);
        return;
      }
      setSavedDraft(true);
      setApplied(true);
    });
  }

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="text-start">
        <h2 className="text-base font-semibold">{t('monthReview.title')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('monthReview.description')}</p>
      </div>

      {!ready ? (
        <Alert tone="info">{t('monthReview.gateOff')}</Alert>
      ) : null}

      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}

      <Field label={t('monthReview.yearMonth')}>
        {(control) => (
          <Input
            {...control}
            type="month"
            value={yearMonth}
            onChange={(event) => setYearMonth(event.target.value)}
            dir="ltr"
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-[var(--pf-border-default)] p-3">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('monthReview.cost')}</p>
          <MoneyText value={money(preview.knownAmount, currency)} />
        </div>
        <div className="rounded-md border border-[var(--pf-border-default)] p-3">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('monthReview.allocated')}</p>
          <MoneyText value={money(preview.allocatedAmount, currency)} />
        </div>
        <div className="rounded-md border border-[var(--pf-border-default)] p-3">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('monthReview.unallocated')}</p>
          <MoneyText value={money(preview.unallocatedAmount, currency)} />
        </div>
        <div className="rounded-md border border-[var(--pf-border-default)] p-3">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('monthReview.status')}</p>
          <p className="text-sm font-medium">{t(`monthReview.statuses.${preview.status}`)}</p>
        </div>
      </div>

      <p className="text-sm">
        {t('monthReview.simpleActualLine', {
          name: employeeName,
          amount: preview.knownAmount,
          currency,
        })}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('monthReview.estimated')}
          optionalLabel={tCommon('labels.optional')}
          description={t('monthReview.estimatedHint')}
        >
          {(control) => (
            <MoneyInput
              {...control}
              value={estimated}
              onValueChange={setEstimated}
              currencySymbol={currency}
            />
          )}
        </Field>
        <Field
          label={t('monthReview.actual')}
          optionalLabel={tCommon('labels.optional')}
          description={t('monthReview.actualHint')}
        >
          {(control) => (
            <MoneyInput
              {...control}
              value={actual}
              onValueChange={setActual}
              currencySymbol={currency}
            />
          )}
        </Field>
      </div>

      {!showAdvanced ? (
        <Button type="button" variant="ghost" className="self-start" onClick={() => setShowAdvanced(true)}>
          {tCommon('actions.showAdvanced')}
        </Button>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3">
          <Field label={t('monthReview.method')} description={t('monthReview.methodHint')}>
            {(control) => (
              <Select
                value={method}
                onValueChange={(value) => setMethod(value as MonthlyAllocationMethod)}
              >
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHLY_ALLOCATION_METHODS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {t(`monthReview.methods.${item}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field
            label={t('monthReview.allocatedInput')}
            optionalLabel={tCommon('labels.optional')}
            description={t('monthReview.allocatedInputHint')}
          >
            {(control) => (
              <MoneyInput
                {...control}
                value={allocated}
                onValueChange={setAllocated}
                currencySymbol={currency}
              />
            )}
          </Field>
        </div>
      )}

      <Button
        type="button"
        size="lg"
        block
        variant="secondary"
        disabled={pending}
        onClick={handleSaveDraft}
      >
        {ready ? t('monthReview.saveDraft') : t('monthReview.saveLater')}
      </Button>

      {ready && canManage ? (
        <Button
          type="button"
          size="lg"
          block
          disabled={pending || preview.status === 'over' || preview.status === 'not_started'}
          onClick={handleApply}
        >
          {t('monthReview.applyAllocation')}
        </Button>
      ) : null}

      {savedDraft ? (
        <p className="text-xs text-[var(--pf-text-muted)]">
          {applied ? t('monthReview.applied') : t('monthReview.draftSaved')}
        </p>
      ) : null}

      <p className="text-xs text-[var(--pf-text-muted)]">{t('monthReview.disclaimer')}</p>
    </Card>
  );
}
