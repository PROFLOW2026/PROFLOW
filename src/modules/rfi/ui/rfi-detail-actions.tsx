'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { RfiAction } from '../domain/types';
import { useRouter } from '@/shared/i18n/navigation';
import {
  answerRfiAction,
  closeRfiAction,
  reopenRfiAction,
  startRfiReviewAction,
  submitRfiAction,
} from '../actions/internal-actions';
import { FormError, FormRow } from './form-controls';

export function RfiDetailActions({
  rfiId,
  availableActions,
}: {
  rfiId: string;
  availableActions: readonly RfiAction[];
}) {
  const t = useTranslations('rfi');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [reason, setReason] = useState('');
  const [closeAfterAnswer, setCloseAfterAnswer] = useState(false);

  if (availableActions.length === 0) return null;

  function refresh() {
    router.refresh();
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? 'Error');
        return;
      }
      refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('actions.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormError message={error} />
        {availableActions.includes('submit') ? (
          <Button type="button" disabled={pending} onClick={() => run(() => submitRfiAction({ rfiId }))}>
            {t('actions.submit')}
          </Button>
        ) : null}
        {availableActions.includes('start_review') ? (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => startRfiReviewAction({ rfiId }))}>
            {t('actions.startReview')}
          </Button>
        ) : null}
        {availableActions.includes('answer') ? (
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
            <FormRow label={t('actions.answerLabel')} hint={t('actions.answerHint')}>
              <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} required />
            </FormRow>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={closeAfterAnswer} onChange={(e) => setCloseAfterAnswer(e.target.checked)} />
              {t('actions.answerAndClose')}
            </label>
            <Button
              type="button"
              disabled={pending || !answer.trim()}
              onClick={() =>
                run(() => answerRfiAction({ rfiId, body: answer.trim(), close: closeAfterAnswer }))
              }
            >
              {t('actions.answer')}
            </Button>
          </div>
        ) : null}
        {availableActions.includes('close') ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('actions.closeWithoutAnswerHint')}</p>
            <FormRow label={t('actions.reason')} hint={t('actions.reasonHint')}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </FormRow>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !reason.trim()}
              onClick={() => run(() => closeRfiAction({ rfiId, reason: reason.trim() }))}
            >
              {t('actions.close')}
            </Button>
          </div>
        ) : null}
        {availableActions.includes('reopen') ? (
          <div className="flex flex-col gap-2">
            <FormRow label={t('actions.reason')} hint={t('actions.reasonHint')}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </FormRow>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !reason.trim()}
              onClick={() => run(() => reopenRfiAction({ rfiId, reason: reason.trim() }))}
            >
              {t('actions.reopen')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
