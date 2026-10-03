'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { submitContractorDefectCompletionAction } from './actions';
import { INITIAL_QUALITY_FORM_STATE } from './form-state';

export function ContractorDefectPanel({
  organizationId,
  projectId,
  defectId,
  canSubmitCompletion,
  status,
  lastRejectedNote,
}: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly defectId: string;
  readonly canSubmitCompletion: boolean;
  readonly status: string;
  readonly lastRejectedNote: string | null;
}) {
  const t = useTranslations('defects');
  const [state, formAction, pending] = useActionState(
    submitContractorDefectCompletionAction.bind(null, organizationId, projectId, defectId),
    INITIAL_QUALITY_FORM_STATE,
  );

  if (status === 'closed') {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('portal.closed')}</p>;
  }
  if (status === 'completion_submitted' || status === 'verification') {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('portal.awaiting')}</p>;
  }
  if (!canSubmitCompletion) return null;

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-subtle)] p-4">
      <h3 className="text-sm font-semibold">{t('portal.submitTitle')}</h3>
      {lastRejectedNote ? (
        <Alert tone="warning">
          <p className="font-medium">{t('portal.rejectedReason')}</p>
          <p className="mt-1 whitespace-pre-wrap">{lastRejectedNote}</p>
        </Alert>
      ) : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('portal.submitHint')}</p>
      <Textarea name="note" rows={3} maxLength={2000} />
      <Button type="submit" variant="primary" block disabled={pending}>
        {t('portal.submit')}
      </Button>
    </form>
  );
}
