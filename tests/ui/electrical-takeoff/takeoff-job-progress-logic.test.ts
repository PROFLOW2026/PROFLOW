import { describe, expect, it } from 'vitest';
import type { TakeoffJobDto } from '@/modules/electrical-takeoff/domain/contracts';
import {
  JOB_STALL_AT_100_MS,
  jobProgressUiPhase,
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
});