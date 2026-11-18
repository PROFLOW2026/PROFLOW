import { describe, expect, it } from 'vitest';
import {
  parseWorkerHealth,
  REQUIRED_WORKER_PROTOCOL,
  workerMissingCapability,
  workerProtocolBlocksDispatch,
} from '@/modules/electrical-takeoff/domain/worker-health';

describe('worker-health', () => {
  it('defaults protocol to 1 when missing (legacy worker)', () => {
    const h = parseWorkerHealth({ status: 'ok', workerBuild: 'abc' });
    expect(h?.protocol).toBe(1);
    expect(workerProtocolBlocksDispatch(h)).toBe(false);
  });

  it('blocks when protocol below required', () => {
    const h = parseWorkerHealth({ protocol: 0, capabilities: [], workerBuild: 'x' });
    expect(workerProtocolBlocksDispatch(h)).toBe(true);
  });

  it('warns on missing capability without blocking', () => {
    const h = parseWorkerHealth({
      protocol: REQUIRED_WORKER_PROTOCOL,
      capabilities: ['xrefRefs'],
      workerBuild: 'x',
    });
    expect(workerMissingCapability(h, 'xrefFetch')).toBe(true);
    expect(workerProtocolBlocksDispatch(h)).toBe(false);
  });
});