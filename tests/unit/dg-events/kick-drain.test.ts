import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('scheduleDgEventDrain', () => {
  it('uses a single remote worker kick (no in-request local drain)', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/modules/dg-events/application/kick.ts'),
      'utf8',
    );
    expect(source).toContain('kickRemote()');
    expect(source).not.toMatch(/kickLocal|runDgEventsOpsWorker|DRAIN_LIMIT_MS/);
  });
});
