import { describe, expect, it } from 'vitest';
import { canTransitionJob, jobFailurePreservesPriorResults } from '@/modules/electrical-takeoff/application/job-state';

describe('job state machine', () => {
  it('allows queued -> running -> succeeded', () => {
    expect(canTransitionJob('queued', 'running')).toBe(true);
    expect(canTransitionJob('running', 'succeeded')).toBe(true);
    expect(canTransitionJob('succeeded', 'running')).toBe(false);
  });

  it('failed jobs preserve prior results flag', () => {
    expect(jobFailurePreservesPriorResults('failed')).toBe(true);
    expect(jobFailurePreservesPriorResults('succeeded')).toBe(false);
  });
});