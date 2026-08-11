'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import type { MonthCloseAdjustment, MonthClosePeriod } from '../domain/types';
import { statusShape } from '../domain/period-state';
import { CompletenessChecklist } from './completeness-checklist';

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

  useEffect(() => {
    if (!ensureState.periodId) return;
    router.push(`/month-close?periodId=${ensureState.periodId}`);
    router.refresh();
  }, [ensureState.periodId, router]);

  if (!moduleEnabled && !canManage) {
    return (
      <Alert tone="warning">
        <p className="font-medium">{t('moduleOff.title')}</p>
        <p className="mt-1 text-sm">{t('moduleOff.body')}</p>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>

      {!moduleEnabled && canManage ? (
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
                          ? 'w-full rounded-md bg-[var(--pf-bg-muted)] px-2 py-2 text-start text-sm font-medium'
                          : 'w-full rounded-md px-2 py-2 text-start text-sm hover:bg-[var(--pf-bg-muted)]'
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
                <form
                  action={adjFormAction}
                  className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4"
                >
                  <h3 className="font-medium">{t('adjustments.title')}</h3>
                  <p className="text-sm text-[var(--pf-text-secondary)]">{t('adjustments.hint')}</p>
                  <input type="hidden" name="periodId" value={selected.id} />
                  <div>
                    <Label htmlFor="adjustmentType">{t('adjustments.type')}</Label>
                    <select
                      id="adjustmentType"
                      name="adjustmentType"
                      className="mt-1 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm"
                      defaultValue="correction"
                    >
                      <option value="correction">{t('adjustments.types.correction')}</option>
                      <option value="supersede">{t('adjustments.types.supersede')}</option>
                      <option value="adjustment">{t('adjustments.types.adjustment')}</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="reason">{t('adjustments.reason')}</Label>
                    <Textarea id="reason" name="reason" required rows={3} />
                  </div>
                  <Button type="submit" loading={adjPending}>
                    {t('actions.recordAdjustment')}
                  </Button>
                  <ActionAlert state={adjState} savedLabel={t('actions.saved')} />
                </form>
              ) : null}

              {adjustments.length > 0 ? (
                <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
                  <h3 className="mb-2 font-medium">{t('adjustments.history')}</h3>
                  <ul className="flex flex-col gap-2">
                    {adjustments.map((item) => (
                      <li key={item.id} className="text-sm">
                        <span className="font-medium">
                          {t(`adjustments.types.${item.adjustmentType}`)}
                        </span>
                        <span className="text-[var(--pf-text-secondary)]"> — {item.reason}</span>
                      </li>
                    ))}
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
