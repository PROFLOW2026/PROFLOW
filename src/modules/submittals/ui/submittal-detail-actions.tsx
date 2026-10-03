'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { SUBMITTAL_REVIEW_DECISIONS, type SubmittalAction, type SubmittalReviewDecision } from '../domain/types';
import { reviewRequiresComments } from '../domain/lifecycle';
import { useRouter } from '@/shared/i18n/navigation';
import {
  openSubmittalRevisionAction,
  reviewSubmittalAction,
  startSubmittalReviewAction,
  submitSubmittalAction,
  updateSubmittalRevisionNotesAction,
  withdrawSubmittalAction,
} from '../actions/internal-actions';
import { FormError, FormRow, selectClassName } from './form-controls';

export function SubmittalDetailActions({
  submittalId,
  availableActions,
  draftRevisionId,
  currentRevisionId,
}: {
  submittalId: string;
  availableActions: readonly SubmittalAction[];
  draftRevisionId: string | null;
  currentRevisionId: string;
}) {
  const t = useTranslations('submittals');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [decision, setDecision] = useState<SubmittalReviewDecision>('approved');
  const [comments, setComments] = useState('');

  if (availableActions.length === 0 && !draftRevisionId) return null;

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
        {draftRevisionId ? (
          <div className="flex flex-col gap-2">
            <FormRow label={t('fields.notes')} hint={t('fields.notesHint')}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </FormRow>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => updateSubmittalRevisionNotesAction({ submittalId, notes: notes || null }))}
            >
              {t('actions.saveNotes')}
            </Button>
            {availableActions.includes('submit') ? (
              <Button type="button" disabled={pending} onClick={() => run(() => submitSubmittalAction({ submittalId }))}>
                {t('actions.submit')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {availableActions.includes('start_review') ? (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => startSubmittalReviewAction({ submittalId }))}>
            {t('actions.startReview')}
          </Button>
        ) : null}
        {availableActions.includes('review') ? (
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
            <p className="text-sm font-medium">{t('actions.reviewTitle')}</p>
            <FormRow label={t('actions.decision')}>
              <select
                className={selectClassName()}
                value={decision}
                onChange={(e) => setDecision(e.target.value as SubmittalReviewDecision)}
              >
                {SUBMITTAL_REVIEW_DECISIONS.map((d) => (
                  <option key={d} value={d}>
                    {t(`decision.${d}`)}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label={t('actions.comments')} hint={t('actions.commentsHint')}>
              <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} />
            </FormRow>
            <Button
              type="button"
              disabled={pending || (reviewRequiresComments(decision) && !comments.trim())}
              onClick={() =>
                run(() =>
                  reviewSubmittalAction({
                    submittalId,
                    revisionId: currentRevisionId,
                    decision,
                    comments: comments.trim() || null,
                  }),
                )
              }
            >
              {t('actions.saveReview')}
            </Button>
          </div>
        ) : null}
        {availableActions.includes('open_revision') ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('actions.openRevisionHint')}</p>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => openSubmittalRevisionAction({ submittalId }))}>
              {t('actions.openRevision')}
            </Button>
          </div>
        ) : null}
        {availableActions.includes('withdraw') ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => withdrawSubmittalAction({ submittalId }))}>
            {t('actions.withdraw')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
