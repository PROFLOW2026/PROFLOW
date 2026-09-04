'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MoneyInput } from '@/components/patterns/money-input';
import { money } from '@/shared/money/money';
import type { AllocationMethod, CostCategoryRow, ProjectOption } from '@/modules/expenses/domain/types';
import { displayCostCategoryName } from '@/modules/expenses/domain/cost-category-display';

const OVERHEAD_VALUE = '__overhead__';

export interface AllocationDraft {
  lineId?: string;
  targetType: 'project' | 'overhead';
  projectId: string | null;
  workPackageId: string | null;
  costCategoryId: string | null;
  method: AllocationMethod;
  amount: string;
  percent: string;
  notes: string;
  sortOrder: number;
  amountBasis?: 'gross' | 'net';
}

export interface AllocationEditorProps {
  readonly currency: string;
  readonly totalAmount: string;
  readonly projects: readonly ProjectOption[];
  readonly categories: readonly CostCategoryRow[];
  readonly value: AllocationDraft[];
  readonly onChange: (value: AllocationDraft[]) => void;
  readonly disabled?: boolean;
  /** Recurrence / period label shown for overhead clarity. */
  readonly periodLabel?: string;
}

function newLineId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyLine(sortOrder: number): AllocationDraft {
  return {
    lineId: newLineId(),
    targetType: 'project',
    projectId: null,
    workPackageId: null,
    costCategoryId: null,
    method: 'manual_amount',
    amount: '',
    percent: '',
    notes: '',
    sortOrder,
  };
}

function withStableLineIds(lines: AllocationDraft[]): AllocationDraft[] {
  return lines.map((line) => (line.lineId ? line : { ...line, lineId: newLineId() }));
}

export function AllocationEditor({
  currency,
  totalAmount,
  projects,
  categories,
  value,
  onChange,
  disabled = false,
  periodLabel,
}: AllocationEditorProps) {
  const t = useTranslations('expenses');
  const tCommon = useTranslations('common');

  React.useEffect(() => {
    if (value.some((line) => !line.lineId)) {
      onChange(withStableLineIds(value));
    }
  }, [onChange, value]);

  function updateLine(index: number, patch: Partial<AllocationDraft>) {
    onChange(value.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    onChange([...value, emptyLine(value.length)]);
  }

  function removeLine(index: number) {
    onChange(value.filter((_, i) => i !== index).map((line, i) => ({ ...line, sortOrder: i })));
  }

  const projectNames = value
    .filter((line) => line.targetType === 'project' && line.projectId)
    .map((line) => projects.find((project) => project.id === line.projectId)?.name)
    .filter((name): name is string => Boolean(name));
  const methodsUsed = [...new Set(value.map((line) => line.method))];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-start">
          <h4 className="text-sm font-medium">{t('allocation.title')}</h4>
          <p className="mt-0.5 text-xs text-[var(--pf-text-muted)]">{t('allocation.subtitle')}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="max-w-full shrink-0"
          onClick={addLine}
          disabled={disabled}
        >
          <Plus aria-hidden />
          {t('allocation.addLine')}
        </Button>
      </div>

      {(periodLabel || projectNames.length > 0 || methodsUsed.length > 0) && value.length > 0 ? (
        <dl className="grid min-w-0 gap-1 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-xs text-[var(--pf-text-secondary)] sm:grid-cols-3">
          {periodLabel ? (
            <div>
              <dt className="text-[var(--pf-text-muted)]">{t('allocation.period')}</dt>
              <dd>{periodLabel}</dd>
            </div>
          ) : null}
          {methodsUsed.length > 0 ? (
            <div>
              <dt className="text-[var(--pf-text-muted)]">{t('allocation.method')}</dt>
              <dd>
                {methodsUsed
                  .map((method) => {
                    if (method === 'manual_percent') return t('allocation.methods.percent');
                    if (method === 'manual_amount') return t('allocation.methods.amount');
                    return t(`allocation.methods.${method}` as 'allocation.methods.equal_split');
                  })
                  .join(', ')}
              </dd>
            </div>
          ) : null}
          <div className="min-w-0 sm:col-span-1">
            <dt className="text-[var(--pf-text-muted)]">{t('allocation.projectsLabel')}</dt>
            <dd className="break-words">
              {projectNames.length > 0 ? projectNames.join(', ') : t('allocation.unallocatedCallout')}
            </dd>
          </div>
        </dl>
      ) : null}

      {value.length === 0 ? (
        <p
          role="status"
          className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-start text-sm text-[var(--pf-text-secondary)]"
        >
          {t('allocation.unallocatedCallout')}
        </p>
      ) : null}

      {value.map((line, index) => {
        const rowNumber = index + 1;

        return (
          <div
            key={line.lineId ?? index}
            className="grid min-w-0 gap-3 rounded-md border border-[var(--pf-border-default)] p-3 sm:grid-cols-2"
          >
            <Field label={t('allocation.targetRow', { row: rowNumber })}>
              {(controlProps) => (
                <Select
                  value={line.targetType === 'overhead' ? OVERHEAD_VALUE : line.projectId ?? ''}
                  onValueChange={(selected) => {
                    if (selected === OVERHEAD_VALUE) {
                      updateLine(index, { targetType: 'overhead', projectId: null, workPackageId: null });
                    } else {
                      updateLine(index, { targetType: 'project', projectId: selected });
                    }
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger {...controlProps}>
                    <SelectValue placeholder={t('allocation.selectTarget')} />
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

            <Field label={t('allocation.methodRow', { row: rowNumber })}>
              {(controlProps) =>
                line.method === 'manual_amount' || line.method === 'manual_percent' ? (
                  <Select
                    value={line.method}
                    onValueChange={(method) =>
                      updateLine(index, { method: method as AllocationDraft['method'] })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger {...controlProps}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual_amount">{t('allocation.methods.amount')}</SelectItem>
                      <SelectItem value="manual_percent">{t('allocation.methods.percent')}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    {...controlProps}
                    readOnly
                    value={t(`allocation.methods.${line.method}`)}
                    disabled
                  />
                )
              }
            </Field>

            {line.method === 'manual_percent' ? (
              <Field label={t('allocation.percentRow', { row: rowNumber })}>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    inputMode="decimal"
                    value={line.percent}
                    onChange={(event) => updateLine(index, { percent: event.target.value })}
                    disabled={disabled}
                  />
                )}
              </Field>
            ) : (
              <Field label={t('allocation.amountRow', { row: rowNumber })}>
                {(controlProps) => (
                  <MoneyInput
                    {...controlProps}
                    value={line.amount}
                    onValueChange={(amount) => updateLine(index, { amount })}
                    currency={currency}
                    disabled={disabled || (line.method !== 'manual_amount' && line.method !== 'manual_percent')}
                  />
                )}
              </Field>
            )}

            <Field
              label={t('allocation.categoryRow', { row: rowNumber })}
              optionalLabel={tCommon('labels.optional')}
            >
              {(controlProps) => (
                <Select
                  value={line.costCategoryId ?? ''}
                  onValueChange={(categoryId) =>
                    updateLine(index, { costCategoryId: categoryId || null })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger {...controlProps}>
                    <SelectValue placeholder={t('placeholders.category')} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {displayCostCategoryName(category, (key) => t(key))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <div className="flex min-h-11 items-end sm:col-span-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeLine(index)}
                disabled={disabled}
              >
                <Trash2 aria-hidden />
                {t('allocation.removeLine')}
              </Button>
            </div>
          </div>
        );
      })}

      {value.length > 0 ? (
        <p className="text-xs text-[var(--pf-text-muted)]">
          {t('allocation.sumHintPrefix')}{' '}
          <MoneyText value={money(totalAmount, currency)} />
        </p>
      ) : null}
    </div>
  );
}
