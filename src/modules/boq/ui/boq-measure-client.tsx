'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { cn } from '@/shared/ui/cn';
import type { FieldMeasureItemDto } from '../domain/field-measure';
import { createProgressBatchAction, type BoqFormState } from './actions';

export interface BoqMeasureClientProps {
  readonly projectId: string;
  readonly boqId: string;
  readonly items: readonly FieldMeasureItemDto[];
  readonly defaultPeriodLabel: string;
  readonly canSubmit: boolean;
  readonly submitAction?: (prev: BoqFormState, formData: FormData) => Promise<BoqFormState>;
}

function ActionMessage({ state }: { state: BoqFormState }) {
  if (!state.error && !state.message) return null;
  return (
    <p
      className={cn(
        'text-sm text-start',
        state.error ? 'text-[var(--pf-status-danger-fg)]' : 'text-[var(--pf-text-secondary)]',
      )}
      role={state.error ? 'alert' : undefined}
    >
      {state.error ?? state.message}
    </p>
  );
}

export function BoqMeasureClient({
  projectId,
  boqId,
  items,
  defaultPeriodLabel,
  canSubmit,
  submitAction = createProgressBatchAction,
}: BoqMeasureClientProps) {
  const t = useTranslations('boq.measure');
  const tCommon = useTranslations('common');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [progressState, progressAction, progressPending] = useActionState(submitAction, {});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = `${item.itemCode ?? ''} ${item.description} ${item.chapterLabel ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  const selected = filtered.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('search')}
        className="min-h-12 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-3 text-base"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('emptyList')}</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2">
          {filtered.map((item) => {
            const isSelected = item.id === selectedId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : item.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex min-h-14 w-full min-w-0 flex-col gap-1 rounded-lg border p-4 text-start',
                    'border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]',
                    'active:scale-[0.99]',
                    isSelected
                      ? 'border-[var(--pf-text-brand)] ring-1 ring-[var(--pf-text-brand)]'
                      : '',
                  )}
                >
                  <p className="text-xs text-[var(--pf-text-muted)]">
                    {item.itemCode ? item.itemCode : t('noCode')}
                    {item.unit ? ` · ${item.unit}` : null}
                    {item.chapterLabel ? ` · ${item.chapterLabel}` : null}
                  </p>
                  <p className="text-base font-semibold">{item.description}</p>
                  <p className="text-sm text-[var(--pf-text-secondary)]">
                    {t('currentQty')}: <span dir="ltr">{item.currentQuantity}</span>
                    {' · '}
                    {t('performedQty')}: <span dir="ltr">{item.performedQuantity}</span>
                    {' · '}
                    {t('remainingQty')}: <span dir="ltr">{item.remainingQuantity}</span>
                    {item.pendingMeasuredQuantity !== '0' ? (
                      <>
                        {' · '}
                        {t('pendingQty')}: <span dir="ltr">{item.pendingMeasuredQuantity}</span>
                      </>
                    ) : null}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!canSubmit ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('noSubmitPermission')}</p>
      ) : null}

      {canSubmit && selected ? (
        <form
          action={progressAction}
          className="flex min-w-0 flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="boqId" value={boqId} />
          <input type="hidden" name="boqNodeId" value={selected.id} />
          <h3 className="text-base font-semibold">{selected.description}</h3>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {selected.itemCode ? `${selected.itemCode} · ` : null}
            {selected.unit ? `${selected.unit} · ` : null}
            {t('remainingQty')}: <span dir="ltr">{selected.remainingQuantity}</span>
          </p>
          <Field label={t('periodLabel')}>
            {(controlProps) => (
              <input
                {...controlProps}
                name="periodLabel"
                required
                defaultValue={defaultPeriodLabel}
                className="min-h-12 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-3 text-base"
              />
            )}
          </Field>
          <Field label={t('measuredQty')} required>
            {(controlProps) => (
              <input
                {...controlProps}
                name="measuredQuantity"
                required
                inputMode="decimal"
                dir="ltr"
                autoComplete="off"
                className="min-h-14 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-3 text-2xl tabular-nums"
              />
            )}
          </Field>
          <Field label={t('note')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <textarea
                {...controlProps}
                name="lineNote"
                rows={2}
                className="min-h-12 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-3 text-base"
              />
            )}
          </Field>
          <Button type="submit" size="lg" block disabled={progressPending} loading={progressPending}>
            {t('submit')}
          </Button>
        </form>
      ) : canSubmit && filtered.length > 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('selectItem')}</p>
      ) : null}

      <ActionMessage state={progressState} />
    </div>
  );
}
