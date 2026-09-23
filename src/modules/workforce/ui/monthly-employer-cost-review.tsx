'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  applyMonthlyEmployerCostAllocationAction,
  correctMonthlyEmployerCostActualAction,
  returnMonthlyEmployerCostToEstimateAction,
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

export interface MonthlyEmployerCostProjectOption {
  readonly id: string;
  readonly name: string;
}

interface AllocationLineDraft {
  readonly key: string;
  projectId: string;
  percent: string;
  days: string;
  amount: string;
}

export interface MonthlyEmployerCostReviewProps {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly currency: string;
  readonly defaultYearMonth: string;
  readonly projects?: readonly MonthlyEmployerCostProjectOption[];
  /** Permissioned finance / workforce costs viewers only. */
  readonly canReview: boolean;
  /** When true and gate ready, shows Apply (requires cost.manage). */
  readonly canManage?: boolean;
  /** Server-loaded month row for the default month (existing Owner data). */
  readonly initialReview?: MonthlyEmployerCostReviewData | null;
  /** When true, show payroll month-end approval copy (salary alert path). */
  readonly payrollApprovalMode?: boolean;
}

function newLineKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}`;
}

function emptyAllocationLine(projectId = ''): AllocationLineDraft {
  return { key: newLineKey(), projectId, percent: '', days: '', amount: '' };
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
  projects = [],
  canReview,
  canManage = false,
  initialReview = null,
  payrollApprovalMode = false,
}: MonthlyEmployerCostReviewProps) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');
  const ready = areEmployeeMonthCostsAvailable();
  const [pending, startTransition] = useTransition();

  const initialMonth =
    initialReview?.yearMonth === defaultYearMonth ? initialReview?.month : undefined;
  const [yearMonth, setYearMonth] = useState(defaultYearMonth);
  const [estimated, setEstimated] = useState(initialMonth?.estimatedAmount ?? '');
  const [actual, setActual] = useState(initialMonth?.actualAmount ?? initialMonth?.knownAmount ?? '');
  const [allocated, setAllocated] = useState('');
  const [method, setMethod] = useState<MonthlyAllocationMethod>('hours');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [remainderAllocationIntent, setRemainderAllocationIntent] = useState<
    'auto_pool' | 'company_only'
  >('auto_pool');
  const [allocationLines, setAllocationLines] = useState<AllocationLineDraft[]>(() => {
    const fromReview = initialReview?.lines ?? [];
    if (fromReview.length === 0) {
      return [emptyAllocationLine(projects[0]?.id ?? '')];
    }
    return fromReview.map((line) => ({
      key: newLineKey(),
      projectId: line.projectId ?? '',
      percent: line.percent ?? '',
      days: line.basisDays ?? '',
      amount: line.amount ?? '',
    }));
  });

  function buildAllocationLinesJson(): string | undefined {
    const rows = allocationLines
      .filter((line) => line.projectId)
      .map((line) => ({
        projectId: line.projectId,
        percent: method === 'percent' ? line.percent || null : null,
        days: method === 'days' ? line.days || null : null,
        hours: method === 'hours' ? line.days || null : null,
        amount: method === 'fixed_amount' ? line.amount || null : null,
      }));
    return rows.length > 0 ? JSON.stringify(rows) : undefined;
  }

  const preview = useMemo(
    () =>
      previewMonthlyCostStrip({
        estimatedAmount: estimated,
        actualAmount: actual,
        allocatedAmount: allocated,
      }),
    [estimated, actual, allocated],
  );

  const monthStatus = initialMonth?.status ?? null;
  const hasAppliedMonth = monthStatus === 'applied' || monthStatus === 'closed';
  const estimatedNumeric = Number(estimated || initialMonth?.estimatedAmount || 0);
  const actualNumeric = actual.trim() === '' ? null : Number(actual);
  const costDifference =
    actualNumeric != null && Number.isFinite(actualNumeric) && Number.isFinite(estimatedNumeric)
      ? actualNumeric - estimatedNumeric
      : null;

  if (!canReview) return null;

  async function persistMonthCost(): Promise<{ error?: string }> {
    const payload = {
      employeeId,
      yearMonth,
      estimatedAmount: estimated,
      actualAmount: actual.trim() === '' ? null : actual,
    };
    if (hasAppliedMonth) {
      return correctMonthlyEmployerCostActualAction({
        ...payload,
        correctionNote: null,
      });
    }
    return saveMonthlyEmployerCostDraftAction({
      employeeId: payload.employeeId,
      yearMonth: payload.yearMonth,
      estimatedAmount: payload.estimatedAmount,
      actualAmount: payload.actualAmount ?? undefined,
      method: showAdvanced ? method : undefined,
      allocationLinesJson: showAdvanced ? buildAllocationLinesJson() : undefined,
      remainderAllocationIntent:
        Number(preview.unallocatedAmount) > 0 ? remainderAllocationIntent : undefined,
    });
  }

  function handleSaveDraft() {
    setActionError(null);
    if (!ready) {
      setSavedDraft(true);
      return;
    }
    startTransition(async () => {
      const result = await persistMonthCost();
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setSavedDraft(true);
      setApplied(hasAppliedMonth);
    });
  }

  function handleApply() {
    setActionError(null);
    if (!ready || !canManage) return;
    startTransition(async () => {
      const saveResult = await persistMonthCost();
      if (saveResult.error) {
        setActionError(saveResult.error);
        return;
      }
      if (hasAppliedMonth) {
        setSavedDraft(true);
        setApplied(true);
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

  function handleReturnToEstimate() {
    setActionError(null);
    if (!ready || !canManage) return;
    startTransition(async () => {
      const result = await returnMonthlyEmployerCostToEstimateAction({
        employeeId,
        yearMonth,
      });
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setActual('');
      setSavedDraft(true);
      setApplied(true);
    });
  }

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="text-start">
        <h2 className="text-base font-semibold">
          {payrollApprovalMode ? t('monthReview.payrollTitle') : t('monthReview.title')}
        </h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {payrollApprovalMode ? t('monthReview.payrollDescription') : t('monthReview.description')}
        </p>
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

      {actualNumeric == null ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('monthReview.noActualHint')}</p>
      ) : null}

      {costDifference != null ? (
        <div className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm">
          <p>
            {t('monthReview.estimatedEmployerCost')}:{' '}
            <MoneyText value={money(String(estimatedNumeric), currency)} />
          </p>
          <p>
            {t('monthReview.actualEmployerCost')}:{' '}
            <MoneyText value={money(String(actualNumeric), currency)} />
          </p>
          <p>
            {t('monthReview.costDifference')}:{' '}
            <MoneyText
              value={money(String(costDifference), currency)}
              className={costDifference >= 0 ? 'text-[var(--pf-text-primary)]' : undefined}
            />
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('monthReview.estimatedEmployerCost')}
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
          label={t('monthReview.actualEmployerCost')}
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

      {Number(preview.unallocatedAmount) > 0 ? (
        <Field label={t('monthReview.remainderIntent')}>
          {(control) => (
            <Select
              value={remainderAllocationIntent}
              onValueChange={(value) =>
                setRemainderAllocationIntent(value as typeof remainderAllocationIntent)
              }
            >
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto_pool">{t('monthReview.remainderAutoPool')}</SelectItem>
                <SelectItem value="company_only">
                  {t('monthReview.remainderCompanyOnly')}
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      ) : null}

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
          {projects.length > 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium text-[var(--pf-text-secondary)]">
                {t('monthReview.projectLinesTitle')}
              </p>
              {allocationLines.map((line, index) => (
                <div
                  key={line.key}
                  className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3"
                >
                  <Field label={t('monthReview.projectLine', { row: index + 1 })}>
                    {(control) => (
                      <Select
                        value={line.projectId}
                        onValueChange={(value) =>
                          setAllocationLines((prev) =>
                            prev.map((item) =>
                              item.key === line.key ? { ...item, projectId: value } : item,
                            ),
                          )
                        }
                      >
                        <SelectTrigger id={control.id}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                  {method === 'percent' ? (
                    <Field label={t('monthReview.methods.percent')}>
                      {(control) => (
                        <Input
                          {...control}
                          inputMode="decimal"
                          value={line.percent}
                          onChange={(event) =>
                            setAllocationLines((prev) =>
                              prev.map((item) =>
                                item.key === line.key
                                  ? { ...item, percent: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          dir="ltr"
                        />
                      )}
                    </Field>
                  ) : null}
                  {method === 'days' || method === 'hours' ? (
                    <Field
                      label={
                        method === 'days'
                          ? t('monthReview.methods.days')
                          : t('monthReview.methods.hours')
                      }
                    >
                      {(control) => (
                        <Input
                          {...control}
                          inputMode="decimal"
                          value={line.days}
                          onChange={(event) =>
                            setAllocationLines((prev) =>
                              prev.map((item) =>
                                item.key === line.key
                                  ? { ...item, days: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          dir="ltr"
                        />
                      )}
                    </Field>
                  ) : null}
                  {method === 'fixed_amount' ? (
                    <Field label={t('monthReview.methods.fixed_amount')}>
                      {(control) => (
                        <MoneyInput
                          {...control}
                          value={line.amount}
                          onValueChange={(value) =>
                            setAllocationLines((prev) =>
                              prev.map((item) =>
                                item.key === line.key ? { ...item, amount: value } : item,
                              ),
                            )
                          }
                          currencySymbol={currency}
                        />
                      )}
                    </Field>
                  ) : null}
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() =>
                  setAllocationLines((prev) => [
                    ...prev,
                    emptyAllocationLine(projects[0]?.id ?? ''),
                  ])
                }
              >
                {t('monthReview.addProjectLine')}
              </Button>
            </div>
          ) : (
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
          )}
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
          {payrollApprovalMode
            ? t('monthReview.confirmPayrollMonth')
            : t('monthReview.applyAllocation')}
        </Button>
      ) : null}

      {ready && canManage && initialMonth?.actualAmount ? (
        <Button
          type="button"
          variant="secondary"
          size="lg"
          block
          disabled={pending}
          onClick={handleReturnToEstimate}
        >
          {t('monthReview.returnToEstimate')}
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
