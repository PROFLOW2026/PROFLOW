import { describe, expect, it } from 'vitest';
import { withEmployeeAppAuditMeta } from '@/modules/employee-app/domain/audit-meta';

describe('withEmployeeAppAuditMeta', () => {
  it('adds script attribution to audit detail', () => {
    expect(
      withEmployeeAppAuditMeta({ username: 'TEST01' }, {
        source: 'script',
        scriptName: '.post-0090-login-smoke.ts',
      }),
    ).toEqual({
      username: 'TEST01',
      source: 'script',
      scriptName: '.post-0090-login-smoke.ts',
    });
  });

  it('returns original detail when meta is omitted', () => {
    expect(withEmployeeAppAuditMeta({ preset: 'field_worker' })).toEqual({ preset: 'field_worker' });
  });
});
