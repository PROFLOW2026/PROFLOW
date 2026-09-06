'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { PaymentInstrumentRow } from '@/modules/payment-instruments/domain/types';
import { formatPaymentInstrumentLabel } from '@/modules/payment-instruments/domain/types';
import {
  deactivatePaymentInstrumentAction,
  savePaymentInstrumentAction,
  type SettingsActionState,
} from '../actions';

export function PaymentInstrumentsPanel({
  initialInstruments,
  canEdit,
}: {
  readonly initialInstruments: readonly PaymentInstrumentRow[];
  readonly canEdit: boolean;
}) {
  const t = useTranslations('settings.paymentInstruments');
  const tCommon = useTranslations('common');
  const instruments = initialInstruments;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [monthlyDebitDay, setMonthlyDebitDay] = useState('');
  const [saveState, saveAction, savePending] = useActionState(
    savePaymentInstrumentAction,
    {} as SettingsActionState,
  );
  const [deactivateState, deactivateAction, deactivatePending] = useActionState(
    deactivatePaymentInstrumentAction,
    {} as SettingsActionState,
  );

  function resetForm() {
    setEditingId(null);
    setDisplayName('');
    setLastFour('');
    setMonthlyDebitDay('');
  }

  function startEdit(instrument: PaymentInstrumentRow) {
    setEditingId(instrument.id);
    setDisplayName(instrument.displayName ?? '');
    setLastFour(instrument.lastFour ?? '');
    setMonthlyDebitDay(
      instrument.monthlyDebitDay != null ? String(instrument.monthlyDebitDay) : '',
    );
  }

  return (
    <div className="flex flex-col gap-5 border-b border-[var(--pf-border-default)] pb-5">
      <div className="min-w-0">
        <p className="text-start font-medium">{t('title')}</p>
        <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>

      {instruments.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {instruments.map((instrument) => (
            <li
              key={instrument.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2"
            >
              <span className="text-sm">{formatPaymentInstrumentLabel(instrument)}</span>
              {canEdit ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(instrument)}>
                    {tCommon('actions.edit')}
                  </Button>
                  <form action={deactivateAction}>
                    <input type="hidden" name="instrumentId" value={instrument.id} />
                    <Button type="submit" size="sm" variant="ghost" loading={deactivatePending}>
                      {t('remove')}
                    </Button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('empty')}</p>
      )}

      {canEdit ? (
        <form action={saveAction} className="flex flex-col gap-4">
          {editingId ? <input type="hidden" name="instrumentId" value={editingId} /> : null}
          <Field label={t('displayName')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input
                id={control.id}
                name="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={t('displayNamePlaceholder')}
              />
            )}
          </Field>
          <Field label={t('lastFour')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input
                id={control.id}
                name="lastFour"
                inputMode="numeric"
                maxLength={4}
                value={lastFour}
                onChange={(event) => setLastFour(event.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="1234"
              />
            )}
          </Field>
          <Field label={t('debitDay')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input
                id={control.id}
                name="monthlyDebitDay"
                type="number"
                min={1}
                max={28}
                value={monthlyDebitDay}
                onChange={(event) => setMonthlyDebitDay(event.target.value)}
                placeholder={t('debitDayPlaceholder')}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={savePending}>
              {editingId ? tCommon('actions.save') : t('addCard')}
            </Button>
            {editingId ? (
              <Button type="button" variant="ghost" onClick={resetForm}>
                {tCommon('actions.cancel')}
              </Button>
            ) : null}
          </div>
          {saveState.ok ? <Alert tone="success">{t('saved')}</Alert> : null}
          {saveState.error ? <Alert tone="danger">{saveState.error}</Alert> : null}
        </form>
      ) : null}

      {deactivateState.ok ? <Alert tone="success">{t('removed')}</Alert> : null}
      {deactivateState.error ? <Alert tone="danger">{deactivateState.error}</Alert> : null}
    </div>
  );
}
