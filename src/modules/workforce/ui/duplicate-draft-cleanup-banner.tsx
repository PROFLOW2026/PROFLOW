'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { purgeExactDuplicateDraftsAction } from '@/app/[locale]/(app)/workforce/time/actions';

interface DuplicateDraftCleanupBannerProps {
  readonly duplicateExtraCount: number;
  readonly employeeId?: string;
  readonly projectId?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
}

export function DuplicateDraftCleanupBanner({
  duplicateExtraCount,
  employeeId,
  projectId,
  fromDate,
  toDate,
}: DuplicateDraftCleanupBannerProps) {
  const t = useTranslations('workforce.time.duplicates');
  const [state, action, pending] = useActionState(purgeExactDuplicateDraftsAction, {});

  if (duplicateExtraCount <= 0 && !state.ok) return null;

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      {state.ok ? (
        <p>{t('cleaned', { count: state.removedCount ?? 0 })}</p>
      ) : (
        <>
          <p className="font-medium">{t('title', { count: duplicateExtraCount })}</p>
          <p className="mt-1 text-[var(--pf-text-secondary)]">{t('description')}</p>
          {state.error ? <p className="mt-2 text-destructive">{state.error}</p> : null}
          <form action={action} className="mt-3">
            {employeeId ? <input type="hidden" name="employeeId" value={employeeId} /> : null}
            {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
            {fromDate ? <input type="hidden" name="fromDate" value={fromDate} /> : null}
            {toDate ? <input type="hidden" name="toDate" value={toDate} /> : null}
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? t('cleaning') : t('cleanup')}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
