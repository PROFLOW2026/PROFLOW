import { describe, expect, it } from 'vitest';
import { safeJobErrorMessage } from '@/modules/electrical-takeoff/ui/takeoff-job-progress-logic';

describe('takeoff job progress errors', () => {
  it('shows worker_progress_stalled as a user-safe message', () => {
    expect(safeJobErrorMessage('worker_progress_stalled')).toBe('worker_progress_stalled');
  });
});