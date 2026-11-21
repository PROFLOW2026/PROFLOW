import { describe, expect, it } from 'vitest';
import type { TakeoffJobDto } from '@/modules/electrical-takeoff/domain/contracts';
import {
  JOB_SILENCE_STALL_MS,
  JOB_STALL_AT_100_MS,
  displayJobPercent,
  formatElapsedClock,
  isJobProgressIndeterminate,
  jobNeedsActivityPulse,
  jobProgressUiPhase,
  jobSilenceStall,
  markStalledAt100,
  safeJobErrorMessage,
  shouldPollJob,
} from '@/modules/electrical-takeoff/ui/takeoff-job-progress-logic';

function job(partial: Partial<TakeoffJobDto> & Pick<TakeoffJobDto, 'status' | 'percent'>): TakeoffJobDto {
  return {
    id: 'j1',
    stage: 'upload',
    message: null,
    startedAtIso: null,
    finishedAtIso: null,
    error: null,
    ...partial,
  };
}

describe('takeoff-job-progress-logic', () => {
  it('never treats percent 100 running as succeeded', () => {
    const j = job({ status: 'running', percent: 100 });
    expect(jobProgressUiPhase(j, null, Date.now())).toBe('polling');
    expect(shouldPollJob('polling')).toBe(true);
  });

  it('completes only on succeeded status', () => {
    expect(jobProgressUiPhase(job({ status: 'succeeded', percent: 100 }), null, 0)).toBe('succeeded');
    expect(shouldPollJob('succeeded')).toBe(false);
  });

  it('marks failed and cancelled terminal', () => {
    expect(jobProgressUiPhase(job({ status: 'failed', percent: 100, error: 'takeoff.ingest_failed' }), null, 0)).toBe(
      'failed',
    );
    expect(jobProgressUiPhase(job({ status: 'cancelled', percent: 40 }), null, 0)).toBe('cancelled');
  });

  it('stalls after 120s at 100% without terminal status', () => {
    const j = job({ status: 'running', percent: 100 });
    const stalledAt = markStalledAt100(j, null)!;
    expect(jobProgressUiPhase(j, stalledAt, stalledAt + JOB_STALL_AT_100_MS - 1)).toBe('polling');
    expect(jobProgressUiPhase(j, stalledAt, stalledAt + JOB_STALL_AT_100_MS)).toBe('stalled');
    expect(shouldPollJob('stalled')).toBe(true);
  });

  it('filters unsafe job errors', () => {
    expect(safeJobErrorMessage('takeoff.ingest_failed')).toBe('takeoff.ingest_failed');
    expect(safeJobErrorMessage('ZodError: invalid')).toBeNull();
    expect(safeJobErrorMessage('Error at foo.ts:12')).toBeNull();
  });

  it('caps displayed percent at 99 until the job actually finishes', () => {
    expect(displayJobPercent(job({ status: 'running', percent: 100 }))).toBe(99);
    expect(displayJobPercent(job({ status: 'running', percent: 11 }))).toBe(11);
    expect(displayJobPercent(job({ status: 'succeeded', percent: 100 }))).toBe(100);
    expect(displayJobPercent(job({ status: 'failed', percent: 40 }))).toBe(40);
  });

  it('treats queued or 0% running work as indeterminate and still pulses', () => {
    expect(isJobProgressIndeterminate(job({ status: 'queued', percent: 0 }))).toBe(true);
    expect(isJobProgressIndeterminate(job({ status: 'running', percent: 0 }))).toBe(true);
    expect(isJobProgressIndeterminate(job({ status: 'running', percent: 11 }))).toBe(false);
    expect(jobNeedsActivityPulse(job({ status: 'running', percent: 11 }))).toBe(true);
    expect(jobNeedsActivityPulse(job({ status: 'succeeded', percent: 100 }))).toBe(false);
  });

  it('warns when a running job has no progress-row update for 45s', () => {
    const updatedAtIso = new Date(1_000).toISOString();
    const running = job({ status: 'running', percent: 11, updatedAtIso });
    expect(jobSilenceStall(running, 1_000 + JOB_SILENCE_STALL_MS - 1)).toBe(false);
    expect(jobSilenceStall(running, 1_000 + JOB_SILENCE_STALL_MS)).toBe(true);
    expect(jobProgressUiPhase(running, null, 1_000 + JOB_SILENCE_STALL_MS)).toBe('silent');
    expect(shouldPollJob('silent')).toBe(true);
  });

  it('marks reconnecting when polling fails and formats elapsed time', () => {
    const running = job({ status: 'running', percent: 11, startedAtIso: new Date(0).toISOString() });
    expect(jobProgressUiPhase(running, null, 5_000, true)).toBe('reconnecting');
    expect(shouldPollJob('reconnecting')).toBe(true);
    expect(formatElapsedClock(new Date(0).toISOString(), 125_000)).toBe('2:05');
  });
});