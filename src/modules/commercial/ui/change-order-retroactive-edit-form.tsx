'use client';

import { useActionState, useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BusinessChangeConfirmDialog } from '@/components/patterns/business-change-confirm-dialog';
import { BusinessChangeFormDialogs } from '@/components/patterns/business-change-form-dialogs';
import type { DuplicateRecordWarningItem } from '@/components/patterns/duplicate-record-warning-dialog';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  editChangeOrderRetroactiveAction,
  previewSimilarChangeOrdersAction,
  type FormActionState,
} from '@/app/[locale]/(app)/changes/actions';
import type { BusinessChangeFieldDiff, BusinessChangeImpactLine } from '@/shared/business-change/types';
import type { ChangeOrderRecord } from '../domain/types';

function stripAmount(raw: string): string {
  return raw.replace(/\.?0+$/, '') === '' ? raw : raw.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function ChangeOrderRetroactiveEditForm({
  changeOrder,
  changeRequestId,
  action = editChangeOrderRetroactiveAction,
}: {
  changeOrder: ChangeOrderRecord;
  changeRequestId: string;
  action?: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
}) {
  const t = useTranslations('changes.retroactiveEdit');
  const tCommon = useTranslations('common');
  const formId = `co-retro-${changeOrder.id}`;
  const [state, formAction, pending] = useActionState(action, {});

  const initial = changeOrder;
  const initialAmount = stripAmount(initial.amount);

  const [reference, setReference] = useState(initial.reference ?? '');
  const [effectiveDate, setEffectiveDate] = useState(initial.effectiveDate ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [billingCondition, setBillingCondition] = useState(initial.billingCondition ?? '');
  const [amount, setAmount] = useState(initialAmount);

  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [similarMatches, setSimilarMatches] = useState<readonly DuplicateRecordWarningItem[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [amountConfirmOpen, setAmountConfirmOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const amountChanging = amount.trim() !== initialAmount.trim();

  const changeDiffs = useMemo((): BusinessChangeFieldDiff[] => {
    const rows: BusinessChangeFieldDiff[] = [];
    const push = (fieldLabel: string, before: string, after: string) => {
      const b = before.trim() || '—';
      const a = after.trim() || '—';
      if (b !== a) rows.push({ fieldLabel, before: b, after: a });
    };
    push(t('fields.reference'), initial.reference ?? '', reference);
    push(t('fields.effectiveDate'), initial.effectiveDate ?? '', effectiveDate);
    push(tCommon('labels.notes'), initial.notes ?? '', notes);
    if (amountChanging) {
      push(t('fields.amount'), initialAmount, amount.trim());
    }
    const billLabel = (value: string) => {
      const key = {
        immediate: 'billingConditionImmediate',
        milestone: 'billingConditionMilestone',
        custom_terms: 'billingConditionCustom',
        deferred: 'billingConditionDeferred',
      }[value as 'immediate' | 'milestone' | 'custom_terms' | 'deferred'];
      return key ? t(`form.${key}`) : value;
    };
    const billBefore = initial.billingCondition ? billLabel(initial.billingCondition) : '—';
    const billAfter = billingCondition ? billLabel(billingCondition) : '—';
    if (billBefore !== billAfter) {
      rows.push({ fieldLabel: t('fields.billingCondition'), before: billBefore, after: billAfter });
    }
    return rows;
  }, [
    amount,
    amountChanging,
    billingCondition,
    effectiveDate,
    initial,
    initialAmount,
    notes,
    reference,
    t,
    tCommon,
  ]);

  const amountImpacts = useMemo((): readonly BusinessChangeImpactLine[] => {
    if (!amountChanging) return [];
    return [{ label: t('fields.amount'), detail: t('amountImpactContractValue') }];
  }, [amountChanging, t]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (changeDiffs.length === 0) return;
    event.preventDefault();
    setSimilarLoading(true);
    try {
      const ref = reference.trim();
      const rows = await previewSimilarChangeOrdersAction({
        excludeChangeOrderId: changeOrder.id,
        projectId: changeOrder.projectId,
        reference: ref || null,
      });
      const matches: DuplicateRecordWarningItem[] = rows.map((row) => ({
        id: row.id,
        href: row.changeRequestId ? `/changes/${row.changeRequestId}` : `/changes`,
        title: row.reference ?? row.id,
        reason: t('duplicateReason'),
      }));
      setSimilarMatches(matches);
      if (matches.length > 0) {
        setDuplicateOpen(true);
        return;
      }
      openNextConfirm();
    } finally {
      setSimilarLoading(false);
    }
  }

  function openNextConfirm() {
    if (amountChanging) {
      setAmountConfirmOpen(true);
    } else {
      setConfirmOpen(true);
    }
  }

  function confirmAmountChange() {
    setAmountConfirmOpen(false);
    const form = document.getElementById(formId) as HTMLFormElement | null;
    const ack = form?.querySelector<HTMLInputElement>('input[name="amountChangeAcknowledged"]');
    if (ack) ack.value = 'true';
    setConfirmOpen(true);
  }

  function confirmSave() {
    setConfirmOpen(false);
    const form = document.getElementById(formId) as HTMLFormElement | null;
    const ack = form?.querySelector<HTMLInputElement>('input[name="changeAcknowledged"]');
    if (ack) ack.value = 'true';
    form?.requestSubmit();
  }

  return (
    <>
      <form
        id={formId}
        action={formAction}
        onSubmit={handleSubmit}
        className="mt-4 flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
      >
        <input type="hidden" name="changeOrderId" value={changeOrder.id} />
        <input type="hidden" name="changeRequestId" value={changeRequestId} />
        <input type="hidden" name="changeAcknowledged" value="false" />
        <input type="hidden" name="amountChangeAcknowledged" value="false" />
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
        <MainAppFormGrid dense>
          <Field label={t('fields.reference')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input
                {...control}
                name="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={120}
              />
            )}
          </Field>
          <Field label={t('fields.amount')} description={t('amountHint')}>
            {(control) => (
              <Input
                {...control}
                name="amount"
                dir="ltr"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('fields.effectiveDate')}>
            {(control) => (
              <Input
                {...control}
                name="effectiveDate"
                type="date"
                dir="ltr"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('fields.billingCondition')} className={mainAppFieldSpan.lg}>
            {(control) => (
              <select
                {...control}
                name="billingCondition"
                value={billingCondition}
                onChange={(e) => setBillingCondition(e.target.value)}
                className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
              >
                <option value="">{tCommon('labels.none')}</option>
                <option value="immediate">{t('form.billingConditionImmediate')}</option>
                <option value="milestone">{t('form.billingConditionMilestone')}</option>
                <option value="custom_terms">{t('form.billingConditionCustom')}</option>
                <option value="deferred">{t('form.billingConditionDeferred')}</option>
              </select>
            )}
          </Field>
          <Field label={tCommon('labels.notes')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.full}>
            {(control) => (
              <Textarea
                {...control}
                name="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            )}
          </Field>
        </MainAppFormGrid>
        {state.error ? (
          <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="text-sm text-[var(--pf-status-success-fg)]">{t('saved')}</p>
        ) : null}
        <Button
          type="submit"
          size="sm"
          loading={pending || similarLoading}
          disabled={changeDiffs.length === 0}
          className="self-start"
        >
          {t('save')}
        </Button>
      </form>
      <BusinessChangeFormDialogs
        confirmOpen={confirmOpen}
        setConfirmOpen={setConfirmOpen}
        duplicateOpen={duplicateOpen}
        setDuplicateOpen={setDuplicateOpen}
        pending={pending}
        changes={changeDiffs}
        impacts={amountChanging ? amountImpacts : []}
        similarMatches={similarMatches}
        confirmTitle={t('confirmTitle')}
        confirmDescription={t('confirmDescription')}
        duplicateTitle={t('duplicateTitle')}
        duplicateDescription={t('duplicateDescription')}
        onConfirm={confirmSave}
        onBackToEdit={() => {
          setConfirmOpen(false);
          setDuplicateOpen(false);
        }}
        onContinuePastDuplicate={openNextConfirm}
      />
      <BusinessChangeConfirmDialog
        open={amountConfirmOpen}
        onOpenChange={setAmountConfirmOpen}
        title={t('amountConfirmTitle')}
        description={t('amountConfirmDescription')}
        changes={changeDiffs.filter((row) => row.fieldLabel === t('fields.amount'))}
        impacts={amountImpacts}
        pending={pending}
        onConfirm={confirmAmountChange}
        onBackToEdit={() => setAmountConfirmOpen(false)}
      />
    </>
  );
}
