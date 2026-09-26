'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import {
  loadProjectProgressViewAction,
  setProjectProgressSourceAction,
  type ProjectProgressSnapshot,
} from './project-progress-mode-actions';

type ProgressSource = 'manual' | 'tasks';

export function ProjectProgressModeControl({
  projectId,
  progressSource,
  onSourceChange,
}: {
  projectId: string;
  progressSource: ProgressSource;
  onSourceChange?: (source: ProgressSource) => void;
}) {
  const t = useTranslations('projects.details');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [snapshot, setSnapshot] = useState<ProjectProgressSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadProjectProgressViewAction(projectId)
      .then((view) => {
        if (active) setSnapshot(view);
      })
      .catch(() => {
        if (active) setSnapshot(null);
      });
    return () => {
      active = false;
    };
  }, [projectId, progressSource]);

  function change(next: ProgressSource) {
    if (next === progressSource || isPending) return;
    setError(null);
    onSourceChange?.(next);
    startTransition(() => {
      void setProjectProgressSourceAction(projectId, next)
        .then((view) => {
          setSnapshot(view);
          router.refresh();
        })
        .catch(() => {
          onSourceChange?.(progressSource);
          setError(t('progressSourceSaveFailed'));
        });
    });
  }

  const shown = snapshot?.source === 'tasks' ? snapshot : null;

  return (
    <fieldset className="flex flex-col gap-2" disabled={isPending}>
      <legend className="text-sm font-medium">{t('progressSourceLabel')}</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={progressSource === 'manual'}
            onChange={() => change('manual')}
          />
          <span>{t('progressSourceManual')}</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={progressSource === 'tasks'}
            onChange={() => change('tasks')}
          />
          <span>{t('progressSourceTasks')}</span>
        </label>
      </div>
      {progressSource === 'tasks' ? (
        <div className="text-sm text-[var(--pf-text-secondary)]">
          <p>{t('progressSourceTasksHint')}</p>
          {shown ? (
            <>
              <p className="mt-1 font-medium text-[var(--pf-text-primary)]">
                {shown.displayedPercent != null
                  ? `${t('progressDerived')}: ${shown.displayedPercent}%`
                  : t('progressDerivedEmpty')}
              </p>
              {shown.contributingCount > 0 ? (
                <p className="mt-1">
                  {t('progressDerivedCounts', {
                    done: shown.doneCount,
                    total: shown.contributingCount,
                  })}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('progressSourceManualHint')}</p>
      )}
      {error ? <p className="text-sm text-[var(--pf-status-danger-fg)]">{error}</p> : null}
    </fieldset>
  );
}
