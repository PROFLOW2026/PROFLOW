'use client';

import { useMemo, useState, useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { receivePurchaseOrderAction, type ProcurementFormState } from '../actions';

export type ReceiveFormLine = {
  readonly id: string;
  readonly description: string;
  readonly quantity: string;
  readonly receivedQuantity: string;
  readonly remainingQuantity: string;
};

function hasRemaining(remaining: string): boolean {
  return remaining.trim() !== '' && !/^0+(\.0+)?$/.test(remaining.trim());
}

export function PurchaseOrderReceiveForm({
  purchaseOrderId,
  defaultReceivedOn,
  lines,
}: {
  purchaseOrderId: string;
  defaultReceivedOn: string;
  lines: readonly ReceiveFormLine[];
}) {
  const t = useTranslations('procurement.receive');
  const tCommon = useTranslations('common');
  const receivableLines = useMemo(() => lines.filter((line) => hasRemaining(line.remainingQuantity)), [lines]);
  const [state, action, pending] = useActionState<ProcurementFormState, FormData>(
    receivePurchaseOrderAction,
    {},
  );
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});

  const linesPayload = useMemo(
    () =>
      JSON.stringify(
        receivableLines
          .map((line) => ({
            purchaseOrderLineId: line.id,
            quantity: (quantities[line.id] ?? '').trim(),
            notes: (lineNotes[line.id] ?? '').trim() || undefined,
          }))
          .filter((line) => line.quantity !== ''),
      ),
    [lineNotes, quantities, receivableLines],
  );

  if (receivableLines.length === 0) return null;

  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-[var(--pf-text-primary)]">{t('title')}</h2>
        <p className="text-sm text-[var(--pf-text-muted)]">{t('description')}</p>
        <p className="text-sm text-[var(--pf-text-muted)]">{t('threeActionsHint')}</p>
        <p className="text-sm text-[var(--pf-text-muted)]">{t('inventoryHandoffHint')}</p>
      </div>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('success')}</Alert> : null}

      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <input type="hidden" name="lines" value={linesPayload} />

      <Field label={t('receivedOn')} required>
        {(control) => (
          <Input
            {...control}
            name="receivedOn"
            type="date"
            dir="ltr"
            defaultValue={defaultReceivedOn}
            required
          />
        )}
      </Field>

      <Field label={t('reference')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="reference" maxLength={80} />}
      </Field>

      <Field label={t('notes')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Textarea {...control} name="notes" rows={2} />}
      </Field>

      {receivableLines.map((line) => (
        <div
          key={line.id}
          className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
        >
          <p className="text-sm font-medium text-[var(--pf-text-primary)]">{line.description}</p>
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[var(--pf-text-muted)]">{t('ordered')}</span>
              <span className="pf-numeric pf-ltr-island" dir="ltr">
                {line.quantity}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[var(--pf-text-muted)]">{t('received')}</span>
              <span className="pf-numeric pf-ltr-island" dir="ltr">
                {line.receivedQuantity}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[var(--pf-text-muted)]">{t('remaining')}</span>
              <span className="pf-numeric pf-ltr-island" dir="ltr">
                {line.remainingQuantity}
              </span>
            </div>
          </div>
          <Field label={t('quantity')}>
            {(control) => (
              <Input
                {...control}
                numeric
                inputMode="decimal"
                placeholder={line.remainingQuantity}
                value={quantities[line.id] ?? ''}
                onChange={(event) =>
                  setQuantities((current) => ({ ...current, [line.id]: event.target.value }))
                }
              />
            )}
          </Field>
          <Field label={t('lineNotes')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input
                {...control}
                value={lineNotes[line.id] ?? ''}
                onChange={(event) =>
                  setLineNotes((current) => ({ ...current, [line.id]: event.target.value }))
                }
              />
            )}
          </Field>
        </div>
      ))}

      <Button type="submit" disabled={pending}>
        {pending ? t('pending') : t('submit')}
      </Button>
    </form>
  );
}
