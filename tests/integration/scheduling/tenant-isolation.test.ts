import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '@/modules/projects';
import {
  createBooking,
  createUnavailability,
  listBoard,
} from '@/modules/scheduling';
import { resolveOrgContext } from '@/modules/tenancy';
import { createEmployee } from '@/modules/workforce';
import { ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../projects/setup';

describe('scheduling tenant isolation and conflicts', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('keeps org A bookings out of org B and rejects cross-tenant employee ids', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const { bookingId, employeeAId } = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const employee = await createEmployee(context, { name: 'Ada Alpha', rateUnit: 'hourly' });
      const { projectId } = await createProject(context, { name: 'Alpha Site' });
      const result = await createBooking(context, {
        employeeId: employee.id,
        projectId,
        startAt: new Date('2026-08-15T08:00:00Z'),
        endAt: new Date('2026-08-15T12:00:00Z'),
        plannedHours: 4,
      });
      return { bookingId: result.booking.id, employeeAId: employee.id };
    });

    const boardB = await database.asUser(userB.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      return listBoard(context, { from: '2026-08-15', to: '2026-08-15', view: 'day' });
    });

    const seenIds = boardB.employees.flatMap((row) =>
      row.days.flatMap((day) => day.bookings.map((booking) => booking.id)),
    );
    expect(seenIds).not.toContain(bookingId);

    await expect(
      database.asUser(userB.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userB.id,
          organizationId: orgB.organization.id,
          locale: 'en',
        });
        await createBooking(context, {
          employeeId: employeeAId,
          startAt: new Date('2026-08-15T13:00:00Z'),
          endAt: new Date('2026-08-15T15:00:00Z'),
        });
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('blocks booking vs unavailability and warns on booking overlap until confirmed', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const employee = await createEmployee(context, { name: 'Noa', rateUnit: 'hourly' });

      await createUnavailability(context, {
        employeeId: employee.id,
        startDate: '2026-08-20',
        endDate: '2026-08-20',
        kind: 'leave',
      });

      await expect(
        createBooking(context, {
          employeeId: employee.id,
          startAt: new Date('2026-08-20T09:00:00Z'),
          endAt: new Date('2026-08-20T11:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);

      const first = await createBooking(context, {
        employeeId: employee.id,
        startAt: new Date('2026-08-21T08:00:00Z'),
        endAt: new Date('2026-08-21T12:00:00Z'),
        plannedHours: 10,
      });
      expect(first.overCapacity).toBe(true);

      await expect(
        createBooking(context, {
          employeeId: employee.id,
          startAt: new Date('2026-08-21T11:00:00Z'),
          endAt: new Date('2026-08-21T14:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(ConflictError);

      const confirmed = await createBooking(context, {
        employeeId: employee.id,
        startAt: new Date('2026-08-21T11:00:00Z'),
        endAt: new Date('2026-08-21T14:00:00Z'),
        confirmConflict: true,
      });
      expect(confirmed.overlappingBookingIds).toContain(first.booking.id);

      const board = await listBoard(context, {
        from: '2026-08-21',
        to: '2026-08-21',
        view: 'day',
      });
      const row = board.employees.find((entry) => entry.employeeId === employee.id);
      expect(row?.days[0]?.signal).toBe('conflict');
    });
  });
});
