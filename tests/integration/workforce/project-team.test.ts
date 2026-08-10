import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  employees,
  organizationMemberships,
  organizations,
  profiles,
  projects,
} from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { createEmployee } from '@/modules/workforce/application/employees';
import { getProjectLaborCost } from '@/modules/workforce/application/project-labor-cost';
import {
  addProjectTeamMember,
  listEmployeeProjectLinks,
  listProjectTeamMembers,
  removeProjectTeamMember,
} from '@/modules/workforce/application/project-team';
import { resolveOrgContext } from '@/modules/tenancy';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '../../setup/database';

describe('project team members', () => {
  let database: TestDatabase;
  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let projectAId: string;
  let projectBId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    orgAId = randomUUID();
    orgBId = randomUUID();
    userAId = randomUUID();
    userBId = randomUUID();
    projectAId = randomUUID();
    projectBId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);

      await db.insert(profiles).values([
        { id: userAId, email: 'owner-a@example.test', displayName: 'Owner A' },
        { id: userBId, email: 'owner-b@example.test', displayName: 'Owner B' },
      ]);

      await db.insert(organizations).values([
        {
          id: orgAId,
          name: 'Alpha Electrical',
          baseCurrency: 'ILS',
          timezone: 'Asia/Jerusalem',
          countryCode: 'IL',
          defaultLocale: 'he-IL',
        },
        {
          id: orgBId,
          name: 'Beta Construction',
          baseCurrency: 'ILS',
          timezone: 'Asia/Jerusalem',
          countryCode: 'IL',
          defaultLocale: 'he-IL',
        },
      ]);

      const membershipAId = randomUUID();
      const membershipBId = randomUUID();

      await db.insert(organizationMemberships).values([
        { id: membershipAId, organizationId: orgAId, userId: userAId, status: 'active' },
        { id: membershipBId, organizationId: orgBId, userId: userBId, status: 'active' },
      ]);

      const rolesA = await provisionOrganizationRoles(db, orgAId);
      const rolesB = await provisionOrganizationRoles(db, orgBId);

      await assignRole(db, {
        organizationId: orgAId,
        membershipId: membershipAId,
        userId: userAId,
        roleId: rolesA.owner,
      });
      await assignRole(db, {
        organizationId: orgBId,
        membershipId: membershipBId,
        userId: userBId,
        roleId: rolesB.owner,
      });

      await db.insert(projects).values([
        {
          id: projectAId,
          organizationId: orgAId,
          name: 'Site Alpha',
          status: 'active',
          currency: 'ILS',
        },
        {
          id: projectBId,
          organizationId: orgBId,
          name: 'Site Beta',
          status: 'active',
          currency: 'ILS',
        },
      ]);
    });
  });

  it('enforces unique (project_id, employee_id) membership', async () => {
    const employeeId = await database.asUser(userAId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userAId,
        organizationId: orgAId,
        locale: 'en',
      });
      const employee = await createEmployee(context, {
        name: 'Worker One',
        rateUnit: 'hourly',
      });
      await addProjectTeamMember(context, {
        projectId: projectAId,
        employeeId: employee.id,
        role: 'electrician',
      });
      return employee.id;
    });

    await expect(
      database.asUser(userAId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userAId,
          organizationId: orgAId,
          locale: 'en',
        });
        await addProjectTeamMember(context, {
          projectId: projectAId,
          employeeId,
        });
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    await database.asUser(userAId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userAId,
        organizationId: orgAId,
        locale: 'en',
      });
      const team = await listProjectTeamMembers(context, projectAId);
      expect(team).toHaveLength(1);
      expect(team[0]?.employeeId).toBe(employeeId);
      expect(team[0]?.role).toBe('electrician');
      expect(team[0]?.entryCount).toBe(0);
      expect(team[0]?.totalHours).toBe('0');
    });
  });

  it('assignment does not create labor Actual', async () => {
    await database.asUser(userAId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userAId,
        organizationId: orgAId,
        locale: 'en',
      });

      const before = await getProjectLaborCost(context, projectAId);
      expect(before.entryCount).toBe(0);
      expect(before.hasWorkforceData).toBe(false);
      expect(before.laborCost.amount).toBe('0.000000');

      const employee = await createEmployee(context, {
        name: 'Assigned Worker',
        rateUnit: 'hourly',
        baseRate: '120',
      });

      await addProjectTeamMember(context, {
        projectId: projectAId,
        employeeId: employee.id,
      });

      const after = await getProjectLaborCost(context, projectAId);
      expect(after.entryCount).toBe(0);
      expect(after.hasWorkforceData).toBe(false);
      expect(after.laborCost.amount).toBe('0.000000');
      expect(after.entriesMissingCost).toBe(0);

      const links = await listEmployeeProjectLinks(context, employee.id);
      expect(links).toHaveLength(1);
      expect(links[0]?.projectId).toBe(projectAId);
      expect(links[0]?.entryCount).toBe(0);
    });
  });

  it('prevents organization B from reading or mutating organization A team', async () => {
    const { membershipId, employeeId } = await database.asUser(userAId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userAId,
        organizationId: orgAId,
        locale: 'en',
      });
      const employee = await createEmployee(context, {
        name: 'Worker A',
        rateUnit: 'hourly',
      });
      const membership = await addProjectTeamMember(context, {
        projectId: projectAId,
        employeeId: employee.id,
      });
      return { membershipId: membership.id, employeeId: employee.id };
    });

    await database.asUser(userBId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userBId,
        organizationId: orgBId,
        locale: 'en',
      });

      await expect(listProjectTeamMembers(context, projectAId)).rejects.toBeInstanceOf(NotFoundError);
      await expect(listEmployeeProjectLinks(context, employeeId)).rejects.toBeInstanceOf(NotFoundError);

      await expect(
        addProjectTeamMember(context, {
          projectId: projectAId,
          employeeId,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      await expect(
        removeProjectTeamMember(context, { membershipId }),
      ).rejects.toBeInstanceOf(NotFoundError);

      // Org B employee cannot be assigned onto org A project via org B context either.
      const employeeB = await createEmployee(context, {
        name: 'Worker B',
        rateUnit: 'hourly',
      });
      await expect(
        addProjectTeamMember(context, {
          projectId: projectAId,
          employeeId: employeeB.id,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    await database.asUser(userAId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userAId,
        organizationId: orgAId,
        locale: 'en',
      });
      const team = await listProjectTeamMembers(context, projectAId);
      expect(team).toHaveLength(1);
      await removeProjectTeamMember(context, { membershipId });
      expect(await listProjectTeamMembers(context, projectAId)).toHaveLength(0);
    });
  });

  it('does not allow assigning an org B employee onto org A project', async () => {
    const employeeBId = await database.asService(async (db) => {
      const id = randomUUID();
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(employees).values({
        id,
        organizationId: orgBId,
        name: 'Cross Tenant',
        status: 'active',
      });
      return id;
    });

    await expect(
      database.asUser(userAId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userAId,
          organizationId: orgAId,
          locale: 'en',
        });
        await addProjectTeamMember(context, {
          projectId: projectAId,
          employeeId: employeeBId,
        });
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
