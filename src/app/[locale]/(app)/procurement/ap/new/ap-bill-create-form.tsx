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
import { createApBillAction, type ApFormState } from '../actions';

const NONE = '__none__';

interface LineDraft {
  key: string;
  description: string;
  quantity: string;
  unitAmount: string;
  lineTotal: string;
}

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyLine(): LineDraft {
  return {
    key: newKey(),
    description: '',
    quantity: '1',
    unitAmount: '',
    lineTotal: '',
  };
}

function computeLineTotal(quantity: string, unitAmount: string, currency: string): string {
  if (!quantity.trim() || !unitAmount.trim()) return '';
  try {
    return toNumericString(multiplyMoney(money(unitAmount, currency), quantity));
  } catch {
    return '';
  }
}

export function ApBillCreateForm({
  defaultCurrency,
  vendors,
  projects,
  purchaseOrders,
}: {
  defaultCurrency: string;
  vendors: readonly { id: string; name: string }[];
  projects: readonly { id: string; name: string }[];
  purchaseOrders: readonly { id: string; reference: string | null; vendorId: string }[];
}) {
  const t = useTranslations('ap.create');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ApFormState, FormData>(createApBillAction, {});

  const [vendorId, setVendorId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const currency = defaultCurrency;

  const filteredPos = useMemo(
    () => purchaseOrders.filter((po) => !vendorId || po.vendorId === vendorId),
    [purchaseOrders, vendorId],
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
            description: line.description.trim(),
            quantity: line.quantity.trim() || '1',
            unitAmount: line.unitAmount.trim(),
            lineTotal: line.lineTotal.trim(),
            currency,
          })),
      ),
    [currency, lines],
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="totalAmount" value={totalAmount} />
      <input type="hidden" name="lines" value={linesPayload} />
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="projectId" value={projectId === NONE ? '' : projectId} />
      <input
        type="hidden"
        name="purchaseOrderId"
        value={purchaseOrderId === NONE ? '' : purchaseOrderId}
      />

      <Field label={t('vendorLabel')} required>
        {(props) => (
          <Select
            value={vendorId || undefined}
            onValueChange={(value) => {
              setVendorId(value);
              setPurchaseOrderId('');
            }}
          >
            <SelectTrigger id={props.id}>
              <SelectValue placeholder={t('vendorPlaceholder')} />
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
          <Select value={projectId || NONE} onValueChange={setProjectId}>
            <SelectTrigger id={props.id}>
              <SelectValue placeholder={t('projectNone')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('projectNone')}</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('poLabel')}>
        {(props) => (
          <Select value={purchaseOrderId || NONE} onValueChange={setPurchaseOrderId}>
            <SelectTrigger id={props.id}>
              <SelectValue placeholder={t('poNone')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('poNone')}</SelectItem>
              {filteredPos.map((po) => (
                <SelectItem key={po.id} value={po.id}>
                  {po.reference?.trim() || po.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('referenceLabel')}>
        {(props) => <Input {...props} name="reference" />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('billDateLabel')}>
          {(props) => <Input {...props} name="billDate" type="date" dir="ltr" />}
        </Field>
        <Field label={t('dueDateLabel')}>
          {(props) => <Input {...props} name="dueDate" type="date" dir="ltr" />}
        </Field>
      </div>

      <Field label={t('notesLabel')}>
        {(props) => <Textarea {...props} name="notes" rows={3} />}
      </Field>

      <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">{t('linesTitle')}</h2>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            <Plus aria-hidden className="size-4" />
            {t('addLine')}
          </Button>
        </div>

        <div className="mt-3 flex flex-col gap-4">
          {lines.map((line, index) => (
            <div
              key={line.key}
              className="grid gap-3 rounded-md border border-[var(--pf-border-subtle)] p-3 sm:grid-cols-2"
            >
              <Field label={t('lineDescription')} className="sm:col-span-2">
                {(props) => (
                  <Input
                    {...props}
                    value={line.description}
                    onChange={(event) => {
                      const description = event.target.value;
                      setLines((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, description } : row)),
                      );
                    }}
                  />
                )}
              </Field>
              <Field label={t('lineQuantity')}>
                {(props) => (
                  <Input
                    {...props}
                    dir="ltr"
                    value={line.quantity}
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
              <Field label={t('lineUnitAmount')}>
                {() => (
                  <MoneyInput
                    value={line.unitAmount}
                    onValueChange={(unitAmount) => {
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
                      );
                    }}
                  />
                )}
              </Field>
              <div className="flex items-end justify-between gap-2 sm:col-span-2">
                <p className="text-sm text-[var(--pf-text-secondary)]">
                  {t('lineTotal')}: {line.lineTotal || '—'} {currency}
                </p>
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 aria-hidden className="size-4" />
                    {t('removeLine')}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-sm font-medium">
          {t('totalLabel')}: {totalAmount} {currency}
        </p>
      </div>

      <Button type="submit" loading={pending} disabled={!vendorId}>
        {pending ? tCommon('states.saving') : t('submit')}
      </Button>
    </form>
  );
}
