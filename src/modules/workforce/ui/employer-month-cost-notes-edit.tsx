'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BusinessChangeConfirmDialog } from '@/components/patterns/business-change-confirm-dialog';
import type { BusinessChangeFieldDiff } from '@/shared/business-change/types';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { updateAppliedEmployerMonthCostNotesAction } from '@/app/[locale]/(app)/workforce/employees/actions';

export function EmployerMonthCostNotesEdit({
  employeeId,
  yearMonth,
  initialNotes,
}: {
  readonly employeeId: string;
  readonly yearMonth: string;
  readonly initialNotes: string | null;
}) {
  const t = useTranslations('workforce.retroactiveEdit');
  const tCommon = useTranslations('common');
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const diffs = useMemo((): BusinessChangeFieldDiff[] => {
    const before = (initialNotes ?? '').trim() || '—';
    const after = notes.trim() || '—';
    if (before === after) return [];
    return [{ fieldLabel: tCommon('labels.notes'), before, after }];
  }, [initialNotes, notes, tCommon]);

  async function confirmSave() {
    setPending(true);
    setError(null);
    const result = await updateAppliedEmployerMonthCostNotesAction({
      employeeId,
      yearMonth,
      notes: notes.trim() === '' ? null : notes.trim(),
      changeAcknowledged: true,
    });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConfirmOpen(false);
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3">
      <p className="text-sm font-medium">{t('monthCostNotesTitle')}</p>
      <p className="text-xs text-[var(--pf-text-secondary)]">{t('monthCostNotesDescription')}</p>
      <Field label={tCommon('labels.notes')}>
        {(control) => (
          <Textarea {...control} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        )}
      </Field>
      {error ? <p className="text-sm text-[var(--pf-status-danger-fg)]">{error}</p> : null}
      {saved ? <p className="text-sm text-[var(--pf-status-success-fg)]">{t('monthCostNotesSaved')}</p> : null}
      <Button
        type="button"
        size="sm"
        disabled={diffs.length === 0}
        loading={pending}
        onClick={() => setConfirmOpen(true)}
      >
        {t('monthCostNotesSave')}
      </Button>
      <BusinessChangeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('monthCostNotesConfirmTitle')}
        description={t('monthCostNotesConfirmDescription')}
        changes={diffs}
        pending={pending}
        onConfirm={confirmSave}
        onBackToEdit={() => setConfirmOpen(false)}
      />
    </div>
  );
}
