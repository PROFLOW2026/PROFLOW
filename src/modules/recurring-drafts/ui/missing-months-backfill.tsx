'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { RecurringDraftFormState } from './draft-form';

export function MissingMonthsBackfill({
  draftId,
  missingFromYearMonth,
  missingToYearMonth,
  missingCount,
  action,
}: {
  draftId: string;
  missingFromYearMonth: string | null;
  missingToYearMonth: string | null;
  missingCount: number;
  action: (
    prev: RecurringDraftFormState,
    formData: FormData,
  ) => Promise<RecurringDraftFormState>;
}) {
  const t = useTranslations('recurringDrafts');
  const [state, formAction, pending] = useActionState(action, {} as RecurringDraftFormState);

  if (missingCount === 0 || !missingFromYearMonth || !missingToYearMonth) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] p-4">
        <h2 className="text-sm font-semibold">{t('pastExpenses.title')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('pastExpenses.upToDate')}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <h2 className="text-sm font-semibold">{t('pastExpenses.title')}</h2>
      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t('pastExpenses.missing', {
          from: missingFromYearMonth,
          to: missingToYearMonth,
          count: missingCount,
        })}
      </p>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.historyMessage ? <Alert tone="success">{state.historyMessage}</Alert> : null}
      {state.success && !state.historyMessage ? (
        <Alert tone="success">{t('pastExpenses.created')}</Alert>
      ) : null}
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input type="hidden" name="draftId" value={draftId} />
        <input type="hidden" name="fromYearMonth" value={missingFromYearMonth} />
        <input type="hidden" name="toYearMonth" value={missingToYearMonth} />
        <Button type="submit" disabled={pending} className="min-h-11 w-full sm:w-auto">
          {pending ? t('pastExpenses.creating') : t('pastExpenses.create')}
        </Button>
      </form>
    </section>
  );
}
