'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { MoneyInput } from '@/components/patterns/money-input';
import {
  createProjectBudgetAction,
  reviseProjectBudgetAction,
} from '@/app/[locale]/(app)/projects/budget-actions';
import { BUDGET_LINE_TYPES, type BudgetLineType } from '../domain/types';

interface DraftLine {
  readonly id: string;
  lineType: BudgetLineType;
  label: string;
  budgetAmount: string;
  categoryKey: string;
  workPackageId: string;
  etcAmount: string;
}

function emptyLine(): DraftLine {
  return {
    id: crypto.randomUUID(),
    lineType: 'category',
    label: '',
    budgetAmount: '',
    categoryKey: '',
    workPackageId: '',
    etcAmount: '',
  };
}

export function BudgetManageForms({
  projectId,
  budgetId,
  currency,
  mode,
}: {
  readonly projectId: string;
  readonly budgetId: string | null;
  readonly currency: string;
  readonly mode: 'create' | 'revise';
}) {
  const t = useTranslations('budgets');
  const tCommon = useTranslations('common');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const payloadLines = lines
            .filter((line) => line.label.trim() && line.budgetAmount.trim())
            .map((line, index) => ({
              lineType: line.lineType,
              label: line.label.trim(),
              budgetAmount: line.budgetAmount,
              categoryKey: line.categoryKey.trim() || null,
              workPackageId: line.workPackageId.trim() || null,
              etcAmount: line.etcAmount.trim() || null,
              sortOrder: index,
            }));
          if (mode === 'create') {
            const result = await createProjectBudgetAction({
              projectId,
              totalBudgetAmount: payloadLines.length > 0 ? null : amount || null,
              currency,
              lines: payloadLines.length > 0 ? payloadLines : undefined,
            });
            setMessage(result.error ?? t('actions.created'));
            return;
          }
          if (!budgetId) {
            setMessage(t('actions.missingBudget'));
            return;
          }
          const result = await reviseProjectBudgetAction({
            budgetId,
            projectId,
            reason: reason.trim() || t('actions.defaultRevisionReason'),
            totalBudgetAmount: payloadLines.length > 0 ? null : amount || null,
            lines: payloadLines.length > 0 ? payloadLines : undefined,
          });
          setMessage(result.error ?? t('actions.revised'));
        });
      }}
    >
      <h3 className="text-sm font-semibold">
        {mode === 'create' ? t('actions.createTitle') : t('actions.reviseTitle')}
      </h3>
      {lines.length === 0 ? (
        <Field label={t('fields.totalBudget')}>
          {(controlProps) => (
            <MoneyInput
              {...controlProps}
              value={amount}
              onValueChange={setAmount}
              currencySymbol={currency}
            />
          )}
        </Field>
      ) : null}
      {mode === 'revise' ? (
        <Field label={t('fields.revisionReason')}>
          {(controlProps) => (
            <input
              {...controlProps}
              className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          )}
        </Field>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3">
        {lines.map((line, index) => (
          <fieldset
            key={line.id}
            className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3"
          >
            <legend className="text-xs font-medium">{t('lines.title')} {index + 1}</legend>
            <Field label={t('fields.lineType')}>
              {(controlProps) => (
                <select
                  {...controlProps}
                  className="w-full min-h-11 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm"
                  value={line.lineType}
                  onChange={(event) => {
                    const lineType = event.target.value as BudgetLineType;
                    setLines((current) =>
                      current.map((item) => (item.id === line.id ? { ...item, lineType } : item)),
                    );
                  }}
                >
                  {BUDGET_LINE_TYPES.filter((type) => type !== 'total').map((type) => (
                    <option key={type} value={type}>
                      {t(`lineTypes.${type}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('fields.lineLabel')} required>
              {(controlProps) => (
                <input
                  {...controlProps}
                  className="w-full min-h-11 min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm"
                  value={line.label}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item) =>
                        item.id === line.id ? { ...item, label: event.target.value } : item,
                      ),
                    )
                  }
                  required
                />
              )}
            </Field>
            <Field label={t('fields.lineAmount')} required>
              {(controlProps) => (
                <MoneyInput
                  {...controlProps}
                  value={line.budgetAmount}
                  onValueChange={(value) =>
                    setLines((current) =>
                      current.map((item) =>
                        item.id === line.id ? { ...item, budgetAmount: value } : item,
                      ),
                    )
                  }
                  currencySymbol={currency}
                />
              )}
            </Field>
            {line.lineType === 'category' ? (
              <Field label={t('fields.categoryKey')}>
                {(controlProps) => (
                  <input
                    {...controlProps}
                    className="w-full min-h-11 min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm"
                    value={line.categoryKey}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item) =>
                          item.id === line.id ? { ...item, categoryKey: event.target.value } : item,
                        ),
                      )
                    }
                  />
                )}
              </Field>
            ) : null}
            {line.lineType === 'work_package' ? (
              <Field label={t('fields.workPackageId')}>
                {(controlProps) => (
                  <input
                    {...controlProps}
                    className="w-full min-h-11 min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm"
                    value={line.workPackageId}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item) =>
                          item.id === line.id
                            ? { ...item, workPackageId: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                )}
              </Field>
            ) : null}
            <Field label={t('fields.etcAmount')}>
              {(controlProps) => (
                <MoneyInput
                  {...controlProps}
                  value={line.etcAmount}
                  onValueChange={(value) =>
                    setLines((current) =>
                      current.map((item) =>
                        item.id === line.id ? { ...item, etcAmount: value } : item,
                      ),
                    )
                  }
                  currencySymbol={currency}
                />
              )}
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start min-h-11"
              onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}
            >
              {t('fields.removeLine')}
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start min-h-11"
          onClick={() => setLines((current) => [...current, emptyLine()])}
        >
          {t('fields.addLines')}
        </Button>
      </div>

      <p className="text-xs text-[var(--pf-text-muted)]">{t('actions.lightweightHint')}</p>
      <Button type="submit" size="sm" loading={pending} className="self-start min-h-11">
        {pending
          ? tCommon('states.saving')
          : mode === 'create'
            ? t('actions.create')
            : t('actions.revise')}
      </Button>
      {message ? <p className="text-xs text-[var(--pf-text-secondary)]">{message}</p> : null}
    </form>
  );
}
