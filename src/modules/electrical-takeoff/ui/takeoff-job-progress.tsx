'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { TakeoffJobDto } from '../domain/contracts';
import { useTakeoffApi } from './api-provider';
import {
  displayJobPercent,
  formatElapsedClock,
  isJobProgressIndeterminate,
  jobNeedsActivityPulse,
  jobProgressUiPhase,
  markStalledAt100,
  safeJobErrorMessage,
  secondsSinceIso,
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
  const [pollFailed, setPollFailed] = useState(false);
  const [lastPollAtMs, setLastPollAtMs] = useState<number | null>(null);
  const jobRef = useRef<TakeoffJobDto | null>(null);
  const stallRef = useRef<number | null>(null);

  const pollOnce = useCallback(async () => {
    try {
      const next = await api.getJobProgress(jobId);
      jobRef.current = next;
      stallRef.current = markStalledAt100(next, stallRef.current);
      setJob(next);
      setStalledAt100Ms(stallRef.current);
      setPollFailed(false);
      setLastPollAtMs(Date.now());
      if (next.status === 'succeeded') onDone();
      return jobProgressUiPhase(next, stallRef.current, Date.now(), false);
    } catch {
      setPollFailed(true);
      return jobProgressUiPhase(jobRef.current, stallRef.current, Date.now(), true);
    }
  }, [api, jobId, onDone]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      const phase = await pollOnce();
      if (cancelled) return;
      if (shouldPollJob(phase)) {
        const delay = phase === 'reconnecting' ? 400 : POLL_MS;
        timer = window.setTimeout(() => void tick(), delay);
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

  const phase = jobProgressUiPhase(job, stalledAt100Ms, clockMs, pollFailed);
  const stageLabel = job ? t(`jobStage.${job.stage}`) : t('jobStage.queued');
  const safeError = safeJobErrorMessage(job?.error);
  const showTerminalError = phase === 'failed' || phase === 'cancelled';
  const showStall = phase === 'stalled';
  const showSilent = phase === 'silent';
  const percent = displayJobPercent(job);
  const indeterminate = isJobProgressIndeterminate(job);
  const pulse = jobNeedsActivityPulse(job);
  const elapsed = formatElapsedClock(job?.startedAtIso, clockMs);
  const lastProgressSec = secondsSinceIso(job?.updatedAtIso, clockMs);
  const lastCheckSec =
    lastPollAtMs != null ? Math.max(0, Math.floor((clockMs - lastPollAtMs) / 1000)) : null;

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
      ) : showSilent ? (
        <div
          data-testid="takeoff-job-silent"
          className="flex flex-col gap-2 rounded-lg border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] p-3"
        >
          <p className="text-sm font-semibold text-[var(--pf-status-warning-fg)]">{t('progress.silentTitle')}</p>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('progress.silentHint', { seconds: lastProgressSec ?? 0 })}
          </p>
          <Button type="button" variant="secondary" className="min-h-11" onClick={() => void pollOnce()}>
            {t('progress.refresh')}
          </Button>
        </div>
      ) : null}

      {phase === 'reconnecting' ? (
        <p data-testid="takeoff-job-reconnecting" className="text-sm text-[var(--pf-text-secondary)]">
          {t('progress.reconnecting')}
        </p>
      ) : null}

      {!showTerminalError ? (
        <>
          <p className="text-sm text-[var(--pf-text-secondary)]">{stageLabel}</p>
          {job?.message ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{job.message}</p>
          ) : pulse ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('progress.working')}</p>
          ) : null}
          <div
            data-testid="takeoff-job-progress-bar"
            data-percent={percent}
            data-indeterminate={indeterminate ? 'true' : 'false'}
            data-pulse={pulse ? 'true' : 'false'}
            className="relative h-2 overflow-hidden rounded-full bg-[var(--pf-bg-muted)]"
          >
            <div
              className={`h-full bg-[var(--pf-action-primary)] ${indeterminate ? 'w-1/3 animate-pulse' : 'transition-[width]'}`}
              style={indeterminate ? undefined : { width: `${percent}%` }}
            />
            {pulse && !indeterminate ? (
              <div className="pointer-events-none absolute inset-0 animate-pulse bg-[var(--pf-action-primary)]/20" />
            ) : null}
          </div>
          <p className="text-xs text-[var(--pf-text-muted)]">
            {indeterminate ? t('progress.indeterminate') : t('progress.percent', { value: percent })}
          </p>
          <div className="flex flex-col gap-0.5 text-xs text-[var(--pf-text-muted)]">
            {elapsed ? <p data-testid="takeoff-job-elapsed">{t('progress.elapsed', { time: elapsed })}</p> : null}
            {lastProgressSec != null ? (
              <p data-testid="takeoff-job-last-progress">
                {t('progress.lastProgress', { seconds: lastProgressSec })}
              </p>
            ) : null}
            {lastCheckSec != null ? (
              <p data-testid="takeoff-job-last-check">{t('progress.lastCheck', { seconds: lastCheckSec })}</p>
            ) : null}
          </div>
          {phase === 'polling' || phase === 'silent' || phase === 'stalled' || phase === 'reconnecting' ? (
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
