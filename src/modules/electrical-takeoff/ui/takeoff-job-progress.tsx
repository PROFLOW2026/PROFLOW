'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { TakeoffJobDto } from '../domain/contracts';
import { useTakeoffApi } from './api-provider';
import {
  jobProgressUiPhase,
  markStalledAt100,
  safeJobErrorMessage,
  shouldPollJob,
} from './takeoff-job-progress-logic';

const POLL_MS = 1500;
const CLOCK_MS = 1000;

export function TakeoffJobProgress({
  jobId,
  onDone,
  onRetry,
  onClose,
}: {
  jobId: string;
  onDone: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('takeoff');
  const api = useTakeoffApi();
  const [job, setJob] = useState<TakeoffJobDto | null>(null);
  const [stalledAt100Ms, setStalledAt100Ms] = useState<number | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const jobRef = useRef<TakeoffJobDto | null>(null);
  const stallRef = useRef<number | null>(null);

  const pollOnce = useCallback(async () => {
    const next = await api.getJobProgress(jobId);
    jobRef.current = next;
    stallRef.current = markStalledAt100(next, stallRef.current);
    setJob(next);
    setStalledAt100Ms(stallRef.current);
    if (next.status === 'succeeded') onDone();
    return jobProgressUiPhase(next, stallRef.current, Date.now());
  }, [api, jobId, onDone]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const phase = await pollOnce();
        if (cancelled) return;
        if (shouldPollJob(phase)) {
          timer = window.setTimeout(() => void tick(), POLL_MS);
        }
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void tick(), POLL_MS);
      }
    };
    timer = window.setTimeout(() => void tick(), 0);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [pollOnce]);

  useEffect(() => {
    const id = window.setInterval(() => setClockMs(Date.now()), CLOCK_MS);
    return () => window.clearInterval(id);
  }, []);

  const phase = jobProgressUiPhase(job, stalledAt100Ms, clockMs);
  const stageLabel = job ? t(`jobStage.${job.stage}`) : t('jobStage.queued');
  const safeError = safeJobErrorMessage(job?.error);
  const showTerminalError = phase === 'failed' || phase === 'cancelled';
  const showStall = phase === 'stalled';

  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      <p className="text-sm font-medium text-[var(--pf-text-primary)]">{t('progress.title')}</p>

      {showTerminalError ? (
        <div
          data-testid="takeoff-job-failed"
          className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3"
        >
          <p className="text-sm font-semibold text-[var(--pf-status-danger-fg)]">
            {phase === 'cancelled' ? t('progress.cancelledTitle') : t('progress.failedTitle')}
          </p>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {safeError ? t('progress.failedReason', { reason: safeError }) : t('progress.failedHint')}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              data-testid="takeoff-job-retry"
              className="min-h-11 flex-1"
              onClick={onRetry}
            >
              {t('progress.retry')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              data-testid="takeoff-job-close"
              className="min-h-11 flex-1"
              onClick={onClose}
            >
              {t('progress.close')}
            </Button>
          </div>
        </div>
      ) : showStall ? (
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] p-3">
          <p className="text-sm font-semibold text-[var(--pf-status-warning-fg)]">{t('progress.stalledTitle')}</p>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('progress.stalledHint')}</p>
          <Button type="button" variant="secondary" className="min-h-11" onClick={() => void pollOnce()}>
            {t('progress.refresh')}
          </Button>
        </div>
      ) : null}

      {!showTerminalError ? (
        <>
          <p className="text-sm text-[var(--pf-text-secondary)]">{stageLabel}</p>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--pf-bg-muted)]">
            <div
              className="h-full bg-[var(--pf-action-primary)] transition-[width]"
              style={{ width: `${Math.min(100, job?.percent ?? 0)}%` }}
            />
          </div>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('progress.percent', { value: job?.percent ?? 0 })}</p>
          {phase === 'polling' ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => void api.cancelJob(jobId)}
            >
              {t('progress.cancel')}
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}