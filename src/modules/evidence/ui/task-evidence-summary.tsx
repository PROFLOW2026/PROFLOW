'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { listTaskEvidenceSummaryAction } from '../actions';
import type { TaskEvidenceSummary } from '../application/task-evidence-summary';

export function TaskEvidenceSummary(props: { readonly taskId: string }) {
  const t = useTranslations('tasks');
  const [summary, setSummary] = useState<TaskEvidenceSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listTaskEvidenceSummaryAction(props.taskId).then((data) => {
      if (!cancelled) setSummary(data);
    });
    return () => {
      cancelled = true;
    };
  }, [props.taskId]);

  if (!summary || summary.count === 0) return null;

  return (
    <div className="mt-2">
      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t('evidenceSummary', { count: summary.count })}
      </p>
      <Link
        href={`/tasks/${props.taskId}#evidence`}
        className="text-sm font-medium text-[var(--pf-text-brand)] underline underline-offset-2"
      >
        {t('evidenceOpenFull')}
      </Link>
    </div>
  );
}
