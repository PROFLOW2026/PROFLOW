import type { TakeoffJobDto, TakeoffJobStatus } from '../domain/contracts';

/** How long {@link TakeoffJobProgress} may sit at 100% without a terminal job status. */
export const JOB_STALL_AT_100_MS = 120_000;

export type JobProgressUiPhase = 'polling' | 'stalled' | 'failed' | 'cancelled' | 'succeeded';

const TERMINAL: ReadonlySet<TakeoffJobStatus> = new Set(['succeeded', 'failed', 'cancelled']);

export function isJobTerminal(status: TakeoffJobStatus): boolean {
  return TERMINAL.has(status);
}

/** UI phase from the latest server job DTO (never infers success from percent alone). */
export function jobProgressUiPhase(
  job: TakeoffJobDto | null,
  stalledAt100Ms: number | null,
  nowMs: number,
): JobProgressUiPhase {
  if (!job) return 'polling';
  if (job.status === 'succeeded') return 'succeeded';
  if (job.status === 'failed') return 'failed';
  if (job.status === 'cancelled') return 'cancelled';
  const atHundred =
    job.percent >= 100 && (job.status === 'queued' || job.status === 'running' || job.status === 'partial');
  if (atHundred && stalledAt100Ms != null && nowMs - stalledAt100Ms >= JOB_STALL_AT_100_MS) {
    return 'stalled';
  }
  return 'polling';
}

export function shouldPollJob(phase: JobProgressUiPhase): boolean {
  return phase === 'polling' || phase === 'stalled';
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