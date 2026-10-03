'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/shared/i18n/navigation';
import { reviewComplianceDocumentAction } from '../actions/internal-actions';

export function ComplianceReviewActions({
  projectId,
  documentId,
  requirementTitle,
}: {
  projectId: string;
  documentId: string;
  requirementTitle: string;
}) {
  const t = useTranslations('contractorCompliance');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  function run(decision: 'approved' | 'rejected') {
    setError(null);
    startTransition(async () => {
      const result = await reviewComplianceDocumentAction({
        projectId,
        documentId,
        decision,
        note: decision === 'rejected' ? note : undefined,
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--pf-border)] p-3">
      <p className="text-sm font-medium text-[var(--pf-text-primary)]">{requirementTitle}</p>
      {error ? <p className="text-sm text-[var(--pf-danger)]">{error}</p> : null}
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('review.rejectionPlaceholder')}
        aria-label={t('review.rejectionPlaceholder')}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => run('approved')}>
          {t('review.approve')}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run('rejected')}>
          {t('review.reject')}
        </Button>
      </div>
    </div>
  );
}
