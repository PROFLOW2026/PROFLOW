import { describe, expect, it } from 'vitest';
import { runWithMaxConcurrency } from '@/shared/async/run-with-concurrency';

describe('runWithMaxConcurrency (OPS-001)', () => {
  it('never exceeds the configured concurrency', async () => {
    let inFlight = 0;
    let maxSeen = 0;
    const tasks = Array.from({ length: 10 }, () => async () => {
      inFlight += 1;
      maxSeen = Math.max(maxSeen, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 25));
      inFlight -= 1;
      return true;
    });

    await runWithMaxConcurrency(tasks, 4);
    expect(maxSeen).toBeLessThanOrEqual(4);
    expect(maxSeen).toBeGreaterThan(1);
  });
});
