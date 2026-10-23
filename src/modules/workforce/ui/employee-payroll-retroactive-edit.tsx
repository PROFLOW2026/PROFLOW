'use client';

import { useRouter } from '@/shared/i18n/navigation';
import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BusinessChangeConfirmDialog } from '@/components/patterns/business-change-confirm-dialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { reviseConfirmedPayrollRetroactiveAction } from '@/app/[locale]/(app)/workforce/employees/actions';
import { yearMonthFromBusinessDate } from '@/modules/month-close/domain/year-month';
import type { BusinessChangeFieldDiff, BusinessChangeImpactLine } from '@/shared/business-change/types';
import { businessDate } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';

export interface EmployeePayrollRetroactiveEditProps {
  readonly employeeId: string;
  readonly yearMonth: string;
  readonly initialPaidAt: string;
  readonly initialPaidAmount: string;
  readonly currency: string;
  readonly locale: string;
}

export function EmployeePayrollRetroactiveEdit({
  employeeId,
  yearMonth,
  initialPaidAt,
  initialPaidAmount,
  currency,
  locale,
}: EmployeePayrollRetroactiveEditProps) {
  const t = useTranslations('workforce.retroactiveEdit');
  const tPayroll = useTranslations('workforce.payrollPayment');
  const router = useRouter();
  const [paidAt, setPaidAt] = useState(initialPaidAt);
  const [paidAmount, setPaidAmount] = useState(initialPaidAmount);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changeDiffs = useMemo((): BusinessChangeFieldDiff[] => {
    const rows: BusinessChangeFieldDiff[] = [];
    if (paidAt !== initialPaidAt) {
      rows.push({
        fieldLabel: tPayroll('paidAt'),
        before: formatBusinessDate(businessDate(initialPaidAt), locale),
        after: formatBusinessDate(businessDate(paidAt), locale),
      });
    }
    if (paidAmount.trim() !== initialPaidAmount.trim()) {
      rows.push({
        fieldLabel: tPayroll('paidAmount'),
        before: `${initialPaidAmount} ${currency}`,
        after: `${paidAmount.trim()} ${currency}`,
      });
    }
    return rows;
  }, [currency, initialPaidAmount, initialPaidAt, locale, paidAmount, paidAt, tPayroll]);

  const impactLines = useMemo((): BusinessChangeImpactLine[] => {
    if (paidAt === initialPaidAt) return [];
    return [
      {
        label: t('cashMonthImpact'),
        detail: t('cashMonthShift', {
          from: yearMonthFromBusinessDate(initialPaidAt),
          to: yearMonthFromBusinessDate(paidAt),
        }),
      },
    ];
  }, [initialPaidAt, paidAt, t]);

  const hasChanges = changeDiffs.length > 0;
  const canSubmit = hasChanges && evidenceNote.trim().length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setConfirmOpen(true);
  }

  function submitConfirmed() {
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await reviseConfirmedPayrollRetroactiveAction({
        employeeId,
        yearMonth,
        paidAt: paidAt !== initialPaidAt ? paidAt : undefined,
        paidAmount: paidAmount.trim() !== initialPaidAmount.trim() ? paidAmount.trim() : undefined,
        evidenceNote: evidenceNote.trim(),
        changeAcknowledged: true,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="mt-4 rounded-md border border-[var(--pf-border-default)] p-4">
        <p className="text-sm font-medium">{t('title')}</p>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('payrollDescription')}</p>
        {error ? (
          <Alert tone="danger" className="mt-3">
            {error}
          </Alert>
        ) : null}
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <Field label={tPayroll('paidAt')} required>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
                required
              />
            )}
          </Field>
          <Field label={tPayroll('paidAmount')} required>
            {(control) => (
              <Input
                {...control}
                name="paidAmount"
                inputMode="decimal"
                numeric
                value={paidAmount}
                onChange={(event) => setPaidAmount(event.target.value)}
                required
              />
            )}
          </Field>
          <Field label={t('evidenceNote')} required>
            {(control) => (
              <Textarea
                {...control}
                value={evidenceNote}
                onChange={(event) => setEvidenceNote(event.target.value)}
                rows={3}
                required
              />
            )}
          </Field>
          <Button type="submit" disabled={!canSubmit || pending} loading={pending}>
            {pending ? t('savePending') : t('save')}
          </Button>
        </form>
      </div>

      <BusinessChangeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('confirmTitle')}
        description={t('confirmDescription')}
        changes={changeDiffs}
        impacts={impactLines}
        pending={pending}
        onConfirm={submitConfirmed}
        onBackToEdit={() => setConfirmOpen(false)}
      />
    </>
  );
}
