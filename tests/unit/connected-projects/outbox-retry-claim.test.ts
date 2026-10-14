import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('retryClaimCashProjectionOutbox claim SQL', () => {
  it('uses FOR UPDATE SKIP LOCKED and reclaims stale processing rows', () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        'src/modules/connected-projects/application/retry-claim-cash-projection-outbox.ts',
      ),
      'utf8',
    );
    expect(source).toContain('FOR UPDATE SKIP LOCKED');
    expect(source).toContain("status = 'processing'");
    expect(source).toMatch(/STALE_PROCESSING_MS|15 \* 60 \* 1000/);
  });
});
