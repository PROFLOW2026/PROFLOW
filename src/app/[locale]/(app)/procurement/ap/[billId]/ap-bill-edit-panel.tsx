'use client';

import { useMemo, useState, useActionState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addMoney, money, multiplyMoney, toNumericString, zeroMoney } from '@/shared/money/money';
import { editRecognizedApBillAction, type ApFormState } from '../actions';

const NONE = '__none__';

interface LineDraft {
  key: string;
  lineId?: string;
  description: string;
  quantity: string;
  unitAmount: string;
  lineTotal: string;
  costCategoryId: string;
}

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function computeLineTotal(quantity: string, unitAmount: string, currency: string): string {
  if (!quantity.trim() || !unitAmount.trim()) return '';
  try {
    return toNumericString(multiplyMoney(money(unitAmount, currency), quantity));
  } catch {
    return '';
  }
}

export function ApBillRecognizedEditPanel({
  billId,
  vendorId: initialVendorId,
  vendors,
  projectId: initialProjectId,
  projects,
  billDate: initialBillDate,
  currency,
  amountIncludesTax: initialAmountIncludesTax,
  notes: initialNotes,
  lines: initialLines,
  costCategories,
  canEdit,
}: {
  readonly billId: string;
  readonly vendorId: string;
  readonly vendors: readonly { id: string; name: string }[];
  readonly projectId: string | null;
  readonly projects: readonly { id: string; name: string }[];
  readonly billDate: string | null;
  readonly currency: string;
  readonly amountIncludesTax: boolean | null;
  readonly notes: string | null;
  readonly lines: readonly {
    id: string;
    description: string;
    quantity: string;
    unitAmount: string;
    lineTotal: string;
    costCategoryId: string | null;
  }[];
  readonly costCategories: readonly { id: string; key: string; name: string; family: string }[];
  readonly canEdit: boolean;
}) {
  const t = useTranslations('ap.recognizedEdit');
  const tCreate = useTranslations('ap.create');
  const tCommon = useTranslations('common');
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<ApFormState, FormData>(
    editRecognizedApBillAction,
    {},
  );

  const [vendorId, setVendorId] = useState(initialVendorId);
  const [projectId, setProjectId] = useState(initialProjectId ?? NONE);
  const [billDate, setBillDate] = useState(initialBillDate ?? '');
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [amountIncludesTax, setAmountIncludesTax] = useState(Boolean(initialAmountIncludesTax));
  const [lines, setLines] = useState<LineDraft[]>(() =>
    initialLines.length > 0
      ? initialLines.map((line) => ({
          key: line.id,
          lineId: line.id,
          description: line.description,
          quantity: line.quantity,
          unitAmount: line.unitAmount,
          lineTotal: line.lineTotal,
          costCategoryId: line.costCategoryId ?? '',
        }))
      : [
          {
            key: newKey(),
            description: '',
            quantity: '1',
            unitAmount: '',
            lineTotal: '',
            costCategoryId: '',
          },
        ],
  );

  const totalAmount = useMemo(() => {
    try {
      return toNumericString(
        lines.reduce((sum, line) => {
          if (!line.lineTotal.trim()) return sum;
          return addMoney(sum, money(line.lineTotal, currency));
        }, zeroMoney(currency)),
      );
    } catch {
      return '0';
    }
  }, [currency, lines]);

  const linesPayload = useMemo(
    () =>
      JSON.stringify(
        lines
          .filter((line) => line.description.trim() && line.unitAmount.trim() && line.lineTotal.trim())
          .map((line) => ({
            lineId: line.lineId,
            description: line.description.trim(),
            quantity: line.quantity.trim() || '1',
            unitAmount: line.unitAmount.trim(),
            lineTotal: line.lineTotal.trim(),
            currency,
            purchaseOrderLineId: null,
            costCategoryId: line.costCategoryId.trim() || null,
            costFamily:
              costCategories.find((c) => c.id === line.costCategoryId)?.family ?? null,
          })),
      ),
    [currency, lines, costCategories],
  );

  if (!canEdit) return null;

  if (!editing) {
    return (
      <section className="flex min-w-0 flex-col gap-2">
        <Button type="button" variant="secondary" size="lg" className="sm:w-auto" onClick={() => setEditing(true)}>
          {t('action')}
        </Button>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
      <div>
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('note')}</p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('success')}</Alert> : null}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="billId" value={billId} />
        <input type="hidden" name="currency" value={currency} />
        <input type="hidden" name="totalAmount" value={totalAmount} />
        <input type="hidden" name="vendorId" value={vendorId} />
        <input type="hidden" name="projectId" value={projectId === NONE ? '' : projectId} />
        <input type="hidden" name="lines" value={linesPayload} />
        {amountIncludesTax ? <input type="hidden" name="amountIncludesTax" value="on" /> : null}

        <Field label={t('vendorLabel')} required>
          {(props) => (
            <Select value={vendorId || undefined} onValueChange={setVendorId}>
              <SelectTrigger {...props}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label={t('projectLabel')}>
          {(props) => (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger {...props}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('noProject')}</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label={t('billDateLabel')}>
          {(props) => (
            <Input
              {...props}
              name="billDate"
              type="date"
              value={billDate}
              onChange={(event) => setBillDate(event.target.value)}
              dir="ltr"
            />
          )}
        </Field>

        <Field label={t('notesLabel')}>
          {(props) => (
            <Textarea
              {...props}
              name="notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          )}
        </Field>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={amountIncludesTax}
            onChange={(event) => setAmountIncludesTax(event.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-medium">{tCreate('amountIncludesTax')}</span>
            <span className="mt-0.5 block text-[var(--pf-text-secondary)]">{tCreate('taxSplitHint')}</span>
          </span>
        </label>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{tCreate('linesTitle')}</h3>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  {
                    key: newKey(),
                    description: '',
                    quantity: '1',
                    unitAmount: '',
                    lineTotal: '',
                    costCategoryId: '',
                  },
                ])
              }
            >
              <Plus className="size-4" aria-hidden />
              {tCreate('addLine')}
            </Button>
          </div>

          {lines.map((line, index) => (
            <div
              key={line.key}
              className="grid gap-3 rounded-md border border-[var(--pf-border-default)] p-3 sm:grid-cols-2"
            >
              <Field label={tCreate('lineDescription')} className="sm:col-span-2">
                {(props) => (
                  <Input
                    {...props}
                    value={line.description}
                    onChange={(event) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, description: event.target.value } : row,
                        ),
                      )
                    }
                  />
                )}
              </Field>
              <Field label={tCreate('lineQuantity')}>
                {(props) => (
                  <Input
                    {...props}
                    value={line.quantity}
                    dir="ltr"
                    onChange={(event) => {
                      const quantity = event.target.value;
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                quantity,
                                lineTotal: computeLineTotal(quantity, row.unitAmount, currency),
                              }
                            : row,
                        ),
                      );
                    }}
                  />
                )}
              </Field>
              <Field label={tCreate('lineUnitAmount')}>
                {(props) => (
                  <MoneyInput
                    {...props}
                    value={line.unitAmount}
                    onValueChange={(unitAmount) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                unitAmount,
                                lineTotal: computeLineTotal(row.quantity, unitAmount, currency),
                              }
                            : row,
                        ),
                      )
                    }
                  />
                )}
              </Field>
              <Field label={tCreate('lineTotal')}>
                {(props) => (
                  <MoneyInput
                    {...props}
                    value={line.lineTotal}
                    onValueChange={(lineTotal) =>
                      setLines((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, lineTotal } : row)),
                      )
                    }
                  />
                )}
              </Field>
              <Field label={tCreate('lineCategory')} className="sm:col-span-2">
                {(props) => (
                  <Select
                    value={line.costCategoryId || undefined}
                    onValueChange={(value) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, costCategoryId: value } : row,
                        ),
                      )
                    }
                  >
                    <SelectTrigger {...props}>
                      <SelectValue placeholder={tCreate('lineCategory')} />
                    </SelectTrigger>
                    <SelectContent>
                      {costCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              {lines.length > 1 ? (
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    {tCommon('actions.remove')}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}

          <p className="text-sm font-medium">
            {tCreate('totalLabel')}:{' '}
            <span dir="ltr" className="pf-numeric">
              {totalAmount} {currency}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending} disabled={!vendorId || linesPayload === '[]'}>
            {t('save')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setEditing(false);
            }}
          >
            {t('cancel')}
          </Button>
        </div>
      </form>
    </section>
  );
}
