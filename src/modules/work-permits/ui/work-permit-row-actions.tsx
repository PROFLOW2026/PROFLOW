'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import type { WorkPermitStatus } from '../domain/types';
import {
  approveWorkPermitAction,
  rejectWorkPermitAction,
  submitWorkPermitAction,
} from '../actions/internal-actions';

export function WorkPermitRowActions({
  projectId,
  workPermitId,
  status,
}: {
  projectId: string;
  workPermitId: string;
  status: WorkPermitStatus;
}) {
  const t = useTranslations('workPermits');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: 'submit' | 'approve' | 'reject') => {
    startTransition(async () => {
      const input = { projectId, workPermitId };
      const result =
        action === 'submit'
          ? await submitWorkPermitAction(input)
          : action === 'approve'
            ? await approveWorkPermitAction(input)
            : await rejectWorkPermitAction(input);
      if (result.ok) router.refresh();
    });
  };

  if (status === 'draft') {
    return (
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run('submit')}>
        {t('actions.submit')}
      </Button>
    );
  }

  if (status === 'submitted') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="primary" disabled={pending} onClick={() => run('approve')}>
          {t('actions.approve')}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run('reject')}>
          {t('actions.reject')}
        </Button>
      </div>
    );
  }

  return null;
}
