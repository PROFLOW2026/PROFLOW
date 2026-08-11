'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { MoneyText } from '@/components/patterns/money-text';
import {
  explainMonthCloseAdjustments,
  isEconomicAdjustment,
  supersededAdjustmentIds,
} from '../domain/economic-corrections';
import type {
  MonthCloseAdjustment,
  MonthClosePeriod,
  MonthCloseProjectOption,
} from '../domain/types';
import { statusShape } from '../domain/period-state';
import { CompletenessChecklist } from './completeness-checklist';

const selectClass =
  'mt-1 min-h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm';

export type MonthCloseActionState = {
  ok?: boolean;
  error?: string;
  periodId?: string;
};

export interface MonthClosePanelProps {
  readonly periods: readonly MonthClosePeriod[];
  readonly selected: MonthClosePeriod | null;
  readonly adjustments: readonly MonthCloseAdjustment[];
  readonly canManage: boolean;
  readonly suggestedYearMonth: string;
  readonly projectOptions: readonly MonthCloseProjectOption[];
  readonly baseCurrency: string;
  readonly moduleEnabled: boolean;
  readonly ensureAction: (
    prev: MonthCloseActionState,
    formData: FormData,
  ) => Promise<MonthCloseActionState>;
  readonly refreshAction: (
    prev: MonthCloseActionState,
    formData: FormData,
  ) => Promise<MonthCloseActionState>;
  readonly markReadyAction: (
    prev: MonthCloseActionState,
    formData: FormData,
  ) => Promise<MonthCloseActionState>;
  readonly demoteAction: (
    prev: MonthCloseActionState,
    formData: FormData,
  ) => Promise<MonthCloseActionState>;
  readonly closeAction: (
    prev: MonthCloseActionState,
    formData: FormData,
  ) => Promise<MonthCloseActionState>;
  readonly adjustmentAction: (
    prev: MonthCloseActionState,
    formData: FormData,
  ) => Promise<MonthCloseActionState>;
}

function ActionAlert({
  state,
  savedLabel,
}: {
  state: MonthCloseActionState;
  savedLabel: string;
}) {
  if (state.error) {
    return (
      <Alert tone="danger" className="mt-2">
        {state.error}
      </Alert>
    );
  }
  if (state.ok) {
    return (
      <Alert tone="success" className="mt-2" role="status" aria-live="polite">
        {savedLabel}
      </Alert>
    );
  }
  return null;
}

export function MonthClosePanel({
  periods,
  selected,
  adjustments,
  canManage,
  suggestedYearMonth,
  projectOptions,
  baseCurrency,
  moduleEnabled,
  ensureAction,
  refreshAction,
  markReadyAction,
  demoteAction,
  closeAction,
  adjustmentAction,
}: MonthClosePanelProps) {
  const t = useTranslations('monthClose');
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [ensureState, ensureFormAction, ensurePending] = useActionState(
    ensureAction,
    {} as MonthCloseActionState,
  );
  const [refreshState, refreshFormAction, refreshPending] = useActionState(
    refreshAction,
    {} as MonthCloseActionState,
  );
  const [readyState, readyFormAction, readyPending] = useActionState(
    markReadyAction,
    {} as MonthCloseActionState,
  );
  const [demoteState, demoteFormAction, demotePending] = useActionState(
    demoteAction,
    {} as MonthCloseActionState,
  );
  const [closeState, closeFormAction, closePending] = useActionState(
    closeAction,
    {} as MonthCloseActionState,
  );
  const [adjState, adjFormAction, adjPending] = useActionState(
    adjustmentAction,
    {} as MonthCloseActionState,
  );
  const [yearMonth, setYearMonth] = useState(suggestedYearMonth);
  const explanations = useMemo(
    () => explainMonthCloseAdjustments(adjustments),
    [adjustments],
  );
  const supersededIds = useMemo(() => supersededAdjustmentIds(adjustments), [adjustments]);
  const supersedeCandidates = useMemo(
    () =>
      adjustments.filter(
        (item) => isEconomicAdjustment(item) && !supersededIds.has(item.id),
      ),
    [adjustments, supersededIds],
  );

  useEffect(() => {
    if (!ensureState.periodId) return;
    router.push(`/month-close?periodId=${ensureState.periodId}`);
    router.refresh();
  }, [ensureState.periodId, router]);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>

      {!moduleEnabled ? (
        <Alert tone="warning">
          <p className="font-medium">{t('moduleOff.title')}</p>
          <p className="mt-1 text-sm">{t('moduleOff.body')}</p>
        </Alert>
      ) : null}

      {canManage ? (
        <form action={ensureFormAction} className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="yearMonth">{t('form.yearMonth')}</Label>
            <Input
              id="yearMonth"
              name="yearMonth"
              value={yearMonth}
              onChange={(event) => setYearMonth(event.target.value)}
              placeholder="YYYY-MM"
              required
            />
          </div>
          <Button type="submit" loading={ensurePending}>
            {t('actions.openPeriod')}
          </Button>
          <ActionAlert state={ensureState} savedLabel={t('actions.saved')} />
        </form>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <aside className="rounded-lg border border-[var(--pf-border-default)] p-2">
          <p className="px-2 pb-2 text-xs font-semibold tracking-wide text-[var(--pf-text-secondary)] uppercase">
            {t('periods.title')}
          </p>
          {periods.length === 0 ? (
            <p className="px-2 py-3 text-sm text-[var(--pf-text-muted)]">{t('periods.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {periods.map((period) => {
                const active = selected?.id === period.id;
                return (
                  <li key={period.id}>
                    <button
                      type="button"
                      className={
                        active
                          ? 'min-h-11 w-full rounded-md bg-[var(--pf-bg-muted)] px-2 py-2 text-start text-sm font-medium'
                          : 'min-h-11 w-full rounded-md px-2 py-2 text-start text-sm hover:bg-[var(--pf-bg-muted)]'
                      }
                      onClick={() => {
                        startTransition(() => {
                          router.push(`?periodId=${period.id}`);
                        });
                      }}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span>{period.yearMonth}</span>
                        <StatusBadge
                          shape={statusShape(period.status)}
                          label={t(`status.${period.status}`)}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          {!selected ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.select')}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
                <div>
                  <h2 className="text-lg font-semibold">{selected.yearMonth}</h2>
                  <StatusBadge
                    shape={statusShape(selected.status)}
                    label={t(`status.${selected.status}`)}
                    className="mt-1"
                  />
                </div>
                {selected.status !== 'closed' && canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <form action={refreshFormAction}>
                      <input type="hidden" name="periodId" value={selected.id} />
                      <Button type="submit" variant="secondary" size="sm" loading={refreshPending}>
                        {t('actions.refresh')}
                      </Button>
                    </form>
                    {selected.status === 'open' ? (
                      <form action={readyFormAction}>
                        <input type="hidden" name="periodId" value={selected.id} />
                        <Button type="submit" size="sm" loading={readyPending}>
                          {t('actions.markReady')}
                        </Button>
                      </form>
                    ) : null}
                    {selected.status === 'ready' ? (
                      <>
                        <form action={demoteFormAction}>
                          <input type="hidden" name="periodId" value={selected.id} />
                          <Button type="submit" variant="secondary" size="sm" loading={demotePending}>
                            {t('actions.demote')}
                          </Button>
                        </form>
                        <form action={closeFormAction} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="periodId" value={selected.id} />
                          <Button type="submit" size="sm" loading={closePending}>
                            {t('actions.close')}
                          </Button>
                        </form>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <ActionAlert state={refreshState} savedLabel={t('actions.saved')} />
              <ActionAlert state={readyState} savedLabel={t('actions.saved')} />
              <ActionAlert state={demoteState} savedLabel={t('actions.saved')} />
              <ActionAlert state={closeState} savedLabel={t('actions.saved')} />

              {selected.status === 'closed' ? (
                <Alert tone="warning">{t('closed.notice')}</Alert>
              ) : null}

              <CompletenessChecklist snapshot={selected.completenessSnapshot} />

              {selected.status === 'closed' && canManage ? (
                <EconomicAdjustmentForm
                  key={selected.id}
                  periodId={selected.id}
                  baseCurrency={baseCurrency}
                  projectOptions={projectOptions}
                  supersedeCandidates={supersedeCandidates}
                  formAction={adjFormAction}
                  pending={adjPending}
                  state={adjState}
                />
              ) : null}

              {explanations.length > 0 ? (
                <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
                  <h3 className="mb-1 font-medium">{t('adjustments.history')}</h3>
                  <p className="mb-3 text-sm text-[var(--pf-text-secondary)]">
                    {t('adjustments.explainability')}
                  </p>
                  <ul className="flex flex-col gap-3">
                    {explanations.map((item) => {
                      const { adjustment } = item;
                      const statusKey = item.isSuperseded
                        ? 'superseded'
                        : item.isEconomic
                          ? 'activeInTotals'
                          : 'auditOnly';
                      return (
                        <li
                          key={adjustment.id}
                          className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">
                              {t(`adjustments.types.${adjustment.adjustmentType}`)}
                              {adjustment.effectSide
                                ? ` · ${t(`adjustments.sides.${adjustment.effectSide}`)}`
                                : null}
                            </span>
                            <StatusBadge
                              shape={
                                item.isSuperseded
                                  ? 'draft'
                                  : item.isEconomic
                                    ? 'completed'
                                    : 'pending'
                              }
                              label={t(`adjustments.${statusKey}`)}
                            />
                          </div>
                          {adjustment.projectName || adjustment.projectId ? (
                            <p className="mt-1 text-[var(--pf-text-secondary)]">
                              {adjustment.projectName ?? t('adjustments.noProject')}
                            </p>
                          ) : null}
                          {item.isEconomic ? (
                            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              {item.originalAmount ? (
                                <span>
                                  <span className="text-[var(--pf-text-muted)]">
                                    {t('adjustments.original')}:{' '}
                                  </span>
                                  <MoneyText
                                    value={item.originalAmount}
                                    className="line-through opacity-70"
                                  />
                                </span>
                              ) : null}
                              {item.correctionAmount ? (
                                <span>
                                  <span className="text-[var(--pf-text-muted)]">
                                    {t('adjustments.correction')}:{' '}
                                  </span>
                                  <MoneyText
                                    value={item.correctionAmount}
                                    className={
                                      item.isSuperseded ? 'line-through opacity-70' : undefined
                                    }
                                  />
                                </span>
                              ) : null}
                            </p>
                          ) : null}
                          <p className="mt-1 text-[var(--pf-text-secondary)]">{adjustment.reason}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function EconomicAdjustmentForm({
  periodId,
  baseCurrency,
  projectOptions,
  supersedeCandidates,
  formAction,
  pending,
  state,
}: {
  readonly periodId: string;
  readonly baseCurrency: string;
  readonly projectOptions: readonly MonthCloseProjectOption[];
  readonly supersedeCandidates: readonly MonthCloseAdjustment[];
  readonly formAction: (formData: FormData) => void;
  readonly pending: boolean;
  readonly state: MonthCloseActionState;
}) {
  const t = useTranslations('monthClose');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(baseCurrency);
  const [effectSide, setEffectSide] = useState<'cost' | 'revenue' | ''>('');
  const [projectId, setProjectId] = useState('');
  const [supersedeId, setSupersedeId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'correction' | 'supersede' | 'adjustment'>(
    'correction',
  );
  const economic = amount.trim().length > 0;

  function handleSupersedeChange(nextId: string) {
    setSupersedeId(nextId);
    if (!nextId) {
      setAdjustmentType((current) => (current === 'supersede' ? 'correction' : current));
      return;
    }
    const target = supersedeCandidates.find((row) => row.id === nextId);
    setAdjustmentType('supersede');
    if (!target) return;
    if (target.currency) setCurrency(target.currency);
    if (target.effectSide) setEffectSide(target.effectSide);
    if (target.projectId) setProjectId(target.projectId);
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4"
    >
      <h3 className="font-medium">{t('adjustments.title')}</h3>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('adjustments.hint')}</p>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('adjustments.economicHint')}</p>
      <input type="hidden" name="periodId" value={periodId} />
      <div>
        <Label htmlFor="adjustmentType">{t('adjustments.type')}</Label>
        <select
          id="adjustmentType"
          name="adjustmentType"
          className={selectClass}
          value={adjustmentType}
          onChange={(event) =>
            setAdjustmentType(event.target.value as 'correction' | 'supersede' | 'adjustment')
          }
        >
          <option value="correction">{t('adjustments.types.correction')}</option>
          <option value="supersede">{t('adjustments.types.supersede')}</option>
          <option value="adjustment">{t('adjustments.types.adjustment')}</option>
        </select>
      </div>
      <div>
        <Label htmlFor="amount">{t('adjustments.amount')}</Label>
        <Input
          id="amount"
          name="amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          dir="ltr"
          className="pf-numeric mt-1"
          placeholder="0.00"
        />
      </div>
      <div>
        <Label htmlFor="currency">{t('adjustments.currency')}</Label>
        <Input
          id="currency"
          name="currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          maxLength={3}
          required={economic}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="effectSide">{t('adjustments.effectSide')}</Label>
        <select
          id="effectSide"
          name="effectSide"
          className={selectClass}
          value={effectSide}
          onChange={(event) => setEffectSide(event.target.value as 'cost' | 'revenue' | '')}
          required={economic}
        >
          <option value="">{t('adjustments.sidePlaceholder')}</option>
          <option value="cost">{t('adjustments.sides.cost')}</option>
          <option value="revenue">{t('adjustments.sides.revenue')}</option>
        </select>
      </div>
      <div>
        <Label htmlFor="projectId">{t('adjustments.project')}</Label>
        <select
          id="projectId"
          name="projectId"
          className={selectClass}
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          required={economic}
        >
          <option value="">{t('adjustments.projectPlaceholder')}</option>
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      {supersedeCandidates.length > 0 ? (
        <div>
          <Label htmlFor="supersedesAdjustmentId">{t('adjustments.supersede')}</Label>
          <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('adjustments.supersedeHint')}</p>
          <select
            id="supersedesAdjustmentId"
            name="supersedesAdjustmentId"
            className={selectClass}
            value={supersedeId}
            onChange={(event) => handleSupersedeChange(event.target.value)}
            required={adjustmentType === 'supersede'}
          >
            <option value="">{t('adjustments.supersedeNone')}</option>
            {supersedeCandidates.map((row) => (
              <option key={row.id} value={row.id}>
                {(row.projectName ?? t('adjustments.noProject')) +
                  ' · ' +
                  t(`adjustments.sides.${row.effectSide ?? 'cost'}`) +
                  (row.amount && row.currency ? ` · ${row.amount} ${row.currency}` : '')}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <Label htmlFor="reason">{t('adjustments.reason')}</Label>
        <Textarea id="reason" name="reason" required rows={3} />
      </div>
      <Button type="submit" loading={pending}>
        {t('actions.recordAdjustment')}
      </Button>
      <ActionAlert state={state} savedLabel={t('actions.saved')} />
    </form>
  );
}
