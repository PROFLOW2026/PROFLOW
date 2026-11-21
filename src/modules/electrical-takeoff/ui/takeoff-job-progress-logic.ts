import type { TakeoffJobDto, TakeoffJobStatus } from '../domain/contracts';

/** How long {@link TakeoffJobProgress} may sit at 100% without a terminal job status. */
export const JOB_STALL_AT_100_MS = 120_000;

/** How long a running job may go without a progress-row update before the UI warns. */
export const JOB_SILENCE_STALL_MS = 45_000;

export type JobProgressUiPhase =
  | 'polling'
  | 'stalled'
  | 'silent'
  | 'reconnecting'
  | 'failed'
  | 'cancelled'
  | 'succeeded';

const TERMINAL: ReadonlySet<TakeoffJobStatus> = new Set(['succeeded', 'failed', 'cancelled']);

export function isJobTerminal(status: TakeoffJobStatus): boolean {
  return TERMINAL.has(status);
}

/** UI phase from the latest server job DTO (never infers success from percent alone). */
export function jobProgressUiPhase(
  job: TakeoffJobDto | null,
  stalledAt100Ms: number | null,
  nowMs: number,
  pollFailed = false,
): JobProgressUiPhase {
  if (pollFailed && (!job || !isJobTerminal(job.status))) return 'reconnecting';
  if (!job) return 'polling';
  if (job.status === 'succeeded') return 'succeeded';
  if (job.status === 'failed') return 'failed';
  if (job.status === 'cancelled') return 'cancelled';
  const atHundred =
    job.percent >= 100 && (job.status === 'queued' || job.status === 'running' || job.status === 'partial');
  if (atHundred && stalledAt100Ms != null && nowMs - stalledAt100Ms >= JOB_STALL_AT_100_MS) {
    return 'stalled';
  }
  if (jobSilenceStall(job, nowMs)) return 'silent';
  return 'polling';
}

export function shouldPollJob(phase: JobProgressUiPhase): boolean {
  return phase === 'polling' || phase === 'stalled' || phase === 'silent' || phase === 'reconnecting';
}

/** Never show 100% until the worker has actually finished. */
export function displayJobPercent(job: TakeoffJobDto | null): number {
  if (!job) return 0;
  const raw = Math.max(0, Math.min(100, job.percent));
  if (job.status === 'succeeded' || job.status === 'partial') return raw;
  if (job.status === 'failed' || job.status === 'cancelled') return raw;
  return Math.min(99, raw);
}

export function jobNeedsActivityPulse(job: TakeoffJobDto | null): boolean {
  if (!job) return true;
  return !isJobTerminal(job.status);
}

export function isJobProgressIndeterminate(job: TakeoffJobDto | null): boolean {
  if (!job) return true;
  if (isJobTerminal(job.status)) return false;
  return job.status === 'queued' || job.percent <= 0;
}

export function jobSilenceStall(
  job: TakeoffJobDto | null,
  nowMs: number,
  silenceMs = JOB_SILENCE_STALL_MS,
): boolean {
  if (!job || isJobTerminal(job.status)) return false;
  const updated = job.updatedAtIso ? Date.parse(job.updatedAtIso) : Number.NaN;
  if (!Number.isFinite(updated)) return false;
  return nowMs - updated >= silenceMs;
}

export function formatElapsedClock(startedAtIso: string | null | undefined, nowMs: number): string | null {
  if (!startedAtIso) return null;
  const started = Date.parse(startedAtIso);
  if (!Number.isFinite(started)) return null;
  const sec = Math.max(0, Math.floor((nowMs - started) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function secondsSinceIso(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

/** User-safe job error text — never raw validation stacks. */
export function safeJobErrorMessage(error: string | null | undefined): string | null {
  if (!error?.trim()) return null;
  const e = error.trim();
  if (e.length > 160) return null;
  if (e.includes('\n') || /zod|stack|syntaxerror|typeerror/i.test(e)) return null;
  if (e.includes(' at ') && e.includes('.ts')) return null;
  if (/^takeoff(\.|_)/i.test(e)) return e;
  if (/^[a-z][a-z0-9_.-]{0,80}$/i.test(e)) return e;
  if (e.length <= 100 && !e.includes('{')) return e;
  return null;
}

export function markStalledAt100(
  job: TakeoffJobDto | null,
  prev: number | null,
): number | null {
  if (!job) return prev;
  if (job.percent >= 100 && (job.status === 'queued' || job.status === 'running' || job.status === 'partial')) {
    return prev ?? Date.now();
  }
  return null;
}
