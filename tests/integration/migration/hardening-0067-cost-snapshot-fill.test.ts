/**
 * Targeted SQL hardening for 0067 fill-only approved cost snapshots.
 * Does not apply migrations to Owner DB — uses PGlite only.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  employees,
  organizationMemberships,
  organizations,
  profiles,
  projects,
  rateVersions,
  timeEntries,
} from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { createTestDatabase, resultRows, type TestDatabase } from '../../setup/database';

function errorBlob(error: unknown): string {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  const e = error as {
    message?: string;
    detail?: string;
    code?: string;
    cause?: unknown;
  };
  return [e.message, e.detail, e.code, errorBlob(e.cause)].filter(Boolean).join('\n');
}

describe('0067 time entry cost snapshot fill lock', () => {
  let database: TestDatabase;
  let orgId: string;
  let ownerId: string;
  let workerId: string;
  let projectId: string;
  let employeeId: string;
  let otherEmployeeId: string;
  let rateId: string;
  let otherEmployeeRateId: string;
  let entryId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    orgId = randomUUID();
    ownerId = randomUUID();
    workerId = randomUUID();
    projectId = randomUUID();
    employeeId = randomUUID();
    otherEmployeeId = randomUUID();
    rateId = randomUUID();
    otherEmployeeRateId = randomUUID();
    entryId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);

      await db.insert(profiles).values([
        { id: ownerId, email: 'owner-0067@example.test', displayName: 'Owner' },
        { id: workerId, email: 'worker-0067@example.test', displayName: 'Worker' },
      ]);

      await db.insert(organizations).values({
        id: orgId,
        name: '0067 Org',
        baseCurrency: 'ILS',
        timezone: 'Asia/Jerusalem',
        countryCode: 'IL',
        defaultLocale: 'he-IL',
      });

      const ownerMembershipId = randomUUID();
      const workerMembershipId = randomUUID();
      await db.insert(organizationMemberships).values([
        { id: ownerMembershipId, organizationId: orgId, userId: ownerId, status: 'active' },
        { id: workerMembershipId, organizationId: orgId, userId: workerId, status: 'active' },
      ]);

      const roles = await provisionOrganizationRoles(db, orgId);
      await assignRole(db, {
        organizationId: orgId,
        membershipId: ownerMembershipId,
        userId: ownerId,
        roleId: roles.owner,
      });
      await assignRole(db, {
        organizationId: orgId,
        membershipId: workerMembershipId,
        userId: workerId,
        roleId: roles.worker,
      });

      await db.insert(projects).values({
        id: projectId,
        organizationId: orgId,
        name: 'Site',
        status: 'active',
        currency: 'ILS',
      });

      await db.insert(employees).values([
        { id: employeeId, organizationId: orgId, name: 'Emp A', status: 'active' },
        { id: otherEmployeeId, organizationId: orgId, name: 'Emp B', status: 'active' },
      ]);

      await db.insert(rateVersions).values([
        {
          id: rateId,
          organizationId: orgId,
          employeeId,
          validFrom: '2026-01-01',
          validTo: null,
          baseRate: '7500',
          rateUnit: 'monthly',
          currency: 'ILS',
        },
        {
          id: otherEmployeeRateId,
          organizationId: orgId,
          employeeId: otherEmployeeId,
          validFrom: '2026-01-01',
          validTo: null,
          baseRate: '8000',
          rateUnit: 'monthly',
          currency: 'ILS',
        },
      ]);

      await db.insert(timeEntries).values({
        id: entryId,
        organizationId: orgId,
        employeeId,
        workDate: '2026-08-10',
        hours: '8',
        kind: 'project',
        projectId,
        costAmount: null,
        costCurrency: null,
        rateVersionId: null,
        approvalStatus: 'approved',
        status: 'recorded',
        excessHours: '1',
        excessApprovalStatus: 'pending',
        clientRequestId: randomUUID(),
      });
    });
  });

  async function expectUpdateFails(
    userId: string,
    patchSql: ReturnType<typeof sql>,
    messagePart: string | RegExp,
  ) {
    await expect(
      database.asUser(userId, async (tx) => {
        await tx.execute(patchSql);
      }),
    ).rejects.toSatisfy((error) => {
      const blob = errorBlob(error);
      return typeof messagePart === 'string'
        ? blob.includes(messagePart)
        : messagePart.test(blob);
    });
  }

  it('1. authorized cost manager can fill approved null cost', async () => {
    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`
        update time_entries
        set cost_amount = 443.180000,
            cost_currency = 'ILS',
            rate_version_id = ${rateId}::uuid,
            updated_at = now()
        where id = ${entryId}::uuid
      `);
    });

    const rows = await database.asService(async (db) =>
      db.execute(sql`
        select cost_amount::text as cost_amount, cost_currency, rate_version_id::text as rate_version_id
        from time_entries where id = ${entryId}::uuid
      `),
    );
    const data = resultRows<{
      cost_amount: string;
      cost_currency: string;
      rate_version_id: string;
    }>(rows)[0]!;
    expect(Number(data.cost_amount)).toBeCloseTo(443.18, 2);
    expect(data.cost_currency).toBe('ILS');
    expect(data.rate_version_id).toBe(rateId);
  });

  it('2. normal worker cannot fill approved null cost', async () => {
    await expectUpdateFails(
      workerId,
      sql`
        update time_entries
        set cost_amount = 100, cost_currency = 'ILS', rate_version_id = ${rateId}::uuid
        where id = ${entryId}::uuid
      `,
      'workforce.cost.manage',
    );
  });

  it('3. existing non-null cost cannot be changed', async () => {
    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`
        update time_entries
        set cost_amount = 50, cost_currency = 'ILS', rate_version_id = ${rateId}::uuid
        where id = ${entryId}::uuid
      `);
    });
    await expectUpdateFails(
      ownerId,
      sql`
        update time_entries
        set cost_amount = 999
        where id = ${entryId}::uuid
      `,
      'approved time is locked',
    );
  });

  it('4–6. hours / project / work_date cannot change during cost fill', async () => {
    await expectUpdateFails(
      ownerId,
      sql`
        update time_entries
        set cost_amount = 10, cost_currency = 'ILS', hours = 9
        where id = ${entryId}::uuid
      `,
      'approved time is locked',
    );
    await expectUpdateFails(
      ownerId,
      sql`
        update time_entries
        set cost_amount = 10, cost_currency = 'ILS', project_id = ${randomUUID()}::uuid
        where id = ${entryId}::uuid
      `,
      'approved time is locked',
    );
    await expectUpdateFails(
      ownerId,
      sql`
        update time_entries
        set cost_amount = 10, cost_currency = 'ILS', work_date = '2026-07-01'
        where id = ${entryId}::uuid
      `,
      'approved time is locked',
    );
  });

  it('7. id cannot change during cost fill', async () => {
    const newId = randomUUID();
    await expectUpdateFails(
      ownerId,
      sql`
        update time_entries
        set id = ${newId}::uuid, cost_amount = 10, cost_currency = 'ILS'
        where id = ${entryId}::uuid
      `,
      'approved time is locked',
    );
  });

  it('8. voided_at cannot change during cost fill', async () => {
    await expectUpdateFails(
      ownerId,
      sql`
        update time_entries
        set cost_amount = 10, cost_currency = 'ILS', voided_at = now()
        where id = ${entryId}::uuid
      `,
      'approved time is locked',
    );
  });

  it('9. existing non-null currency cannot change on fill', async () => {
    const seeded = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(timeEntries).values({
        id: seeded,
        organizationId: orgId,
        employeeId,
        workDate: '2026-08-11',
        hours: '8',
        kind: 'project',
        projectId,
        costAmount: null,
        costCurrency: 'ILS',
        rateVersionId: null,
        approvalStatus: 'approved',
        status: 'recorded',
      });
    });

    await expectUpdateFails(
      ownerId,
      sql`
        update time_entries
        set cost_amount = 10, cost_currency = 'USD'
        where id = ${seeded}::uuid
      `,
      'approved time is locked',
    );

    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`
        update time_entries
        set cost_amount = 10, cost_currency = 'ILS'
        where id = ${seeded}::uuid
      `);
    });
  });

  it('10–11. rate from another employee blocked; same-employee rate accepted', async () => {
    await expectUpdateFails(
      ownerId,
      sql`
        update time_entries
        set cost_amount = 10, cost_currency = 'ILS', rate_version_id = ${otherEmployeeRateId}::uuid
        where id = ${entryId}::uuid
      `,
      'rate_version_id must belong',
    );

    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`
        update time_entries
        set cost_amount = 10, cost_currency = 'ILS', rate_version_id = ${rateId}::uuid
        where id = ${entryId}::uuid
      `);
    });
  });

  it('12–15. approved void works; cannot rewrite excess / client_request_id', async () => {
    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`
        update time_entries
        set status = 'void', voided_at = now()
        where id = ${entryId}::uuid
      `);
    });

    const voided = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(timeEntries).values({
        id: voided,
        organizationId: orgId,
        employeeId,
        workDate: '2026-08-12',
        hours: '8',
        kind: 'project',
        projectId,
        costAmount: '10',
        costCurrency: 'ILS',
        approvalStatus: 'approved',
        status: 'recorded',
        excessHours: '2',
        excessApprovalStatus: 'approved',
        clientRequestId: randomUUID(),
      });
    });

    await expectUpdateFails(
      ownerId,
      sql`
        update time_entries
        set status = 'void', voided_at = now(), excess_hours = 0
        where id = ${voided}::uuid
      `,
      'voiding approved time cannot rewrite history',
    );
    await expectUpdateFails(
      ownerId,
      sql`
        update time_entries
        set status = 'void', voided_at = now(), excess_approval_status = 'rejected'
        where id = ${voided}::uuid
      `,
      'voiding approved time cannot rewrite history',
    );
    await expectUpdateFails(
      ownerId,
      sql`
        update time_entries
        set status = 'void', voided_at = now(), client_request_id = ${randomUUID()}::uuid
        where id = ${voided}::uuid
      `,
      'voiding approved time cannot rewrite history',
    );

    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`
        update time_entries
        set status = 'void', voided_at = now()
        where id = ${voided}::uuid
      `);
    });
  });

  it('16. approved DELETE still blocked', async () => {
    await expect(
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`delete from time_entries where id = ${entryId}::uuid`);
      }),
    ).rejects.toSatisfy((error) => errorBlob(error).includes('cannot be deleted'));
  });
});
