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
import { money, subtractMoney, toNumericString } from '@/shared/money';
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
  readonly defaultRetentionPercent?: string | null;
  readonly cycles: readonly CycleListItem[];
  readonly activeCycleId: string | null;
  readonly activeLines: readonly CycleLineDraft[];
  readonly activeTotals?: { currentAmount: string; retentionAmount: string };
  readonly retentionAccumulated?: string;
}

function displayPercent(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

export function BillingCycleWorkspace(props: BillingCycleWorkspaceProps) {
  return (
    <BillingCycleWorkspaceInner
      key={props.activeCycleId ?? 'no-cycle'}
      {...props}
    />
  );
}

function BillingCycleWorkspaceInner({
  projectId,
  planId,
  planStatus,
  currency,
  currencySymbol,
  canManage,
  defaultAccountDate,
  defaultRetentionPercent,
  cycles,
  activeCycleId,
  activeLines: initialLines,
  activeTotals,
  retentionAccumulated,
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
  const netPayable = toNumericString(
    subtractMoney(
      money(totals.currentAmount || '0', currency),
      money(totals.retentionAmount || '0', currency),
    ),
  );

  useEffect(() => {
    if (createState.success && createState.cycleId) {
      router.replace(`/projects/${projectId}?tab=billingPlan&cycleId=${createState.cycleId}`);
    }
  }, [createState.success, createState.cycleId, projectId, router]);

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
                className="flex flex-col gap-2 rounded-lg bg-[var(--pf-bg-muted)]/30 p-3"
              >
                <p className="font-medium">{line.label}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-[var(--pf-text-muted)]">{t('lines.base')}</p>
                    <p dir="ltr">{formatMoneyAmountForInput(line.baseAmount, currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--pf-text-muted)]">{t('lines.priorPercent')}</p>
                    <p dir="ltr">{displayPercent(line.priorPercent)}</p>
                  </div>
                </div>
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
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-[var(--pf-text-muted)]">{t('lines.cumPercent')}</p>
                    <p dir="ltr">{displayPercent(line.cumulativePercent)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--pf-text-muted)]">{t('lines.remaining')}</p>
                    <p dir="ltr">{formatMoneyAmountForInput(line.remainingAmount, currency)}</p>
                  </div>
                </div>
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
                    <TableCell dir="ltr">{formatMoneyAmountForInput(line.remainingAmount, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div
            className="grid min-w-0 gap-3 rounded-md bg-[var(--pf-bg-muted)]/40 p-4 sm:grid-cols-2 lg:grid-cols-5"
            data-testid="cycle-account-summary"
          >
            <div>
              <p className="text-xs text-[var(--pf-text-muted)]">{t('cycles.accountApproved')}</p>
              <p className="font-semibold">
                <MoneyText value={money(totals.currentAmount || '0', currency)} />
              </p>
            </div>
            {defaultRetentionPercent ? (
              <div>
                <p className="text-xs text-[var(--pf-text-muted)]">{t('cycles.accountRetentionPct')}</p>
                <p className="font-semibold" dir="ltr">
                  {displayPercent(defaultRetentionPercent)}%
                </p>
              </div>
            ) : null}
            <div>
              <p className="text-xs text-[var(--pf-text-muted)]">{t('cycles.accountRetentionHeld')}</p>
              <p className="font-semibold">
                <MoneyText value={money(totals.retentionAmount || '0', currency)} />
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--pf-text-muted)]">{t('cycles.accountNetPayable')}</p>
              <p className="font-semibold">
                <MoneyText value={money(netPayable, currency)} />
              </p>
            </div>
            {retentionAccumulated ? (
              <div>
                <p className="text-xs text-[var(--pf-text-muted)]">
                  {t('cycles.accountRetentionAccumulated')}
                </p>
                <p className="font-semibold">
                  <MoneyText value={money(retentionAccumulated, currency)} />
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span>
              {t('cycles.totalsCurrent')}:{' '}
              <MoneyText value={money(totals.currentAmount || '0', currency)} />
            </span>
            {defaultRetentionPercent ? (
              <span className="text-[var(--pf-text-muted)]">
                {t('retention.globalLabel')}: {displayPercent(defaultRetentionPercent)} ·{' '}
                {t('cycles.totalsRetention')}:{' '}
                <MoneyText value={money(totals.retentionAmount || '0', currency)} />
              </span>
            ) : (
              <span>
                {t('cycles.totalsRetention')}:{' '}
                <MoneyText value={money(totals.retentionAmount || '0', currency)} />
              </span>
            )}
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
