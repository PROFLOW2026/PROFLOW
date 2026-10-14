import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DbClient from '@/shared/db/client';
import type { Transaction } from '@/shared/db/types';
import type { TestDatabase } from '../../setup/database';

vi.mock('server-only', () => ({}));

const { testDbHolder } = vi.hoisted(() => ({
  testDbHolder: { db: null as TestDatabase | null },
}));

vi.mock('@/shared/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof DbClient>();
  return {
    ...actual,
    getAdminDb: () => {
      if (!testDbHolder.db) throw new Error('test database not initialized');
      return testDbHolder.db.adminDb;
    },
    withUserContext: <T>(userId: string, fn: (tx: Transaction) => Promise<T>) => {
      if (!testDbHolder.db) throw new Error('test database not initialized');
      return testDbHolder.db.asUser(userId, fn);
    },
  };
});

import { GET } from '@/app/api/calendar/feed/[token]/route';
import { rotateCalendarFeedToken } from '@/modules/calendar/application/calendar-feed-tokens';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase } from '../../setup/database';
import { applyPreparedMigrations } from '../../setup/pending-journal-migrations';
import { provisionTwoTenants } from '../../integration/projects/setup';

describe('ICS calendar feed token', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    testDbHolder.db = database;
    await applyPreparedMigrations(database, ['0188_task_collaboration']);
  });

  afterAll(async () => {
    testDbHolder.db = null;
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await applyPreparedMigrations(database, ['0188_task_collaboration']);
  });

  it('returns ICS for a valid token and 404 after revoke', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    let rawToken = '';
    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const rotated = await rotateCalendarFeedToken(context);
      rawToken = rotated.rawToken;
    });

    const okResponse = await GET(new Request('http://local/test'), {
      params: Promise.resolve({ token: rawToken }),
    });
    expect(okResponse.status).toBe(200);
    const body = await okResponse.text();
    expect(body).toContain('BEGIN:VCALENDAR');

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const { revokeCalendarFeedToken } = await import(
        '@/modules/calendar/application/calendar-feed-tokens'
      );
      await revokeCalendarFeedToken(context);
    });

    const revoked = await GET(new Request('http://local/test'), {
      params: Promise.resolve({ token: rawToken }),
    });
    expect(revoked.status).toBe(404);
  });
});
