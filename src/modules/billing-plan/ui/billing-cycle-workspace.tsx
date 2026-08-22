'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter, Link } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { formatMoneyAmountForInput, MoneyInput } from '@/components/patterns/money-input';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  deriveAmountFromPercent,
  derivePercentFromAmount,
} from '@/modules/billing-plan/domain/line-math';
import { money, toNumericString } from '@/shared/money';
import {
  createBillingCycleAction,
  issueBillingCycleAction,
  updateCycleLinesAction,
  type BillingPlanActionState,
} from './billing-plan-actions';

export interface CycleLineDraft {
  readonly planLineId: string;
  readonly label: string;
  readonly baseAmount: string;
  readonly priorPercent: string;
  readonly priorAmount: string;
  readonly currentPercent: string;
  readonly currentAmount: string;
  readonly cumulativePercent: string;
  readonly cumulativeAmount: string;
  readonly remainingAmount: string;
  readonly retentionAmount: string;
}

export interface CycleListItem {
  readonly id: string;
  readonly cycleNumber: number;
  readonly title: string;
  readonly status: string;
  readonly accountDate: string;
  readonly billingRecordId: string | null;
}

interface BillingCycleWorkspaceProps {
  readonly projectId: string;
  readonly planId: string;
  readonly planStatus: string;
  readonly currency: string;
  readonly currencySymbol: string;
  readonly canManage: boolean;
  readonly defaultAccountDate: string;
  readonly cycles: readonly CycleListItem[];
  readonly activeCycleId: string | null;
  readonly activeLines: readonly CycleLineDraft[];
  readonly activeTotals?: { currentAmount: string; retentionAmount: string };
}

function displayPercent(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

export function BillingCycleWorkspace({
  projectId,
  planId,
  planStatus,
  currency,
  currencySymbol,
  canManage,
  defaultAccountDate,
  cycles,
  activeCycleId,
  activeLines: initialLines,
  activeTotals,
}: BillingCycleWorkspaceProps) {
  const t = useTranslations('billingPlan');
  const router = useRouter();
  const [lines, setLines] = useState<CycleLineDraft[]>(() => [...initialLines]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createState, createAction, createPending] = useActionState<
    BillingPlanActionState,
    FormData
  >(createBillingCycleAction, {});

  const activeCycle = cycles.find((c) => c.id === activeCycleId);
  // Fully-paid lock is enforced server-side; UI allows edit for all non-void statuses.
  const mutable =
    Boolean(canManage && activeCycleId) && activeCycle?.status !== 'void';

  const displayError = error ?? createState.error;
  const totals = activeTotals ?? { currentAmount: '0', retentionAmount: '0' };

  useEffect(() => {
    if (createState.success && createState.cycleId) {
      router.replace(`/projects/${projectId}?tab=billingPlan&cycleId=${createState.cycleId}`);
      router.refresh();
    }
  }, [createState.success, createState.cycleId, projectId, router]);

  useEffect(() => {
    setLines([...initialLines]);
  }, [initialLines]);

  function patchLine(planLineId: string, patch: Partial<CycleLineDraft>) {
    setLines((prev) =>
      prev.map((row) => (row.planLineId === planLineId ? { ...row, ...patch } : row)),
    );
  }

  function onCurrentPercent(planLineId: string, raw: string, baseAmount: string) {
    const trimmed = raw.trim();
    if (!trimmed || !baseAmount || baseAmount === '0') {
      patchLine(planLineId, { currentPercent: trimmed });
      return;
    }
    try {
      const amount = toNumericString(deriveAmountFromPercent(money(baseAmount, currency), trimmed));
      patchLine(planLineId, { currentPercent: trimmed, currentAmount: amount });
    } catch {
      patchLine(planLineId, { currentPercent: trimmed });
    }
  }

  function onCurrentAmount(planLineId: string, raw: string, baseAmount: string) {
    if (!baseAmount || baseAmount === '0') {
      patchLine(planLineId, { currentAmount: raw });
      return;
    }
    try {
      const pct = derivePercentFromAmount(money(baseAmount, currency), money(raw || '0', currency));
      patchLine(planLineId, { currentAmount: raw, currentPercent: pct });
    } catch {
      patchLine(planLineId, { currentAmount: raw });
    }
  }

  function saveLines() {
    if (!activeCycleId) return;
    setError(null);
    startTransition(async () => {
      const result = await updateCycleLinesAction({
        projectId,
        cycleId: activeCycleId,
        lines: lines.map((line) => ({
          planLineId: line.planLineId,
          currentPercent: line.currentPercent || null,
          currentAmount: line.currentAmount || null,
        })),
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function issueCycle() {
    if (!activeCycleId) return;
    if (!window.confirm(t('cycles.issueConfirm'))) return;
    setError(null);
    startTransition(async () => {
      const result = await issueBillingCycleAction({
        projectId,
        cycleId: activeCycleId,
        finalize: true,
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="billing-cycle-workspace">
      <h3 className="text-sm font-semibold">{t('cycles.title')}</h3>
      {displayError ? <Alert tone="danger">{displayError}</Alert> : null}
      <p className="text-xs text-[var(--pf-text-muted)]">{t('integrity.billingNotPayment')}</p>

      {canManage && planStatus === 'active' ? (
        <form
          action={createAction}
          className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
        >
          <p className="text-sm font-medium">{t('actions.createCycle')}</p>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="planId" value={planId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('fields.cycleTitle')}>
              {(control) => (
                <Input
                  {...control}
                  name="title"
                  required
                  placeholder={t('cycles.newTitlePlaceholder')}
                />
              )}
            </Field>
            <Field label={t('fields.accountDate')}>
              {(control) => (
                <Input
                  {...control}
                  name="accountDate"
                  type="date"
                  dir="ltr"
                  required
                  defaultValue={defaultAccountDate}
                />
              )}
            </Field>
          </div>
          <Button type="submit" loading={createPending} className="self-start">
            {t('actions.createCycle')}
          </Button>
        </form>
      ) : null}

      {cycles.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('cycles.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cycles.map((cycle) => {
            const selected = cycle.id === activeCycleId;
            const href = `/projects/${projectId}?tab=billingPlan&cycleId=${cycle.id}`;
            return (
              <li
                key={cycle.id}
                className={
                  selected
                    ? 'rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2'
                    : 'rounded-md border border-transparent px-3 py-2'
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={href} className="text-sm font-medium hover:underline">
                    #{cycle.cycleNumber} · {cycle.title} ·{' '}
                    {t(`cycleStatus.${cycle.status}` as never)}
                  </Link>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/projects/${projectId}/billing-plan/cycles/${cycle.id}/print`}
                      className="text-xs text-[var(--pf-text-secondary)] hover:underline"
                    >
                      {t('cycles.printPreview')}
                    </Link>
                    {cycle.billingRecordId ? (
                      <Link
                        href={`/billing/${cycle.billingRecordId}`}
                        className="text-xs text-[var(--pf-text-secondary)] hover:underline"
                      >
                        {t('actions.viewBilling')}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {activeCycleId && lines.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-3" data-testid="cycle-line-editor">
          <h4 className="text-sm font-medium">{t('cycles.draftWorkspace')}</h4>
          <div className="flex flex-col gap-3 md:hidden">
            {lines.map((line) => (
              <article
                key={line.planLineId}
                className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] p-3"
              >
                <p className="font-medium">{line.label}</p>
                <Field label={t('lines.currentPercent')}>
                  {(control) => (
                    <Input
                      {...control}
                      inputMode="decimal"
                      dir="ltr"
                      value={displayPercent(line.currentPercent)}
                      disabled={!mutable}
                      onChange={(e) =>
                        onCurrentPercent(line.planLineId, e.target.value, line.baseAmount)
                      }
                    />
                  )}
                </Field>
                <Field label={t('lines.currentAmount')}>
                  {(control) => (
                    <MoneyInput
                      {...control}
                      value={formatMoneyAmountForInput(line.currentAmount || '', currency)}
                      currency={currency}
                      currencySymbol={currencySymbol}
                      disabled={!mutable}
                      onValueChange={(next) =>
                        onCurrentAmount(line.planLineId, next, line.baseAmount)
                      }
                    />
                  )}
                </Field>
              </article>
            ))}
          </div>
          <div className="hidden min-w-0 overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('lines.label')}</TableHead>
                  <TableHead>{t('lines.base')}</TableHead>
                  <TableHead>{t('lines.priorPercent')}</TableHead>
                  <TableHead>{t('lines.priorAmount')}</TableHead>
                  <TableHead>{t('lines.currentPercent')}</TableHead>
                  <TableHead>{t('lines.currentAmount')}</TableHead>
                  <TableHead>{t('lines.cumPercent')}</TableHead>
                  <TableHead>{t('lines.cumAmount')}</TableHead>
                  <TableHead>{t('lines.retention')}</TableHead>
                  <TableHead>{t('lines.remaining')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.planLineId}>
                    <TableCell>{line.label}</TableCell>
                    <TableCell dir="ltr">{formatMoneyAmountForInput(line.baseAmount, currency)}</TableCell>
                    <TableCell dir="ltr">{displayPercent(line.priorPercent)}</TableCell>
                    <TableCell dir="ltr">{formatMoneyAmountForInput(line.priorAmount, currency)}</TableCell>
                    <TableCell className="min-w-[5rem]">
                      <Input
                        inputMode="decimal"
                        dir="ltr"
                        value={displayPercent(line.currentPercent)}
                        disabled={!mutable}
                        onChange={(e) =>
                          onCurrentPercent(line.planLineId, e.target.value, line.baseAmount)
                        }
                      />
                    </TableCell>
                    <TableCell className="min-w-[7rem]">
                      <MoneyInput
                        value={formatMoneyAmountForInput(line.currentAmount || '', currency)}
                        currency={currency}
                        currencySymbol={currencySymbol}
                        disabled={!mutable}
                        onValueChange={(next) =>
                          onCurrentAmount(line.planLineId, next, line.baseAmount)
                        }
                      />
                    </TableCell>
                    <TableCell dir="ltr">{displayPercent(line.cumulativePercent)}</TableCell>
                    <TableCell dir="ltr">{formatMoneyAmountForInput(line.cumulativeAmount, currency)}</TableCell>
                    <TableCell dir="ltr">{formatMoneyAmountForInput(line.retentionAmount, currency)}</TableCell>
                    <TableCell dir="ltr">{formatMoneyAmountForInput(line.remainingAmount, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span>
              {t('cycles.totalsCurrent')}:{' '}
              <MoneyText value={money(totals.currentAmount || '0', currency)} />
            </span>
            <span>
              {t('cycles.totalsRetention')}:{' '}
              <MoneyText value={money(totals.retentionAmount || '0', currency)} />
            </span>
          </div>
          {mutable ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={saveLines} loading={pending}>
                {t('actions.updateCycle')}
              </Button>
              <Button type="button" variant="secondary" onClick={issueCycle} loading={pending}>
                {t('actions.issueCycle')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
