import { describe, expect, it } from 'vitest';
import { isPostgresPermissionDenied, postgresSqlState } from '@/shared/db/postgres-sql-state';

describe('postgresSqlState', () => {
  it('reads SQLSTATE from nested Drizzle/postgres-js errors', () => {
    const inner = Object.assign(new Error('permission denied'), { code: '42501' });
    const outer = Object.assign(new Error('Failed query'), { cause: inner });
    expect(postgresSqlState(outer)).toBe('42501');
    expect(isPostgresPermissionDenied(outer)).toBe(true);
  });

  it('returns undefined for unrelated errors', () => {
    expect(isPostgresPermissionDenied(new Error('boom'))).toBe(false);
  });
});
