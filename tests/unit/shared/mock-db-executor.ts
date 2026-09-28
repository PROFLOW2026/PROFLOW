import { vi } from 'vitest';
import type { DbExecutor } from '@/shared/db/types';

/** Minimal Postgres executor stub for unit tests that hit SAVEPOINT helpers. */
export function mockDbExecutor(): DbExecutor {
  return {
    execute: vi.fn().mockResolvedValue(undefined),
  } as unknown as DbExecutor;
}
