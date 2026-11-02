/**
 * Root cause of the infra cloud-folder failure: inside the committed admin transaction (service_role),
 * every `asServiceRoleWrite` (token load, mapping write, info file) dropped the transaction to
 * `authenticated`, which has no organization claims, so the project / mapping reads that follow returned nothing.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import type { DbExecutor } from '@/shared/db/types';

const dialect = new PgDialect();

function fakeTransaction(startRole: string) {
  const state = { role: startRole, seen: [] as string[] };
  const db = {
    async execute(query: Parameters<PgDialect['sqlToQuery']>[0]) {
      const text = dialect.sqlToQuery(query).sql;
      state.seen.push(text);
      const set = /set local role (\w+)/.exec(text);
      if (set) state.role = set[1]!;
      if (/current_setting\('role'\)/.test(text)) return [{ role: state.role }];
      return [];
    },
  } as unknown as DbExecutor;
  return { db, state };
}

describe('asServiceRoleWrite role restore', () => {
  it('keeps the committed admin transaction on service_role so later reads still see the organization data', async () => {
    const { db, state } = fakeTransaction('service_role');
    await asServiceRoleWrite(db, async () => {
      expect(state.role).toBe('service_role');
    });
    expect(state.role).toBe('service_role');
  });

  it('still puts a request transaction back to authenticated', async () => {
    const { db, state } = fakeTransaction('authenticated');
    await asServiceRoleWrite(db, async () => {
      expect(state.role).toBe('service_role');
    });
    expect(state.role).toBe('authenticated');
  });

  it('restores the role even when the write fails, and keeps the original error', async () => {
    const { db, state } = fakeTransaction('service_role');
    await expect(
      asServiceRoleWrite(db, async () => {
        throw new Error('write failed');
      }),
    ).rejects.toThrow('write failed');
    expect(state.role).toBe('service_role');
  });

  it('treats a transaction with no role set like before: back to authenticated', async () => {
    const { db, state } = fakeTransaction('none');
    await asServiceRoleWrite(db, async () => undefined);
    expect(state.role).toBe('authenticated');
  });
});
