import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ops health read model', () => {
  it('uses boolean workerSecretsConfigured without exposing env values', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/modules/ops/application/ops-health-readmodel.ts'),
      'utf8',
    );
    expect(source).toContain('workerSecretsConfigured()');
    expect(source).not.toMatch(/process\.env\.CRON_SECRET/);
    expect(source).toContain('COUNT_LIMIT');
  });
});
