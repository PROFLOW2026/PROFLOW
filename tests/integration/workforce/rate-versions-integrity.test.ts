import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  employees,
  organizationMemberships,
  organizations,
  profiles,
  rateVersions,
} from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { createRateVersion } from '@/modules/workforce/application/rate-versions';
import { resolveOrgContext } from '@/modules/tenancy';
import { businessDate } from '@/shared/dates';
import { createTestDatabase, type TestDatabase } from '../../setup/database';

describe('rate version integrity (MEDIUM-9)', () => {
  let database: TestDatabase;
  let orgId: string;
  let userId: string;
  let employeeId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    orgId = randomUUID();
    userId = randomUUID();
    employeeId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);

      await db.insert(profiles).values({
        id: userId,
        email: 'owner@example.test',
        displayName: 'Owner',
      });

      await db.insert(organizations).values({
        id: orgId,
        name: 'Workforce Co',
        baseCurrency: 'ILS',
        timezone: 'Asia/Jerusalem',
        countryCode: 'IL',
        defaultLocale: 'he-IL',
      });

      const membershipId = randomUUID();
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId,
        status: 'active',
      });

      const roles = await provisionOrganizationRoles(db, orgId);
      await assignRole(db, {
        organizationId: orgId,
        membershipId,
        userId,
        roleId: roles.owner,
      });

      await db.insert(employees).values({
        id: employeeId,
        organizationId: orgId,
        name: 'Worker',
        status: 'active',
      });

      await db.insert(rateVersions).values({
        organizationId: orgId,
        employeeId,
        validFrom: '2026-01-01',
        baseRate: '100',
        rateUnit: 'hourly',
        currency: 'ILS',
      });
    });
  });

  it('closes the prior open rate version when a new one starts later', async () => {
    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'en',
      });

      await createRateVersion(context, {
        employeeId,
        validFrom: businessDate('2026-07-01'),
        baseRate: '125',
        rateUnit: 'hourly',
      });
    });

    const versions = await database.asService(async (db) =>
      db
        .select({
          validFrom: rateVersions.validFrom,
          validTo: rateVersions.validTo,
          baseRate: rateVersions.baseRate,
        })
        .from(rateVersions)
        .where(sql`${rateVersions.employeeId} = ${employeeId}`)
        .orderBy(rateVersions.validFrom),
    );

    expect(versions).toEqual([
      { validFrom: '2026-01-01', validTo: '2026-06-30', baseRate: '100.000000' },
      { validFrom: '2026-07-01', validTo: null, baseRate: '125.000000' },
    ]);
  });

  it('rejects a new rate that would overlap the current open range at the database', async () => {
    await expect(
      database.asService(async (db) => {
        await db.execute(sql`SET ROLE service_role`);
        await db.insert(rateVersions).values({
          organizationId: orgId,
          employeeId,
          validFrom: '2026-01-01',
          baseRate: '150',
          rateUnit: 'hourly',
          currency: 'ILS',
        });
      }),
    ).rejects.toThrow();
  });

  it('corrects the open rate in place when Owner saves on or before the open start (retroactive)', async () => {
    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'en',
      });

      await createRateVersion(context, {
        employeeId,
        validFrom: businessDate('2026-01-01'),
        baseRate: '150',
        rateUnit: 'hourly',
      });
    });

    const versions = await database.asService(async (db) =>
      db
        .select({
          validFrom: rateVersions.validFrom,
          validTo: rateVersions.validTo,
          baseRate: rateVersions.baseRate,
        })
        .from(rateVersions)
        .where(sql`${rateVersions.employeeId} = ${employeeId}`)
        .orderBy(rateVersions.validFrom),
    );

    expect(versions).toEqual([
      { validFrom: '2026-01-01', validTo: null, baseRate: '150.000000' },
    ]);
  });
});
