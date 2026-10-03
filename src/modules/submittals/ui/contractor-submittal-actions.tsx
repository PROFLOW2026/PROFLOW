'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { SubmittalAction } from '../domain/types';
import { submittalNeedsContractorAction } from '../domain/lifecycle';
import { useRouter } from '@/shared/i18n/navigation';
import {
  openContractorRevisionAction,
  submitContractorSubmittalAction,
  updateContractorRevisionNotesAction,
  withdrawContractorSubmittalAction,
} from '../actions/external-actions';
import { FormError, FormRow } from './form-controls';

export function ContractorSubmittalActions({
  organizationId,
  submittalId,
  status,
  availableActions,
  draftRevisionId,
}: {
  organizationId: string;
  submittalId: string;
  status: string;
  availableActions: readonly SubmittalAction[];
  draftRevisionId: string | null;
}) {
  const t = useTranslations('submittals');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const showResubmitHint = submittalNeedsContractorAction(status as never);
  if (availableActions.length === 0 && !draftRevisionId && !showResubmitHint) return null;

  function refresh() {
    router.refresh();
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? 'Error');
      else refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('actions.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormError message={error} />
        {showResubmitHint ? <p className="text-sm text-[var(--pf-text-secondary)]">{t('portal.resubmitHint')}</p> : null}
        {availableActions.includes('open_revision') ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => openContractorRevisionAction({ organizationId, submittalId }))}
          >
            {t('actions.openRevision')}
          </Button>
        ) : null}
        {draftRevisionId ? (
          <>
            <FormRow label={t('fields.notes')} hint={t('fields.notesHint')}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </FormRow>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(() => updateContractorRevisionNotesAction({ organizationId, submittalId, notes: notes || null }))
              }
            >
              {t('actions.saveNotes')}
            </Button>
            {availableActions.includes('submit') ? (
              <Button
                type="button"
                disabled={pending}
                onClick={() => run(() => submitContractorSubmittalAction({ organizationId, submittalId }))}
              >
                {t('actions.submit')}
              </Button>
            ) : null}
          </>
        ) : null}
        {availableActions.includes('withdraw') ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => withdrawContractorSubmittalAction({ organizationId, submittalId }))}
          >
            {t('actions.withdraw')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
